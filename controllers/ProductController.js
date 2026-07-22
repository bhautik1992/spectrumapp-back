import Settings from "../models/Settings.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';
import { storeLog } from "../helpers/Common.js";
import { lowStockThreshold } from '../config/constants.js';

const UTF8_BOM = '\uFEFF';

const csvEscape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const needsQuotes = /[",\n\r]/.test(str);
    const escaped = str.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
};

const parsePickerRange = (picker) => {
    if (!picker) return null;

    if (Array.isArray(picker)) {
        return picker;
    }

    if (typeof picker === 'string') {
        try {
            const parsed = JSON.parse(picker);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            const splitByComma = picker.split(',').map((d) => d.trim()).filter(Boolean);
            if (splitByComma.length >= 2) return splitByComma;
        }
    }

    return null;
};

const formatInventoryText = (node, filter) => {
    if (!node?.tracksInventory) {
        return 'Inventory not tracked';
    }

    if (String(filter) === '1') {
        const variants = node?.variants?.edges || [];

        if (node?.hasOnlyDefaultVariant) {
            const qty = variants[0]?.node?.inventoryQuantity ?? 0;
            return `${qty} in stock`;
        }

        const lowStockVariants = variants.filter(
            (variant) => (variant.node?.inventoryQuantity ?? 0) <= lowStockThreshold
        );

        if (!lowStockVariants.length) return '';

        return lowStockVariants
            .map((variant) => `${variant.node?.title || ''} - ${variant.node?.inventoryQuantity ?? 0}`)
            .join(' | ');
    }

    if (['2', '3'].includes(String(filter))) {
        const variants = node?.variants?.edges || [];
        if (!variants.length) return '';

        return variants
            .map((variant) => `${variant.node?.title || ''} - ${variant.node?.inventoryQuantity ?? 0}`)
            .join(' | ');
    }

    const totalInventory = node?.totalInventory ?? 0;
    const hasOnlyDefaultVariant = node?.hasOnlyDefaultVariant;
    const variantsCount = node?.variantsCount?.count ?? 0;

    if (hasOnlyDefaultVariant) {
        return `${totalInventory} in stock`;
    }

    return `${totalInventory} in stock for ${variantsCount} variant${variantsCount > 1 ? 's' : ''}`;
};

const formatSoldVariantsText = (soldVariants = []) => {
    if (!soldVariants.length) return '-';

    return soldVariants
        .map((variant) => `${variant.title || ''} - Sold ${variant.quantity || 0}`)
        .join(' | ');
};

const hasAnyLowStockVariant = (productNode) => {
    const variants = productNode?.variants?.edges || [];
    return variants.some((variant) => (variant.node?.inventoryQuantity ?? 0) <= lowStockThreshold);
};

const decodeSimpleCursor = (cursor) => {
    try {
        return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch {
        return null;
    }
};

const encodeSimpleCursor = (item) => {
    return Buffer.from(JSON.stringify({ last_id: item?.node?.id || item?.id || '' })).toString('base64');
};

const fetchAllProductsWithVariants = async (url, headers) => {
    let after = null;
    let hasNextPage = true;
    const allProducts = [];

    while (hasNextPage) {
        const productsArgs = after ? `first: 250, after: "${after}"` : `first: 250`;

        const query = {
            query: `query {
                products(${productsArgs}) {
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
                            variantsCount { count }
                            category { id name }
                            variants(first: 250) {
                                edges {
                                    node {
                                        id
                                        title
                                        inventoryQuantity
                                    }
                                }
                            }
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }`
        };

        const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, query, { headers });
        const edges = response.data?.data?.products?.edges || [];
        allProducts.push(...edges);

        const pageInfo = response.data?.data?.products?.pageInfo || {};
        hasNextPage = !!pageInfo.hasNextPage;
        after = pageInfo.endCursor || null;
    }

    return allProducts;
};

