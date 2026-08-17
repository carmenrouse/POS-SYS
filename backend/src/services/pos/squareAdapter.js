// Square adapter: maps our internal clean schema to Square's Catalog +
// Inventory APIs. New SKUs become a Catalog ITEM + ITEM_VARIATION (created
// only when the caller has confirmed it, per pushRows' `action`); known SKUs
// get an inventory ADJUSTMENT recording the received quantity.
//
// Square rejects an entire catalog batch-upsert (or inventory batch-create)
// if any single object in it is invalid, which would otherwise sink an
// entire import over one bad row. We chunk requests and, if a chunk fails,
// retry its rows individually via the single-object endpoints so one bad
// row doesn't take out its neighbors.
const crypto = require('crypto');
const fetch = require('node-fetch');

const BATCH_SIZE = 25;
const SQUARE_VERSION = '2024-08-21';

function baseUrl() {
  return process.env.SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

function headers(connection) {
  return {
    Authorization: `Bearer ${connection.accessToken}`,
    'Content-Type': 'application/json',
    'Square-Version': SQUARE_VERSION,
  };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function squareRequest(connection, path, body) {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: headers(connection),
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.errors?.map((e) => e.detail).join('; ') || `HTTP ${response.status}`;
    const err = new Error(message);
    err.squareErrors = json.errors;
    throw err;
  }
  return json;
}

function catalogObjectFor(row) {
  const tempItemId = `#item-${row.importRowId}`;
  return {
    type: 'ITEM',
    id: tempItemId,
    itemData: {
      name: row.mappedData.name,
      variations: [
        {
          type: 'ITEM_VARIATION',
          id: `#var-${row.importRowId}`,
          itemVariationData: {
            itemId: tempItemId,
            name: 'Regular',
            pricingType: 'FIXED_PRICING',
            priceMoney: { amount: Math.round(Number(row.mappedData.unitCost) * 100), currency: 'USD' },
            sku: row.mappedData.sku,
          },
        },
      ],
    },
  };
}

async function createOneProduct(connection, row) {
  const json = await squareRequest(connection, '/v2/catalog/object', {
    idempotencyKey: crypto.randomUUID(),
    object: catalogObjectFor(row),
  });
  const variationId = json.catalogObject?.itemData?.variations?.[0]?.id;
  if (!variationId) throw new Error('Square did not return a variation id');

  if (connection.externalLocationId && row.mappedData.quantity > 0) {
    await squareRequest(connection, '/v2/inventory/changes/batch-create', {
      idempotencyKey: crypto.randomUUID(),
      changes: [
        {
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId: variationId,
            locationId: connection.externalLocationId,
            quantity: String(row.mappedData.quantity),
            state: 'IN_STOCK',
            occurredAt: new Date().toISOString(),
          },
        },
      ],
    });
  }
  return variationId;
}

async function createProductsChunked(connection, rows, results) {
  for (const batch of chunk(rows, BATCH_SIZE)) {
    try {
      const json = await squareRequest(connection, '/v2/catalog/batch-upsert', {
        idempotencyKey: crypto.randomUUID(),
        batches: [{ objects: batch.map(catalogObjectFor) }],
      });
      const created = json.objects || [];
      for (const row of batch) {
        const tempId = `#item-${row.importRowId}`;
        const match = created.find((o) => o.id !== tempId && o.itemData?.name === row.mappedData.name);
        const variationId = match?.itemData?.variations?.[0]?.id;
        if (variationId) {
          results.push({ importRowId: row.importRowId, success: true, externalId: variationId, action: 'CREATE_PRODUCT' });
        } else {
          results.push({ importRowId: row.importRowId, success: false, error: 'Square did not confirm this item was created', action: 'CREATE_PRODUCT' });
        }
      }
    } catch (batchErr) {
      // The whole chunk was rejected (often one bad row) — retry one at a time so
      // the rest of the chunk isn't lost with it.
      for (const row of batch) {
        try {
          const variationId = await createOneProduct(connection, row);
          results.push({ importRowId: row.importRowId, success: true, externalId: variationId, action: 'CREATE_PRODUCT' });
        } catch (rowErr) {
          results.push({ importRowId: row.importRowId, success: false, error: rowErr.message, action: 'CREATE_PRODUCT' });
        }
      }
    }
  }
}

async function updateInventoryChunked(connection, rows, results) {
  if (!connection.externalLocationId) {
    for (const row of rows) {
      results.push({ importRowId: row.importRowId, success: false, error: 'No location configured on this POS connection', action: 'UPDATE_INVENTORY' });
    }
    return;
  }

  for (const batch of chunk(rows, 100)) {
    try {
      await squareRequest(connection, '/v2/inventory/changes/batch-create', {
        idempotencyKey: crypto.randomUUID(),
        changes: batch.map((row) => ({
          type: 'ADJUSTMENT',
          adjustment: {
            catalogObjectId: row.matchedProduct.externalId,
            locationId: connection.externalLocationId,
            fromState: 'NONE',
            toState: 'IN_STOCK',
            quantity: String(row.mappedData.quantity),
            occurredAt: new Date().toISOString(),
          },
        })),
      });
      for (const row of batch) {
        results.push({ importRowId: row.importRowId, success: true, externalId: row.matchedProduct.externalId, action: 'UPDATE_INVENTORY' });
      }
    } catch (batchErr) {
      for (const row of batch) {
        try {
          await squareRequest(connection, '/v2/inventory/changes/batch-create', {
            idempotencyKey: crypto.randomUUID(),
            changes: [
              {
                type: 'ADJUSTMENT',
                adjustment: {
                  catalogObjectId: row.matchedProduct.externalId,
                  locationId: connection.externalLocationId,
                  fromState: 'NONE',
                  toState: 'IN_STOCK',
                  quantity: String(row.mappedData.quantity),
                  occurredAt: new Date().toISOString(),
                },
              },
            ],
          });
          results.push({ importRowId: row.importRowId, success: true, externalId: row.matchedProduct.externalId, action: 'UPDATE_INVENTORY' });
        } catch (rowErr) {
          results.push({ importRowId: row.importRowId, success: false, error: rowErr.message, action: 'UPDATE_INVENTORY' });
        }
      }
    }
  }
}

async function testConnection(connection) {
  if (!connection.accessToken) return { ok: false, error: 'No access token configured' };
  try {
    const response = await fetch(`${baseUrl()}/v2/locations`, { headers: headers(connection) });
    const body = await response.json();
    if (!response.ok) {
      return { ok: false, error: body.errors?.[0]?.detail || `HTTP ${response.status}` };
    }
    return { ok: true, locations: body.locations?.map((l) => ({ id: l.id, name: l.name })) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * @param {object} connection POSConnection row (must have accessToken)
 * @param {Array<{importRowId, action: 'CREATE_PRODUCT'|'UPDATE_INVENTORY', mappedData, matchedProduct}>} rows
 * @returns {Promise<{results: Array<{importRowId, success, externalId?, error?, action}>}>}
 */
async function pushRows(connection, rows) {
  const results = [];
  const toCreate = rows.filter((r) => r.action === 'CREATE_PRODUCT');
  const toUpdate = rows.filter((r) => r.action === 'UPDATE_INVENTORY');

  if (toCreate.length > 0) await createProductsChunked(connection, toCreate, results);
  if (toUpdate.length > 0) await updateInventoryChunked(connection, toUpdate, results);

  return { results };
}

module.exports = { platform: 'SQUARE', testConnection, pushRows, catalogObjectFor };
