jest.mock('node-fetch');
const fetch = require('node-fetch');
const { pushRows, testConnection } = require('../src/services/pos/shopifyAdapter');

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] },
    json: async () => body,
  };
}

const connection = {
  accessToken: 'token',
  externalLocationId: '999',
  config: { shopDomain: 'test-shop.myshopify.com' },
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('shopifyAdapter.pushRows — CREATE_PRODUCT', () => {
  test('maps a row to a Shopify product+variant and captures the inventory item id', async () => {
    fetch.mockImplementation(async (url, opts) => {
      expect(url).toBe('https://test-shop.myshopify.com/admin/api/2024-01/products.json');
      const body = JSON.parse(opts.body);
      expect(body.product.title).toBe('Large Eggs (Dozen)');
      expect(body.product.variants[0]).toEqual({
        sku: 'EGG-001',
        price: '4.5',
        inventory_management: 'shopify',
        inventory_quantity: 120,
      });
      return jsonResponse(201, { product: { variants: [{ inventory_item_id: 555111 }] } });
    });

    const rows = [
      { importRowId: 'r1', action: 'CREATE_PRODUCT', mappedData: { sku: 'EGG-001', name: 'Large Eggs (Dozen)', unitCost: 4.5, quantity: 120 } },
    ];
    const { results } = await pushRows(connection, rows);
    expect(results).toEqual([{ importRowId: 'r1', success: true, externalId: '555111', action: 'CREATE_PRODUCT' }]);
  });

  test('isolates a per-row failure without affecting other rows (no shared batch)', async () => {
    fetch.mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.product.variants[0].sku === 'BAD') {
        return jsonResponse(422, { errors: { title: ["can't be blank"] } });
      }
      return jsonResponse(201, { product: { variants: [{ inventory_item_id: 1 }] } });
    });

    const rows = [
      { importRowId: 'bad', action: 'CREATE_PRODUCT', mappedData: { sku: 'BAD', name: '', unitCost: 1, quantity: 1 } },
      { importRowId: 'good', action: 'CREATE_PRODUCT', mappedData: { sku: 'GOOD', name: 'Good', unitCost: 1, quantity: 1 } },
    ];
    const { results } = await pushRows(connection, rows);
    const byRow = Object.fromEntries(results.map((r) => [r.importRowId, r]));
    expect(byRow.bad.success).toBe(false);
    expect(byRow.good.success).toBe(true);
  });
});

describe('shopifyAdapter.pushRows — UPDATE_INVENTORY', () => {
  test('adjusts inventory by the received quantity at the configured location', async () => {
    fetch.mockImplementation(async (url, opts) => {
      expect(url).toBe('https://test-shop.myshopify.com/admin/api/2024-01/inventory_levels/adjust.json');
      expect(JSON.parse(opts.body)).toEqual({ location_id: 999, inventory_item_id: 555111, available_adjustment: 20 });
      return jsonResponse(200, {});
    });

    const rows = [
      {
        importRowId: 'r1',
        action: 'UPDATE_INVENTORY',
        mappedData: { sku: 'EGG-001', name: 'Eggs', unitCost: 4.5, quantity: 20 },
        matchedProduct: { externalId: '555111' },
      },
    ];
    const { results } = await pushRows(connection, rows);
    expect(results).toEqual([{ importRowId: 'r1', success: true, externalId: '555111', action: 'UPDATE_INVENTORY' }]);
  });
});

describe('shopifyAdapter rate limiting', () => {
  test('retries once after honoring a 429 Retry-After header', async () => {
    let call = 0;
    fetch.mockImplementation(async () => {
      call += 1;
      if (call === 1) return jsonResponse(429, {}, { 'retry-after': '0' });
      return jsonResponse(201, { product: { variants: [{ inventory_item_id: 42 }] } });
    });

    const rows = [{ importRowId: 'r1', action: 'CREATE_PRODUCT', mappedData: { sku: 'X', name: 'X', unitCost: 1, quantity: 1 } }];
    const { results } = await pushRows(connection, rows);
    expect(call).toBe(2);
    expect(results[0].success).toBe(true);
  });
});

describe('shopifyAdapter.testConnection', () => {
  test('fails clearly when no shop domain is configured', async () => {
    const result = await testConnection({ accessToken: 'x', config: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/shop domain/i);
  });

  test('succeeds and returns the shop name on a valid response', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { shop: { name: 'Test Shop' } }));
    const result = await testConnection(connection);
    expect(result).toEqual({ ok: true, shop: 'Test Shop' });
  });
});
