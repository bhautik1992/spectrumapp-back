import Settings from "../models/Settings.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';
import { storeLog } from "../helpers/Common.js";
import { lowStockThreshold } from '../config/constants.js';

export const index = async (req, res) => {
    try{
        const { perPage, before, after, isNext, filter, picker } = req.query;
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
            let startDate    = new Date(picker[0]).toISOString().split("T")[0];
            let endDate      = new Date(picker[1]).toISOString().split("T")[0];
            const dateFilter = `created_at:>=${startDate} AND created_at:<=${endDate}`;
        
            const salesMap = {};
            let afterCursorFetch = null;
            let hasNextPageFetch = true;

            // Step 1: Fetch all orders in the date range
            while (hasNextPageFetch) {
                const cursorClause = afterCursorFetch ? `first: 250, after: "${afterCursorFetch}"` : `first: 250`;

                // orders(${cursorClause}, query: "created_at:>=${dateStr}") {
                const orders = {
                    query: `query {
                        orders(${cursorClause}, query: "${dateFilter}") {
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

                const ordersResp = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, orders, {
                    headers: { 
                        'X-Shopify-Access-Token': token,
                        'Content-Type': 'application/json'
                    }
                });

                const edges = ordersResp.data?.data?.orders?.edges || [];

                // Step 2: Aggregate product quantities
                edges.forEach(order => {
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

                const pageInfoResp = ordersResp.data?.data?.orders?.pageInfo || {};
                hasNextPageFetch = pageInfoResp.hasNextPage;
                afterCursorFetch = pageInfoResp.endCursor;
            }

            // Step 3: Sort products by quantity
            let sortedProducts = Object.values(salesMap);
            if (filter == 2) sortedProducts.sort((a, b) => b.quantity - a.quantity);
            else if (filter == 3) sortedProducts.sort((a, b) => a.quantity - b.quantity);

            // Step 4: Manual cursor-based pagination
            const decodeCursor = (cursor) => {
                try { return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')); } 
                catch { return null; }
            };

            let startIndex = 0;
            if (after && isNext === 'true') {
                const decoded = decodeCursor(after);
                if (decoded) {
                    const idx = sortedProducts.findIndex(p => p.id === decoded.last_id);
                    startIndex = idx >= 0 ? idx + 1 : 0;
                }
            } else if (before && isNext === 'false') {
                const decoded = decodeCursor(before);
                if (decoded) {
                    const idx = sortedProducts.findIndex(p => p.id === decoded.last_id);
                    startIndex = idx - parseInt(perPage) >= 0 ? idx - parseInt(perPage) : 0;
                }
            }

            const endIndex          = startIndex + parseInt(perPage);
            const paginatedProducts = sortedProducts.slice(startIndex, endIndex);
            const productIds        = paginatedProducts.map(p => p.id);
            const total             = sortedProducts.length;

            if (!productIds.length) return successResponse(res, { products: [], pageInfo: {}, total: 0 });

            // Step 5: Fetch product details from Shopify
            const chunkSize = 250;
            let allProductDetails = [];
            for (let i = 0; i < productIds.length; i += chunkSize) {
                const chunk = productIds.slice(i, i + chunkSize);

                const query = {
                    query: `query {
                        nodes(ids: ${JSON.stringify(chunk)}) {
                            ... on Product {
                                id
                                title
                                vendor
                                productType
                                totalInventory
                                tracksInventory
                                status
                                hasOnlyDefaultVariant
                                variantsCount { 
                                    count 
                                }
                                category { 
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

                const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, query, {
                    headers: { 
                        'X-Shopify-Access-Token': token,
                        'Content-Type': 'application/json'
                    }
                });

                allProductDetails = allProductDetails.concat(response.data?.data?.nodes || []);
            }

            // Step 6: Build Shopify-style pageInfo
            const encodeCursor = (product) => {
                return Buffer.from(JSON.stringify({ last_id: product.id, last_value: product.quantity })).toString('base64');
            };

            const pageInfo = {
                hasNextPage: endIndex < total,
                hasPreviousPage: startIndex > 0,
                startCursor: paginatedProducts[0] ? encodeCursor(paginatedProducts[0]) : null,
                endCursor: paginatedProducts[paginatedProducts.length - 1] ? encodeCursor(paginatedProducts[paginatedProducts.length - 1]) : null
            };

            const products = allProductDetails.map(p => ({
                node: {
                    ...p,
                    qty: salesMap[p.id]?.quantity || 0
                }
            }));

            // Step 7: Return response
            return successResponse(res, {products, pageInfo, total});
        }
    } catch (error) {
        // console.log( error.response?.data || error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}


