const { catalogObjectFor } = require('../src/services/pos/squareAdapter');

describe('squareAdapter payload mapping', () => {
  test('catalogObjectFor maps a clean row to a Square ITEM + ITEM_VARIATION', () => {
    const row = {
      importRowId: 'row-1',
      mappedData: { sku: 'EGG-001', name: 'Large Eggs (Dozen)', unitCost: 4.5, quantity: 120 },
    };

    const object = catalogObjectFor(row);

    expect(object.type).toBe('ITEM');
    expect(object.id).toBe('#item-row-1');
    expect(object.itemData.name).toBe('Large Eggs (Dozen)');

    const variation = object.itemData.variations[0];
    expect(variation.type).toBe('ITEM_VARIATION');
    expect(variation.id).toBe('#var-row-1');
    expect(variation.itemVariationData.itemId).toBe('#item-row-1');
    expect(variation.itemVariationData.sku).toBe('EGG-001');
    expect(variation.itemVariationData.pricingType).toBe('FIXED_PRICING');
  });

  test('converts dollar unit cost to Square money (integer cents)', () => {
    const row = { importRowId: 'r2', mappedData: { sku: 'X', name: 'X', unitCost: 12.34, quantity: 1 } };
    const variation = catalogObjectFor(row).itemData.variations[0];
    expect(variation.itemVariationData.priceMoney).toEqual({ amount: 1234, currency: 'USD' });
  });

  test('rounds a fractional cent correctly rather than truncating', () => {
    const row = { importRowId: 'r3', mappedData: { sku: 'Y', name: 'Y', unitCost: 2.005, quantity: 1 } };
    const variation = catalogObjectFor(row).itemData.variations[0];
    expect(variation.itemVariationData.priceMoney.amount).toBe(201); // 200.5 rounds to 201
  });

  test('each row gets a distinct temp id so a batch of many rows never collides', () => {
    const rowA = catalogObjectFor({ importRowId: 'a', mappedData: { sku: 'A', name: 'A', unitCost: 1, quantity: 1 } });
    const rowB = catalogObjectFor({ importRowId: 'b', mappedData: { sku: 'B', name: 'B', unitCost: 1, quantity: 1 } });
    expect(rowA.id).not.toBe(rowB.id);
    expect(rowA.itemData.variations[0].id).not.toBe(rowB.itemData.variations[0].id);
  });
});
