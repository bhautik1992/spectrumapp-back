import Settings from "../models/Settings.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';
import { storeLog } from "../helpers/Common.js";
import { lowStockThreshold } from '../config/constants.js';

export const index = async (req, res) => {
    try{
        const { perPage, before, after, isNext, filter } = req.query;
        let cursorClause = `first: ${perPage}`; 
        
        if(isNext !== undefined){
            if(isNext === 'true'){
                cursorClause = ` first: ${perPage}, after: "${after}"`;
            }else{
                cursorClause = ` last: ${perPage}, before: "${before}"`;
            }
        }

        const settings = await Settings.findOne();
        const { sp_app_url: url, admin_api_access_token: token } = settings;

        if (filter == 0 || filter == 1) {
            
            if(filter == 1){
                cursorClause += `, query: "inventory_total:<=${lowStockThreshold}"`;
            }
        
            const query = {
                query: `query {
                    products(${cursorClause}) {
                        edges {
                            node {
                                id
                                title
                                vendor
                                productType
                                totalInventory
                                tracksInventory
                                status
                                hasOnlyDefaultVariant
                                variantsCount{
                                    count
                                }
                                category{
                                    id
                                    name
                                }
                                variants(first: 250) {
                                    edges {
                                        node {
                                            id
                                            title
                                            inventoryQuantity
                                        }
                                    }
                                    pageInfo {
                                        hasNextPage
                                        startCursor
                                        endCursor
                                        hasPreviousPage
                                    }
                                }
                            }
                        }
                        pageInfo {
                            hasNextPage
                            startCursor
                            endCursor
                            hasPreviousPage
                        }
                    }
                    productsCount {
                        count
                    }
                }`
            };

            const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,query,{
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });

            const products = response.data?.data?.products?.edges || [];
            const pageInfo = response.data?.data?.products?.pageInfo || {};
            const total = response.data?.data?.productsCount?.count || 0;

            return successResponse(res, {products, pageInfo, total});   
        }else{
            const dateStr = getDateFilter(filter);
                        
            const orders = {
                query: `query {
                    orders(${cursorClause}, query: "created_at:>=${dateStr}") {
                        edges {
                            node {
                                id
                                createdAt
                                lineItems(first: 250) {
                                    edges {
                                        node {
                                            quantity
                                            product {
                                                id
                                                title
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        pageInfo {
                            hasNextPage
                            startCursor
                            endCursor
                            hasPreviousPage
                        }
                    }
                }`
            };

            const ordersResp = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,orders,{
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });
            
            const salesMap   = {};
            const orderEdges = ordersResp.data?.data?.orders?.edges || [];
            const pageInfo   = ordersResp.data?.data?.orders?.pageInfo || {};

            orderEdges.forEach(order => {
                order.node.lineItems.edges.forEach(item => {

                    const productId = item.node.product?.id;
                    if (!productId) return;

                    if (!salesMap[productId]) {
                        salesMap[productId] = {
                            id: productId,
                            title: item.node.product.title,
                            quantity: 0
                        };
                    }

                    salesMap[productId].quantity += item.node.quantity;
                });
            });

            // Return top 100 selling products in last one month
            const sortedProducts = Object.values(salesMap).sort((a, b) => b.quantity - a.quantity);
            const topProducts    = sortedProducts.slice(0, 100);
            const productIds     = topProducts.map(p => p.id);

            if (!productIds.length) {
                return successResponse(res, {products:[], pageInfo: {} , total: 0});
            }

            const query = {
                query: `query {
                    nodes(ids: ${JSON.stringify(productIds)}) {
                        ... on Product {
                            id
                            title
                            vendor
                            productType
                            totalInventory
                            tracksInventory
                            status
                            hasOnlyDefaultVariant
                            variantsCount{
                                count
                            }
                            category{
                                id
                                name
                            }
                            variants(first: 250) {
                                edges {
                                    node {
                                        id
                                        title
                                        inventoryQuantity
                                    }
                                }
                                pageInfo {
                                    hasNextPage
                                    startCursor
                                    endCursor
                                    hasPreviousPage
                                }
                            }
                        }
                    }
                }`
            };

            const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,query,{
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });

            const products = (response.data?.data?.nodes || []).map(p => ({
                node: {
                    ...p,
                    qty: salesMap[p.id]?.quantity || 0
                }
            }));

            return successResponse(res, {products, pageInfo, total:products.length});
        }  
    } catch (error) {
        // console.log( error.response?.data || error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}

function getDateFilter(filter) { 
    const date = new Date(); 
    
    if (filter == 2 || filter == 3) { 
        date.setMonth(date.getMonth() - 1);
    } else if (filter == 4 || filter == 5) { 
        date.setMonth(date.getMonth() - 2); 
    } 
    
    return date.toISOString().split('T')[0]; 
}


