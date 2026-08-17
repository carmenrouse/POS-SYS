const { matchHeader, suggestMapping } = require('../src/services/csv/headerMatcher');

describe('matchHeader (column-mapping logic)', () => {
  test('matches an exact internal field name', () => {
    expect(matchHeader('sku')).toEqual({ internalField: 'sku', score: 1 });
  });

  test('matches a known synonym exactly regardless of case/punctuation', () => {
    expect(matchHeader('Item #')).toEqual({ internalField: 'sku', score: 1 });
    expect(matchHeader('QTY')).toEqual({ internalField: 'quantity', score: 1 });
    expect(matchHeader('Unit Price')).toEqual({ internalField: 'unitCost', score: 1 });
  });

  test('falls back to fuzzy similarity for a near-miss header', () => {
    const result = matchHeader('Quanitty'); // typo
    expect(result.internalField).toBe('quantity');
    expect(result.score).toBeGreaterThan(0.6);
    expect(result.score).toBeLessThan(1);
  });

  test('returns no match for a header unrelated to any internal field', () => {
    const result = matchHeader('Warehouse Bin Location');
    expect(result.internalField).toBeNull();
  });
});

describe('suggestMapping (whole-header-set mapping)', () => {
  test('maps a typical supplier header row end to end', () => {
    const { mapping, confidence } = suggestMapping(['Item#', 'Product', 'Qty', 'Unit Price', 'Category']);
    expect(mapping).toEqual({
      'Item#': 'sku',
      Product: 'name',
      Qty: 'quantity',
      'Unit Price': 'unitCost',
      Category: 'category',
    });
    expect(confidence['Item#']).toBe(1);
  });

  test('does not let two headers both claim the same internal field', () => {
    // Both look SKU-ish; only the stronger match should win "sku", the other stays unmapped.
    const { mapping } = suggestMapping(['SKU', 'Product Code']);
    const claimedFields = Object.values(mapping).filter(Boolean);
    expect(new Set(claimedFields).size).toBe(claimedFields.length);
  });

  test('leaves an unrecognized column unmapped rather than guessing', () => {
    const { mapping } = suggestMapping(['SKU', 'Warehouse Bin']);
    expect(mapping.SKU).toBe('sku');
    expect(mapping['Warehouse Bin']).toBeNull();
  });
});