function getCurrentQuarter() {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year  = today.getFullYear();

    let quarter;

    if (month >= 1 && month <= 3) quarter = 1;
    else if (month >= 4 && month <= 6) quarter = 2;
    else if (month >= 7 && month <= 9) quarter = 3;
    else quarter = 4;

    return { year, quarter };
}

function getQuarterDates(year, quarter) {
    const quarters = {
        1: [`${year}-01-01`, `${year}-03-31`],
        2: [`${year}-04-01`, `${year}-06-30`],
        3: [`${year}-07-01`, `${year}-09-30`],
        4: [`${year}-10-01`, `${year}-12-31`],
    };
    
    return quarters[quarter];
}

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

        if (filter == 0) {
        
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
        } else if (filter == 1) {
            const allProducts = await fetchAllProductsWithVariants(url, {
                'X-Shopify-Access-Token': token,
                'Content-Type': 'application/json'
            });

            const lowStockProducts = allProducts.filter((edge) => hasAnyLowStockVariant(edge?.node));
            const perPageInt = parseInt(perPage, 10);

            let startIndex = 0;
            if (after && isNext === 'true') {
                const decoded = decodeSimpleCursor(after);
                if (decoded) {
                    const idx = lowStockProducts.findIndex((p) => p.node?.id === decoded.last_id);
                    startIndex = idx >= 0 ? idx + 1 : 0;
                }
            } else if (before && isNext === 'false') {
                const decoded = decodeSimpleCursor(before);
                if (decoded) {
                    const idx = lowStockProducts.findIndex((p) => p.node?.id === decoded.last_id);
                    startIndex = idx - perPageInt >= 0 ? idx - perPageInt : 0;
                }
            }

            const endIndex = startIndex + perPageInt;
            const products = lowStockProducts.slice(startIndex, endIndex);

            const pageInfo = {
                hasNextPage: endIndex < lowStockProducts.length,
                hasPreviousPage: startIndex > 0,
                startCursor: products[0] ? encodeSimpleCursor(products[0]) : null,
                endCursor: products[products.length - 1] ? encodeSimpleCursor(products[products.length - 1]) : null,
            };

            return successResponse(res, { products, pageInfo, total: lowStockProducts.length });
        }else if (filter == 4) {
            const { year, quarter } = getCurrentQuarter();

            const [startCurrent, endCurrent] = getQuarterDates(year, quarter);
            const [startPrev, endPrev]       = getQuarterDates(year - 1, quarter);

            const salesCurrent = await fetchSalesMap(url, token, startCurrent, endCurrent);
            const salesPrev    = await fetchSalesMap(url, token, startPrev, endPrev);

            const comparison = [];
            const allIds = new Set([...Object.keys(salesCurrent), ...Object.keys(salesPrev)]);

            allIds.forEach(id => {
                comparison.push({
                    id,
                    title: salesCurrent[id]?.title || salesPrev[id]?.title || "",
                    currentQty: salesCurrent[id]?.quantity || 0,
                    prevQty: salesPrev[id]?.quantity || 0,
                    difference:
                        (salesCurrent[id]?.quantity || 0) -
                        (salesPrev[id]?.quantity || 0),
                    percentage:
                        (salesPrev[id]?.quantity || 0) === 0
                            ? null
                            : (
                                ((salesCurrent[id]?.quantity || 0) -
                                (salesPrev[id]?.quantity || 0)) /
                                (salesPrev[id]?.quantity || 0)
                            ) * 100,
                    trend:
                        (salesCurrent[id]?.quantity || 0) >
                        (salesPrev[id]?.quantity || 0)
                            ? "up"
                            : (salesCurrent[id]?.quantity || 0) <
                            (salesPrev[id]?.quantity || 0)
                            ? "down"
                            : "same"
                });
            });

            comparison.sort((a, b) => b.currentQty - a.currentQty);

            const decodeCursor = cursor => {
                try { return JSON.parse(Buffer.from(cursor, "base64").toString("utf8")); }
                catch { return null; }
            };

            let startIndex = 0;
            const perPageInt = parseInt(perPage);

            if (after && isNext === "true") {
                const decoded = decodeCursor(after);
                if (decoded) {
                    const idx = comparison.findIndex(i => i.id === decoded.last_id);
                    startIndex = idx >= 0 ? idx + 1 : 0;
                }
            } else if (before && isNext === "false") {
                const decoded = decodeCursor(before);
                if (decoded) {
                    const idx = comparison.findIndex(i => i.id === decoded.last_id);
                    startIndex = idx - perPageInt >= 0 ? idx - perPageInt : 0;
                }
            }

            const endIndex = startIndex + perPageInt;
            const paginated = comparison.slice(startIndex, endIndex);

            const encodeCursor = item =>
                Buffer.from(JSON.stringify({ last_id: item.id })).toString("base64");

            const pageInfo = {
                hasNextPage: endIndex < comparison.length,
                hasPreviousPage: startIndex > 0,
                startCursor: paginated[0] ? encodeCursor(paginated[0]) : null,
                endCursor: paginated[paginated.length - 1] ? encodeCursor(paginated[paginated.length - 1]) : null
            };

            return successResponse(res, {products: paginated, pageInfo, total: comparison.length}); 
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
                                                variant {
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
                                quantity: 0,
                                variants: {}
                            };
                        }

                        salesMap[productId].quantity += item.node.quantity;

                        const variantId = item.node.variant?.id;
                        const variantTitle = item.node.variant?.title;

                        if (variantId) {
                            if (!salesMap[productId].variants[variantId]) {
                                salesMap[productId].variants[variantId] = {
                                    id: variantId,
                                    title: variantTitle,
                                    quantity: 0
                                };
                            }

                            salesMap[productId].variants[variantId].quantity += item.node.quantity;
                        }
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
                    qty: salesMap[p.id]?.quantity || 0,
                    soldVariants: Object.values(
                        salesMap[p.id]?.variants || {}
                    )
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

