import Settings from "../models/Settings.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';
import { storeLog } from "../helpers/Common.js";


export const index = async (req, res) => {
    try{
        const { perPage, before, after, isNext } = req.query;
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
        const lowStockThreshold = 5;

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

        // const products = productsInfo.map(edge => {
        //     const product = edge.node;
        
        //     // Check if total inventory is low
        //     const isLowTotalInventory = product.totalInventory > 0 && product.totalInventory < lowStockThreshold;
        
        //     // OR check if any variant is low stock
        //     const hasLowStockVariant = product.variants.edges.some(variantEdge => {
        //         const qty = variantEdge.node.inventoryQuantity;
        //         return qty > 0 && qty < lowStockThreshold;
        //     });
        
        //     return {
        //         ...edge,
        //         node: {
        //           ...product,
        //           lowStock: isLowTotalInventory || hasLowStockVariant
        //         }
        //       };
        // });

        // (Optional) filter low stock products if needed
        // const lowStockProducts = products.filter(product => product.lowStock);
        // const products = products1.filter(product => product.node.totalInventory <= 5);

        return successResponse(res, {products, pageInfo});      
    } catch (error) {
        // console.log( error.response?.data || error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}


