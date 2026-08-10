import axios from 'axios';
import Customers from "../models/Customers.js";
import Settings from "../models/Settings.js";
import { errorResponse } from '../helpers/ResponseHandler.js';
import { storeLog } from "../helpers/Common.js";
import { leadStatusLabels, BIG_SPENDER_SEGMENT_IDS } from '../config/constants.js';

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape quotes and wrap with quotes if needed
  const needsQuotes = /[",\n\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const UTF8_BOM = '\uFEFF';

const currencySymbolMap = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  INR: '₹',
};

const sanitizeFileName = (value) => {
  if (!value) return 'segment';
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '_') || 'segment';
};

const formatInsightDate = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()] || '';
  const year = date.getFullYear();

  return `${day} ${month}, ${year}`;
};

const normalizeCustomerGid = (memberId) => {
  if (!memberId || typeof memberId !== 'string') return null;
  if (memberId.includes('/Customer/')) return memberId;
  if (memberId.includes('/CustomerSegmentMember/')) {
    return memberId.replace('/CustomerSegmentMember/', '/Customer/');
  }

  return null;
};

const BIG_SPENDER_SEGMENT_MONTHS = {
  [BIG_SPENDER_SEGMENT_IDS[0]]: 3,
  [BIG_SPENDER_SEGMENT_IDS[1]]: 6,
  [BIG_SPENDER_SEGMENT_IDS[2]]: 12,
};

const parseLinkHeaderNextUrl = (linkHeader) => {
  if (!linkHeader) return null;
  const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
  return nextMatch ? nextMatch[1] : null;
};

const getWindowStartIso = (months) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() - months);
  return date.toISOString();
};

const extractNumericCustomerId = (customerGid) => {
  if (!customerGid || typeof customerGid !== 'string') return null;
  const match = customerGid.match(/\/(\d+)$/);
  return match ? match[1] : null;
};

const getDefaultWindowMetrics = () => ({
  amount: 0,
  currencyCode: null,
  orderCount: 0,
});

