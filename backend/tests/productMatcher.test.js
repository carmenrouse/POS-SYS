const { matchProduct } = require('../src/services/csv/productMatcher');

const products = [
  { id: 'p1', sku: 'EGG-001', name: 'Large Eggs (Dozen)' },
  { id: 'p2', sku: 'CHKN-001', name: 'Whole Chicken' },
];

describe('matchProduct', () => {
  test('an exact SKU match wins outright with full confidence', () => {
    const result = matchProduct({ sku: 'egg-001', name: 'Something Totally Different' }, products);
    expect(result).toEqual({ matchedProductId: 'p1', confidence: 1 });
  });

  test('falls back to fuzzy name matching when there is no SKU', () => {
    const result = matchProduct({ sku: null, name: 'Whole Chicken' }, products);
    expect(result.matchedProductId).toBe('p2');
    expect(result.confidence).toBeGreaterThanOrEqual(0.99);
  });

  test('returns no match when nothing is similar enough', () => {
    const result = matchProduct({ sku: null, name: 'Bag of Rice' }, products);
    expect(result.matchedProductId).toBeNull();
  });

  test('returns no match against an empty catalog', () => {
    expect(matchProduct({ sku: null, name: 'Anything' }, [])).toEqual({ matchedProductId: null, confidence: 0 });
  });

  test('a row with no name and no SKU match cannot match anything', () => {
    expect(matchProduct({ sku: null, name: null }, products)).toEqual({ matchedProductId: null, confidence: 0 });
  });
});
