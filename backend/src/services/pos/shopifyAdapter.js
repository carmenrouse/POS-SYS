// Shopify adapter: maps our internal clean schema to the Shopify Admin REST
// API. New SKUs become a Product + default Variant; known SKUs get an
// inventory level adjustment recording the received quantity.
//
// Unlike Square, Shopify's REST Admin API has no bulk-upsert — each product
// create or inventory adjustment is already its own independent request, so
// there's no "one bad row poisons the whole batch" failure mode to guard
// against here. The real Shopify quirk is its strict rate limit (2
// requests/sec on the standard REST limit); a 429 includes a Retry-After
// header, so we honor it with one retry per row rather than hammering the
// API into a longer backoff.
const fetch = require('node-fetch');
const { ApiError } = require('../../middleware/errorHandler');

const API_VERSION = '2024-01';

function shopUrl(connection, path) {
  const shopDomain = connection.config?.shopDomain;
  if (!shopDomain) throw new Error('No shop domain configured on this POS connection (config.shopDomain)');
  return `https://${shopDomain}/admin/api/${API_VERSION}${path}`;
}

function headers(connection) {
  return {
    'X-Shopify-Access-Token': connection.accessToken,
    'Content-Type': 'application/json',
  };
}

async function shopifyRequest(connection, method, path, body) {
  const url = shopUrl(connection, path);
  const response = await fetch(url, { method, headers: headers(connection), body: body ? JSON.stringify(body) : undefined });

  if (response.status === 429) {
    const parsed = Number(response.headers.get('retry-after'));
    const retryAfter = Number.isFinite(parsed) ? parsed : 2; // default only when the header is missing/unparseable, not when it's legitimately 0
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return shopifyRequest(connection, method, path, body);
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.errors ? JSON.stringify(json.errors) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return json;
}

async function createOneProduct(connection, row) {
  const json = await shopifyRequest(connection, 'POST', '/products.json', {
    product: {
      title: row.mappedData.name,
      variants: [
        {
          sku: row.mappedData.sku,
          price: String(row.mappedData.unitCost),
          inventory_management: 'shopify',
          inventory_quantity: row.mappedData.quantity,
        },
      ],
    },
  });
  const variant = json.product?.variants?.[0];
  if (!variant?.inventory_item_id) throw new Error('Shopify did not return an inventory item id');
  return String(variant.inventory_item_id);
}

async function updateOneInventory(connection, row) {
  if (!connection.externalLocationId) throw new Error('No location configured on this POS connection');
  await shopifyRequest(connection, 'POST', '/inventory_levels/adjust.json', {
    location_id: Number(connection.externalLocationId),
    inventory_item_id: Number(row.matchedProduct.externalId),
    available_adjustment: row.mappedData.quantity,
  });
}

async function testConnection(connection) {
  if (!connection.accessToken) return { ok: false, error: 'No access token configured' };
  if (!connection.config?.shopDomain) return { ok: false, error: 'No shop domain configured (config.shopDomain)' };
  try {
    const json = await shopifyRequest(connection, 'GET', '/shop.json');
    return { ok: true, shop: json.shop?.name };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * @param {object} connection POSConnection row — accessToken, externalLocationId,
 *   config.shopDomain (e.g. "my-store.myshopify.com")
 * @param {Array<{importRowId, action, mappedData, matchedProduct}>} rows
 */
async function pushRows(connection, rows) {
  const results = [];
  for (const row of rows) {
    try {
      if (row.action === 'CREATE_PRODUCT') {
        const inventoryItemId = await createOneProduct(connection, row);
        results.push({ importRowId: row.importRowId, success: true, externalId: inventoryItemId, action: 'CREATE_PRODUCT' });
      } else {
        await updateOneInventory(connection, row);
        results.push({ importRowId: row.importRowId, success: true, externalId: row.matchedProduct.externalId, action: 'UPDATE_INVENTORY' });
      }
    } catch (err) {
      results.push({ importRowId: row.importRowId, success: false, error: err.message, action: row.action });
    }
  }
  return { results };
}

module.exports = { platform: 'SHOPIFY', testConnection, pushRows };