const calculateWindowMetricsForCustomers = async ({ customerIds, months, shopUrl, headers }) => {
  const targetCustomerIds = new Set((customerIds || []).map((id) => String(id)).filter(Boolean));
  const metricsByCustomerId = new Map();
  if (!targetCustomerIds.size) return metricsByCustomerId;

  const createdAtMin = encodeURIComponent(getWindowStartIso(months));
  let nextUrl = `${shopUrl}/admin/api/2025-07/orders.json?status=any&limit=250&fields=id,total_price,currency,customer&created_at_min=${createdAtMin}`;

  while (nextUrl) {
    const response = await requestWithRetry(
      {
        method: 'get',
        url: nextUrl,
        headers,
      },
      3
    );

    const orders = response?.data?.orders || [];
    orders.forEach((order) => {
      const customerId = order?.customer?.id ? String(order.customer.id) : null;
      if (!customerId || !targetCustomerIds.has(customerId)) return;

      const current = metricsByCustomerId.get(customerId) || getDefaultWindowMetrics();
      const orderAmount = parseFloat(order?.total_price || 0);
      if (!Number.isNaN(orderAmount)) {
        current.amount += orderAmount;
      }
      current.orderCount += 1;
      if (!current.currencyCode && order?.currency) {
        current.currencyCode = order.currency;
      }

      metricsByCustomerId.set(customerId, current);
    });

    nextUrl = parseLinkHeaderNextUrl(response?.headers?.link);
  }

  return metricsByCustomerId;
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const parseShopifyBody = (raw) => {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getRetryDelayMs = (error, attempt) => {
  const retryAfterHeader = error?.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfterHeader);

  if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  // Backoff: 600ms, 1200ms, 1800ms...
  return 600 * attempt;
};

const requestWithRetry = async (config, maxAttempts = 3) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await axios(config);
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const canRetry = status === 429 || (status >= 500 && status < 600);

      if (!canRetry || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt);
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export const listCustomersExport = async (req, res) => {
  try {
    const { search = '' } = req.query;
    const normalizedSearch = String(search).trim();
    const regex = new RegExp(normalizedSearch, 'i');

    const leadSourceMap = {
      1: 'Web',
      2: 'Phone Inquiry',
      3: 'Partner - Referral',
      4: 'Purchased - List',
      5: 'Other',
    };

    const matchingLeadStatus = Object.entries(leadStatusLabels)
      .filter(([_, label]) => label.toLowerCase().includes(normalizedSearch.toLowerCase()))
      .map(([value]) => parseInt(value, 10));

    const matchingLeadSource = Object.entries(leadSourceMap)
      .filter(([_, label]) => label.toLowerCase().includes(normalizedSearch.toLowerCase()))
      .map(([value]) => parseInt(value, 10));

    const matchConditions = [];

    if (normalizedSearch !== '') {
      matchConditions.push({
        $or: [
          { shopify_cus_id: regex },
          { salesforce_lead_id: regex },
          { lead_first_name: regex },
          { lead_last_name: regex },
          { lead_company: regex },
          { lead_email: regex },
          { lead_phone: regex },
          { full_name: regex },
          ...(matchingLeadStatus.length > 0 ? [{ lead_status: { $in: matchingLeadStatus } }] : []),
          ...(matchingLeadSource.length > 0 ? [{ lead_source: { $in: matchingLeadSource } }] : []),
        ],
      });
    }

    const matchStage = matchConditions.length > 0 ? { $match: { $and: matchConditions } } : { $match: {} };

    const result = await Customers.aggregate([
      {
        $addFields: {
          full_name: {
            $concat: [
              { $ifNull: ['$lead_first_name', ''] },
              ' ',
              { $ifNull: ['$lead_last_name', ''] },
            ],
          },
        },
      },
      matchStage,
      { $sort: { _id: -1 } },
      { $project: { __v: 0 } },
    ]);

    const settings = await Settings.findOne();
    if (!settings) return errorResponse(res, 'Settings not found', 500);

    const { sp_app_url, admin_api_access_token } = settings;

    const headers = {
      'X-Shopify-Access-Token': admin_api_access_token,
      'Content-Type': 'application/json',
    };

    // Fetch live customer values in bulk to keep CSV aligned with Customers list view.
    const uniqueCustomerIds = [
      ...new Set(
        result
          .map((customer) => String(customer.shopify_cus_id || '').trim())
          .filter((id) => id)
      ),
    ];

    const liveCustomerMap = new Map();
    const customerIdChunks = chunkArray(uniqueCustomerIds, 100);

    for (const customerChunk of customerIdChunks) {
      try {
        const customersResponse = await requestWithRetry(
          {
            method: 'get',
            url: `${sp_app_url}/admin/api/2025-07/customers.json?limit=250&fields=id,created_at,total_spent,orders_count,last_order_id&ids=${customerChunk.join(',')}`,
            headers,
          },
          3
        );

        const customers = customersResponse?.data?.customers || [];
        for (const liveCustomer of customers) {
          if (liveCustomer?.id) {
            liveCustomerMap.set(String(liveCustomer.id), liveCustomer);
          }
        }
      } catch (error) {
        storeLog(`Customer export: bulk customer fetch failed for chunk size ${customerChunk.length}. Error: ${error.message}`);
      }
    }

    const baseCustomers = result.map((customer) => {
      const importedShopifyBody = parseShopifyBody(customer.shopify_request_body);
      const liveCustomer = liveCustomerMap.get(String(customer.shopify_cus_id));

      return {
        ...customer,
        customer_added_date: liveCustomer?.created_at || importedShopifyBody?.created_at || null,
        amount_spent: liveCustomer?.total_spent ?? importedShopifyBody?.total_spent ?? '0.00',
        orders_count: liveCustomer?.orders_count ?? importedShopifyBody?.orders_count ?? 0,
        last_order_date: importedShopifyBody?.last_order?.created_at || null,
        _last_order_id: liveCustomer?.last_order_id
          ? String(liveCustomer.last_order_id)
          : (importedShopifyBody?.last_order_id ? String(importedShopifyBody.last_order_id) : null),
      };
    });

    // Resolve last order dates in bulk instead of per-customer requests.
    const uniqueOrderIds = [
      ...new Set(
        baseCustomers
          .map((customer) => customer._last_order_id)
          .filter((id) => id)
      ),
    ];

    const orderCreatedAtMap = new Map();
    const orderIdChunks = chunkArray(uniqueOrderIds, 100);

    for (const orderChunk of orderIdChunks) {
      try {
        const ordersResponse = await requestWithRetry(
          {
            method: 'get',
            url: `${sp_app_url}/admin/api/2025-07/orders.json?status=any&limit=250&fields=id,created_at&ids=${orderChunk.join(',')}`,
            headers,
          },
          3
        );

        const orders = ordersResponse?.data?.orders || [];
        for (const order of orders) {
          if (order?.id) {
            orderCreatedAtMap.set(String(order.id), order.created_at || null);
          }
        }
      } catch (error) {
        storeLog(`Customer export: bulk order fetch failed for chunk size ${orderChunk.length}. Error: ${error.message}`);
      }
    }

    const enrichedCustomers = baseCustomers.map((customer) => {
      const resolvedLastOrderDate = customer._last_order_id
        ? (orderCreatedAtMap.get(customer._last_order_id) || customer.last_order_date)
        : customer.last_order_date;

      return {
        ...customer,
        last_order_date: resolvedLastOrderDate || null,
      };
    });

    const csvHeaders = [
      'Name',
      'Email',
      'Phone',
      'Orders',
      'Amount Spent',
      'Last Order',
      'Created At',
      'Status',
    ];

    const rows = enrichedCustomers.map((row) => {
      const formatDate = (d) => {
        if (d === null || d === undefined || d === '') return '';
        try {
          const dt = new Date(d);
          if (Number.isNaN(dt.getTime())) return '';
          const year = dt.getFullYear();
          const month = String(dt.getMonth() + 1).padStart(2, '0');
          const day = String(dt.getDate()).padStart(2, '0');
          // Use ISO so Excel doesn't drop/convert values based on locale.
          return `${year}-${month}-${day}`;
        } catch {
          return '';
        }
      };

      const amountSpent = row.amount_spent === null || row.amount_spent === undefined ? '0.00' : row.amount_spent;

      const phoneValue = row.lead_phone === null || row.lead_phone === undefined
        ? ''
        : String(row.lead_phone);

      const phoneCsv = phoneValue ? `\t${phoneValue}` : '';

      return [
        row.full_name || '',
        row.lead_email || '',
        phoneCsv,
        row.orders_count ?? 0,
        amountSpent,
        formatDate(row.last_order_date),
        formatDate(row.customer_added_date),
        (() => {
          const raw = row.lead_status;
          return leadStatusLabels[raw] || leadStatusLabels[String(raw)] || '';
        })(),
      ];
    });

    const csvLines = [
      csvHeaders.map(csvEscape).join(','),
      ...rows.map((r) => r.map(csvEscape).join(',')),
    ];

    const csv = `${UTF8_BOM}${csvLines.join('\n')}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    return errorResponse(res, process.env.ERROR_MSG || 'CSV export failed', 500);
  }
};

export const listSegmentMembersExport = async (req, res) => {
  try {
    const { id, segmentName = 'segment' } = req.query;
    const spenderWindowMonths = BIG_SPENDER_SEGMENT_MONTHS[id] || null;
    const sortClause = spenderWindowMonths
      ? 'sortKey: "amount_spent", reverse: true'
      : 'sortKey: "updated_at", reverse: true';

    if (!id) {
      return errorResponse(res, 'Segment id is required', 400);
    }

    const settings = await Settings.findOne();
    if (!settings) return errorResponse(res, 'Settings not found', 500);

    const { sp_app_url: url, admin_api_access_token: token } = settings;

    const headers = {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    };

    const csvHeaders = [
      'Customer Name',
      'Phone',
      'Email',
      'Email subscription',
      'Location',
      'Orders',
      'Added Date',
      'Amount Spent',
    ];

    const safeSegmentName = sanitizeFileName(segmentName);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customer_insights_${safeSegmentName}.csv"`);
    res.write(`${UTF8_BOM}${csvHeaders.map(csvEscape).join(',')}\n`);

    const fetchAllMembers = async () => {
      const allMembers = [];
      let hasNextPage = true;
      let afterCursor = null;
      const pageSize = 250;

      while (hasNextPage) {
        const cursorClause = afterCursor
          ? `first: ${pageSize}, after: \"${afterCursor}\"`
          : `first: ${pageSize}`;

        const query = {
          query: `query {
            customerSegmentMembers(segmentId: "${id}", ${sortClause}, ${cursorClause}) {
              edges {
                cursor
                node {
                  id
                  displayName
                  defaultEmailAddress {
                    emailAddress
                    marketingState
                  }
                  defaultAddress {
                    city
                    country
                  }
                  amountSpent {
                    amount
                    currencyCode
                  }
                  defaultPhoneNumber {
                    phoneNumber
                  }
                  numberOfOrders
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`,
        };

        const response = await requestWithRetry(
          {
            method: 'post',
            url: `${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,
            headers,
            data: query,
          },
          3
        );

        const members = response?.data?.data?.customerSegmentMembers?.edges || [];
        const pageInfo = response?.data?.data?.customerSegmentMembers?.pageInfo || {};

        allMembers.push(...members);
        hasNextPage = !!pageInfo?.hasNextPage;
        afterCursor = pageInfo?.endCursor || null;
      }

      return allMembers;
    };

    const allMembers = await fetchAllMembers();

    let orderedMembers = allMembers;
    if (spenderWindowMonths) {
      const customerIds = [...new Set(
        allMembers
          .map((edge) => extractNumericCustomerId(normalizeCustomerGid(edge?.node?.id)))
          .filter(Boolean)
      )];

      const metricsByCustomerId = await calculateWindowMetricsForCustomers({
        customerIds,
        months: spenderWindowMonths,
        shopUrl: url,
        headers,
      });

      orderedMembers = allMembers.map((edge) => {
        const customerId = extractNumericCustomerId(normalizeCustomerGid(edge?.node?.id));
        const windowMetrics = (customerId && metricsByCustomerId.get(customerId)) || getDefaultWindowMetrics();
        const fallbackCurrency = edge?.node?.amountSpent?.currencyCode || windowMetrics.currencyCode || 'GBP';

        return {
          ...edge,
          node: {
            ...edge.node,
            numberOfOrders: windowMetrics.orderCount,
            amountSpent: {
              amount: windowMetrics.amount.toFixed(2),
              currencyCode: fallbackCurrency,
            },
          }
        };
      });

      orderedMembers.sort((a, b) => {
        const amountA = parseFloat(a?.node?.amountSpent?.amount || 0);
        const amountB = parseFloat(b?.node?.amountSpent?.amount || 0);
        return amountB - amountA;
      });
    }

    const customerIds = [...new Set(
      orderedMembers
        .map((edge) => normalizeCustomerGid(edge?.node?.id))
        .filter(Boolean)
    )];

    const createdAtByCustomerId = new Map();

    for (let i = 0; i < customerIds.length; i += 250) {
      const chunk = customerIds.slice(i, i + 250);
      const customerNodesQuery = {
        query: `query {
          nodes(ids: ${JSON.stringify(chunk)}) {
            ... on Customer {
              id
              createdAt
            }
          }
        }`,
      };

      const customerNodesResponse = await requestWithRetry(
        {
          method: 'post',
          url: `${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,
          headers,
          data: customerNodesQuery,
        },
        3
      );

      const nodes = customerNodesResponse?.data?.data?.nodes || [];
      nodes.forEach((node) => {
        if (node?.id && node?.createdAt) {
          createdAtByCustomerId.set(node.id, node.createdAt);
        }
      });
    }

    for (const edge of orderedMembers) {
      const node = edge?.node || {};
      const city = node?.defaultAddress?.city || '';
      const country = node?.defaultAddress?.country || '';
      const location = [city, country].filter(Boolean).join(', ');

      const amount = node?.amountSpent?.amount || '';
      const currencyCode = node?.amountSpent?.currencyCode || '';
      const currencyPrefix = currencySymbolMap[currencyCode] || currencyCode;
      const amountSpent = amount && currencyCode ? `${currencyPrefix}${amount}` : '';

      const phoneValue = node?.defaultPhoneNumber?.phoneNumber || '';
      const phoneCsv = phoneValue ? `\t${phoneValue}` : '';
      const customerId = normalizeCustomerGid(node?.id);
      const addedDate = customerId ? formatInsightDate(createdAtByCustomerId.get(customerId) || null) : '';

      const row = [
        node?.displayName || '',
        phoneCsv,
        node?.defaultEmailAddress?.emailAddress || '',
        node?.defaultEmailAddress?.marketingState || '',
        location,
        node?.numberOfOrders ?? 0,
        addedDate,
        amountSpent,
      ];

      res.write(`${row.map(csvEscape).join(',')}\n`);
    }

    return res.end();
  } catch (error) {
    storeLog(`Segment export failed: ${error.message}`);

    if (!res.headersSent) {
      return errorResponse(res, process.env.ERROR_MSG || 'CSV export failed', 500);
    }

    return res.end();
  }
};


