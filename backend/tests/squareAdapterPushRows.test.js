jest.mock('node-fetch');
const fetch = require('node-fetch');
const { pushRows } = require('../src/services/pos/squareAdapter');

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const connection = { accessToken: 'token', externalLocationId: 'LOC1' };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('squareAdapter.pushRows — CREATE_PRODUCT', () => {
  test('a successful batch-upsert reports every row created with its variation id', async () => {
    fetch.mockImplementation(async (url, opts) => {
      expect(url).toContain('/v2/catalog/batch-upsert');
      return jsonResponse(200, {
        objects: [
          { id: 'real-item-1', itemData: { name: 'Eggs', variations: [{ id: 'real-var-1' }] } },
          { id: 'real-item-2', itemData: { name: 'Chicken', variations: [{ id: 'real-var-2' }] } },
        ],
      });
    });

    const rows = [
      { importRowId: 'r1', action: 'CREATE_PRODUCT', mappedData: { sku: 'E1', name: 'Eggs', unitCost: 4.5, quantity: 10 } },
      { importRowId: 'r2', action: 'CREATE_PRODUCT', mappedData: { sku: 'C1', name: 'Chicken', unitCost: 9, quantity: 5 } },
    ];

    const { results } = await pushRows(connection, rows);

    expect(results).toEqual([
      { importRowId: 'r1', success: true, externalId: 'real-var-1', action: 'CREATE_PRODUCT' },
      { importRowId: 'r2', success: true, externalId: 'real-var-2', action: 'CREATE_PRODUCT' },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1); // one batch call, no per-row fallback needed
  });

  test('a rejected batch falls back to per-row calls, isolating the one bad row', async () => {
    let call = 0;
    fetch.mockImplementation(async (url) => {
      call += 1;
      if (url.includes('/v2/catalog/batch-upsert')) {
        // The whole batch is rejected because one row is bad.
        return jsonResponse(400, { errors: [{ detail: 'One or more objects failed validation' }] });
      }
      if (url.includes('/v2/catalog/object')) {
        // Per-row fallback: second row succeeds, first (the "bad" one) still fails.
        if (call === 2) return jsonResponse(400, { errors: [{ detail: 'Invalid SKU' }] });
        return jsonResponse(200, { catalogObject: { itemData: { variations: [{ id: 'real-var-good' }] } } });
      }
      if (url.includes('/v2/inventory/changes/batch-create')) {
        return jsonResponse(200, {});
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const rows = [
      { importRowId: 'bad-row', action: 'CREATE_PRODUCT', mappedData: { sku: 'BAD', name: 'Bad', unitCost: 1, quantity: 1 } },
      { importRowId: 'good-row', action: 'CREATE_PRODUCT', mappedData: { sku: 'GOOD', name: 'Good', unitCost: 1, quantity: 1 } },
    ];

    const { results } = await pushRows(connection, rows);

    const byRow = Object.fromEntries(results.map((r) => [r.importRowId, r]));
    expect(byRow['bad-row'].success).toBe(false);
    expect(byRow['bad-row'].error).toMatch(/Invalid SKU/);
    expect(byRow['good-row'].success).toBe(true);
    expect(byRow['good-row'].externalId).toBe('real-var-good');
  });
});

describe('squareAdapter.pushRows — UPDATE_INVENTORY', () => {
  test('reports success for every row when the batch inventory call succeeds', async () => {
    fetch.mockImplementation(async (url) => {
      expect(url).toContain('/v2/inventory/changes/batch-create');
      return jsonResponse(200, {});
    });

    const rows = [
      {
        importRowId: 'r1',
        action: 'UPDATE_INVENTORY',
        mappedData: { sku: 'E1', name: 'Eggs', unitCost: 4.5, quantity: 20 },
        matchedProduct: { externalId: 'existing-var-1' },
      },
    ];

    const { results } = await pushRows(connection, rows);
    expect(results).toEqual([{ importRowId: 'r1', success: true, externalId: 'existing-var-1', action: 'UPDATE_INVENTORY' }]);
  });

  test('fails every row with a clear reason when no location is configured', async () => {
    const rows = [
      {
        importRowId: 'r1',
        action: 'UPDATE_INVENTORY',
        mappedData: { sku: 'E1', name: 'Eggs', unitCost: 4.5, quantity: 20 },
        matchedProduct: { externalId: 'existing-var-1' },
      },
    ];

    const { results } = await pushRows({ accessToken: 'token', externalLocationId: null }, rows);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toMatch(/location/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
