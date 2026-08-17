const { validateRow } = require('../src/services/csv/validation');

const clean = { sku: 'ABC', name: 'Widget', quantity: 10, unitCost: 5, category: null };

describe('validateRow', () => {
  test('a fully valid row is CLEAN', () => {
    expect(validateRow(clean, [], 1)).toEqual({ status: 'CLEAN', messages: [] });
  });

  test('missing SKU is an ERROR', () => {
    const result = validateRow({ ...clean, sku: null }, [], 1);
    expect(result.status).toBe('ERROR');
    expect(result.messages).toContain('Missing SKU');
  });

  test('missing name is an ERROR', () => {
    const result = validateRow({ ...clean, name: null }, [], 1);
    expect(result.status).toBe('ERROR');
    expect(result.messages).toContain('Missing product name');
  });

  test('a coercion failure on quantity surfaces as an ERROR with the specific reason', () => {
    const result = validateRow({ ...clean, quantity: null }, ['Could not parse quantity "abc"'], 1);
    expect(result.status).toBe('ERROR');
    expect(result.messages).toEqual(['Could not parse quantity "abc"']);
  });

  test('a coercion failure on cost surfaces as an ERROR with the specific reason', () => {
    const result = validateRow({ ...clean, unitCost: null }, ['Could not parse cost "notanumber"'], 1);
    expect(result.status).toBe('ERROR');
    expect(result.messages).toEqual(['Could not parse cost "notanumber"']);
  });

  test('negative quantity is an ERROR', () => {
    expect(validateRow({ ...clean, quantity: -5 }, [], 1).status).toBe('ERROR');
  });

  test('negative unit cost is an ERROR', () => {
    expect(validateRow({ ...clean, unitCost: -1 }, [], 1).status).toBe('ERROR');
  });

  test('zero unit cost is NEEDS_REVIEW, not silently accepted or rejected', () => {
    const result = validateRow({ ...clean, unitCost: 0 }, [], 1);
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.messages[0]).toMatch(/\$0\.00/);
  });

  test('an outlier quantity is NEEDS_REVIEW', () => {
    const result = validateRow({ ...clean, quantity: 50000 }, [], 1);
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.messages[0]).toMatch(/unusually large quantity/i);
  });

  test('an outlier unit cost is NEEDS_REVIEW', () => {
    const result = validateRow({ ...clean, unitCost: 15000 }, [], 1);
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.messages[0]).toMatch(/unusually large unit cost/i);
  });

  test('a duplicate SKU count > 1 is NEEDS_REVIEW, never silently deduplicated', () => {
    const result = validateRow(clean, [], 3);
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.messages[0]).toMatch(/appears 3 times/);
  });

  test('ERROR takes priority over NEEDS_REVIEW-level flags on the same row', () => {
    const result = validateRow({ ...clean, sku: null, unitCost: 0 }, [], 1);
    expect(result.status).toBe('ERROR');
    expect(result.messages).toEqual(['Missing SKU']);
  });
});