async function fetchSalesMap(url, token, startDate, endDate) {
    const dateFilter = `created_at:>=${startDate} AND created_at:<=${endDate}`;

    const salesMap = {};
    let afterCursor = null;
    let hasNext = true;

    while (hasNext) {
        const cursorClause = afterCursor 
            ? `first: 250, after: "${afterCursor}"`
            : `first: 250`;

        const query = {
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
                                        product { id title }
                                    }
                                }
                            }
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }`
        };

        const resp = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, query, {
            headers: {
                'X-Shopify-Access-Token': token,
                'Content-Type': 'application/json'
            }
        });

        const edges = resp.data?.data?.orders?.edges || [];

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

        const pageInfo = resp.data?.data?.orders?.pageInfo;
        hasNext = pageInfo?.hasNextPage;
        afterCursor = pageInfo?.endCursor;
    }

    return salesMap;
}

export const exportStockReport = async (req, res) => {
    try {
        const { filter = 0, picker } = req.query;
        const settings = await Settings.findOne();
        if (!settings) {
            return errorResponse(res, 'Settings not found', 500);
        }

        const { sp_app_url: url, admin_api_access_token: token } = settings;
        const headers = {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
        };

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="stock_report.csv"');

        if (String(filter) === '4') {
            const { year, quarter } = getCurrentQuarter();
            const [startCurrent, endCurrent] = getQuarterDates(year, quarter);
            const [startPrev, endPrev] = getQuarterDates(year - 1, quarter);

            const salesCurrent = await fetchSalesMap(url, token, startCurrent, endCurrent);
            const salesPrev = await fetchSalesMap(url, token, startPrev, endPrev);

            const allIds = new Set([...Object.keys(salesCurrent), ...Object.keys(salesPrev)]);
            const comparison = [];

            allIds.forEach((id) => {
                const currentQty = salesCurrent[id]?.quantity || 0;
                const prevQty = salesPrev[id]?.quantity || 0;
                const diff = currentQty - prevQty;

                comparison.push({
                    title: salesCurrent[id]?.title || salesPrev[id]?.title || '',
                    currentQty,
                    prevQty,
                    difference: diff,
                    percentage: prevQty === 0 ? null : (diff / prevQty) * 100,
                    trend: currentQty > prevQty ? 'up' : currentQty < prevQty ? 'down' : 'same',
                });
            });

            comparison.sort((a, b) => b.currentQty - a.currentQty);

            const csvHeaders = [
                'Product',
                'Current Quarter Sold Qty',
                'Previous Year Quarter Sold Qty',
                'Difference',
                'Percentage Change',
                'Trend',
            ];

            const csvLines = [
                csvHeaders.map(csvEscape).join(','),
                ...comparison.map((row) => [
                    row.title,
                    row.currentQty,
                    row.prevQty,
                    row.difference,
                    row.percentage === null ? '—' : `${Number(row.percentage).toFixed(1)}%`,
                    row.trend === 'up' ? 'Up' : row.trend === 'down' ? 'Down' : 'Same',
                ].map(csvEscape).join(','))
            ];

            return res.status(200).send(`${UTF8_BOM}${csvLines.join('\n')}`);
        }

        if (String(filter) === '0') {
            const products = [];
            let after = null;
            let hasNextPage = true;

            while (hasNextPage) {
                let productsArgs = `first: 250`;
                if (after) {
                    productsArgs += `, after: "${after}"`;
                }

                const query = {
                    query: `query {
                        products(${productsArgs}) {
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
                                    variantsCount { count }
                                    category { id name }
                                    variants(first: 250) {
                                        edges {
                                            node {
                                                id
                                                title
                                                inventoryQuantity
                                            }
                                        }
                                    }
                                }
                            }
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                        }
                    }`
                };

                const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, query, { headers });

                const edges = response.data?.data?.products?.edges || [];
                products.push(...edges);

                const pageInfo = response.data?.data?.products?.pageInfo || {};
                hasNextPage = !!pageInfo.hasNextPage;
                after = pageInfo.endCursor || null;
            }

            const csvHeaders = ['Product', 'Status', 'Inventory', 'Category', 'Type', 'Vendor'];
            const csvLines = [
                csvHeaders.map(csvEscape).join(','),
                ...products.map((edge) => {
                    const node = edge?.node || {};
                    return [
                        node.title || '—',
                        node.status || '',
                        formatInventoryText(node, filter),
                        node?.category?.name || '',
                        node.productType || '',
                        node.vendor || '',
                    ].map(csvEscape).join(',');
                })
            ];

            return res.status(200).send(`${UTF8_BOM}${csvLines.join('\n')}`);
        }

        if (String(filter) === '1') {
            const allProducts = await fetchAllProductsWithVariants(url, headers);
            const lowStockProducts = allProducts.filter((edge) => hasAnyLowStockVariant(edge?.node));

            const csvHeaders = ['Product', 'Status', 'Inventory', 'Category', 'Type', 'Vendor'];
            const csvLines = [
                csvHeaders.map(csvEscape).join(','),
                ...lowStockProducts.map((edge) => {
                    const node = edge?.node || {};
                    return [
                        node.title || '—',
                        node.status || '',
                        formatInventoryText(node, filter),
                        node?.category?.name || '',
                        node.productType || '',
                        node.vendor || '',
                    ].map(csvEscape).join(',');
                })
            ];

            return res.status(200).send(`${UTF8_BOM}${csvLines.join('\n')}`);
        }

        const parsedPicker = parsePickerRange(picker);
        if (!parsedPicker || parsedPicker.length < 2) {
            return errorResponse(res, 'Date range is required', 400);
        }

        const startDate = new Date(parsedPicker[0]).toISOString().split('T')[0];
        const endDate = new Date(parsedPicker[1]).toISOString().split('T')[0];
        const dateFilter = `created_at:>=${startDate} AND created_at:<=${endDate}`;

        const salesMap = {};
        let afterCursorFetch = null;
        let hasNextPageFetch = true;

        while (hasNextPageFetch) {
            const cursorClause = afterCursorFetch ? `first: 250, after: "${afterCursorFetch}"` : `first: 250`;

            const orders = {
                query: `query {
                    orders(${cursorClause}, query: "${dateFilter}") {
                        edges {
                            node {
                                lineItems(first: 250) {
                                    edges {
                                        node {
                                            quantity
                                            product { id title }
                                            variant { id title }
                                        }
                                    }
                                }
                            }
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }`
            };

            const ordersResp = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, orders, { headers });
            const edges = ordersResp.data?.data?.orders?.edges || [];

            edges.forEach((order) => {
                order.node.lineItems.edges.forEach((item) => {
                    const productId = item.node.product?.id;
                    if (!productId) return;

                    if (!salesMap[productId]) {
                        salesMap[productId] = {
                            id: productId,
                            title: item.node.product.title,
                            quantity: 0,
                            variants: {}
                        };
                    }

                    salesMap[productId].quantity += item.node.quantity;

                    const variantId = item.node.variant?.id;
                    const variantTitle = item.node.variant?.title;

                    if (variantId) {
                        if (!salesMap[productId].variants[variantId]) {
                            salesMap[productId].variants[variantId] = {
                                id: variantId,
                                title: variantTitle,
                                quantity: 0
                            };
                        }

                        salesMap[productId].variants[variantId].quantity += item.node.quantity;
                    }
                });
            });

            const pageInfoResp = ordersResp.data?.data?.orders?.pageInfo || {};
            hasNextPageFetch = !!pageInfoResp.hasNextPage;
            afterCursorFetch = pageInfoResp.endCursor || null;
        }

        const sortedProducts = Object.values(salesMap).sort((a, b) => {
            if (String(filter) === '2') return b.quantity - a.quantity;
            return a.quantity - b.quantity;
        });

        const productIds = sortedProducts.map((p) => p.id);
        const chunkSize = 250;
        const detailChunks = [];
        for (let i = 0; i < productIds.length; i += chunkSize) {
            detailChunks.push(productIds.slice(i, i + chunkSize));
        }

        const detailRequests = detailChunks.map((chunk) => {
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
                            variantsCount { count }
                            category { id name }
                            variants(first: 250) {
                                edges {
                                    node {
                                        id
                                        title
                                        inventoryQuantity
                                    }
                                }
                            }
                        }
                    }
                }`
            };

            return axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, query, { headers });
        });

        const detailResponses = await Promise.all(detailRequests);
        const allProductDetails = detailResponses.flatMap((response) => response.data?.data?.nodes || []);

        const detailById = new Map(allProductDetails.filter(Boolean).map((p) => [p.id, p]));

        const rows = sortedProducts.map((product) => {
            const detail = detailById.get(product.id) || {};
            const node = {
                ...detail,
                qty: product.quantity || 0,
                soldVariants: Object.values(product.variants || {})
            };

            return {
                product: node.title || product.title || '—',
                status: node.status || '',
                qty: node.qty || 0,
                soldVariants: formatSoldVariantsText(node.soldVariants),
                inventory: formatInventoryText(node, filter),
                category: node?.category?.name || '',
                type: node.productType || '',
                vendor: node.vendor || '',
            };
        });

        const csvHeaders = ['Product', 'Status', 'Qty', 'Variant Sold', 'Inventory', 'Category', 'Type', 'Vendor'];
        const csvLines = [
            csvHeaders.map(csvEscape).join(','),
            ...rows.map((row) => [
                row.product,
                row.status,
                row.qty,
                row.soldVariants,
                row.inventory,
                row.category,
                row.type,
                row.vendor,
            ].map(csvEscape).join(','))
        ];

        return res.status(200).send(`${UTF8_BOM}${csvLines.join('\n')}`);
    } catch (error) {
        storeLog(`Stock report export failed: ${error.message}`);
        return errorResponse(res, process.env.ERROR_MSG || 'CSV export failed', 500);
    }
};

