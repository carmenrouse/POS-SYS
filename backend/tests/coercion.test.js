const { coerceRow, coerceQuantity, coerceCurrency, coerceSku } = require('../src/services/csv/coercion');

describe('coerceCurrency (type coercion edge cases)', () => {
  test.each([
    ['$4.50', 4.5],
    ['€12,000.50', 12000.5], // thousands separator + currency symbol together
    ['£3.00', 3.0],
    ['1,234.56', 1234.56],
    ['12.5', 12.5],
    ['0', 0],
  ])('parses %s as %f', (input, expected) => {
    expect(coerceCurrency(input).value).toBeCloseTo(expected, 2);
  });

  test('treats accounting-style parentheses as negative', () => {
    expect(coerceCurrency('(5.00)').value).toBe(-5);
  });

  test('rounds to the nearest cent', () => {
    expect(coerceCurrency('4.999').value).toBe(5.0);
  });

  test('returns null with a note for unparseable input', () => {
    const result = coerceCurrency('notanumber');
    expect(result.value).toBeNull();
    expect(result.note).toMatch(/could not parse cost/i);
  });

  test('blank input is null with no note (a genuinely empty cell, not a parse failure)', () => {
    expect(coerceCurrency('')).toEqual({ value: null, note: null });
  });
});

describe('coerceQuantity (type coercion edge cases)', () => {
  test.each([
    ['120', 120],
    ['1,000', 1000],
    ['10.0', 10],
  ])('parses %s as %d', (input, expected) => {
    expect(coerceQuantity(input).value).toBe(expected);
  });

  test('accounting-style parentheses are negative', () => {
    expect(coerceQuantity('(5)').value).toBe(-5);
  });

  test('returns null with a note for unparseable input', () => {
    const result = coerceQuantity('abc');
    expect(result.value).toBeNull();
    expect(result.note).toMatch(/could not parse quantity/i);
  });
});

describe('coerceSku (leading zeros must survive)', () => {
  test('preserves leading zeros — never treated as a number', () => {
    expect(coerceSku('007')).toBe('007');
    expect(coerceSku('00042')).toBe('00042');
  });

  test('trims surrounding whitespace', () => {
    expect(coerceSku('  ABC-1  ')).toBe('ABC-1');
  });

  test('blank/whitespace-only input becomes null', () => {
    expect(coerceSku('   ')).toBeNull();
    expect(coerceSku('')).toBeNull();
  });
});

describe('coerceRow (full row cleanup pass)', () => {
  test('cleans a realistically messy supplier row in one pass', () => {
    const { mappedData, notes } = coerceRow({
      sku: '007',
      name: '  Whole Chicken  ',
      description: '',
      quantity: '1,000',
      unitCost: '$12.00',
      category: 'Poultry',
    });
    expect(mappedData).toEqual({
      sku: '007',
      name: 'Whole Chicken',
      description: null,
      quantity: 1000,
      unitCost: 12,
      category: 'Poultry',
    });
    expect(notes).toEqual([]);
  });

  test('surfaces one note per unparseable field', () => {
    const { notes } = coerceRow({ sku: 'X', name: 'X', quantity: 'abc', unitCost: 'xyz' });
    expect(notes).toHaveLength(2);
  });
});
