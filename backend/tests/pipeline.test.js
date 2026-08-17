const { buildImportRows } = require('../src/services/csv/pipeline');

const headers = ['SKU', 'Name', 'Qty', 'Cost'];
const mapping = { SKU: 'sku', Name: 'name', Qty: 'quantity', Cost: 'unitCost' };

describe('buildImportRows (CSV path — no SKU backfill)', () => {
  test('coerces, validates, and matches every row', () => {
    const products = [{ id: 'p1', sku: 'EGG-001', name: 'Large Eggs (Dozen)' }];
    const rows = [['EGG-001', 'Large Eggs (Dozen)', '120', '$2.10']];
    const built = buildImportRows({ headers, rows, mapping, products });

    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({
      rowIndex: 0,
      mappedData: { sku: 'EGG-001', name: 'Large Eggs (Dozen)', quantity: 120, unitCost: 2.1 },
      validationStatus: 'CLEAN',
      matchedProductId: 'p1',
      confidence: 1,
    });
  });

  test('a row with a blank SKU stays ERROR even when it matches a product by name — CSV data problems are not papered over', () => {
    const products = [{ id: 'p1', sku: 'EGG-001', name: 'Large Eggs (Dozen)' }];
    const rows = [['', 'Large Eggs (Dozen)', '120', '2.10']];
    const built = buildImportRows({ headers, rows, mapping, products });
    expect(built[0].validationStatus).toBe('ERROR');
    expect(built[0].mappedData.sku).toBeNull();
    expect(built[0].matchedProductId).toBe('p1'); // still surfaced as a suggested match for the reviewer
  });

  test('flags duplicate SKUs across the batch', () => {
    const rows = [
      ['DUP-1', 'A', '1', '1'],
      ['DUP-1', 'B', '2', '2'],
    ];
    const built = buildImportRows({ headers, rows, mapping, products: [] });
    expect(built[0].validationStatus).toBe('NEEDS_REVIEW');
    expect(built[1].validationStatus).toBe('NEEDS_REVIEW');
  });
});

describe('buildImportRows (scan path — backfillSkuFromMatch)', () => {
  const scanHeaders = ['description', 'quantity', 'unitCost'];
  const scanMapping = { description: 'name', quantity: 'quantity', unitCost: 'unitCost' };

  test('a confident match backfills the SKU so an OCR line with no SKU column can still be CLEAN', () => {
    const products = [{ id: 'p1', sku: 'EGG-001', name: 'Large Eggs (Dozen)' }];
    const rows = [['Large Eggs (Dozen)', '120', '4.50']];
    const built = buildImportRows({ headers: scanHeaders, rows, mapping: scanMapping, products, backfillSkuFromMatch: true });

    expect(built[0].mappedData.sku).toBe('EGG-001');
    expect(built[0].validationStatus).toBe('CLEAN');
  });

  test('an unmatched OCR line still correctly errors on missing SKU — nothing to backfill from', () => {
    const rows = [['Totally Unknown Item', '5', '1.00']];
    const built = buildImportRows({ headers: scanHeaders, rows, mapping: scanMapping, products: [], backfillSkuFromMatch: true });

    expect(built[0].mappedData.sku).toBeNull();
    expect(built[0].validationStatus).toBe('ERROR');
    expect(built[0].validationMessages).toContain('Missing SKU');
  });

  test('two OCR lines that both (mis)match the same product surface as a duplicate for human review', () => {
    // Simulates the real failure mode: near-identical product names both winning
    // the fuzzy match against a single catalog entry, colliding on the backfilled SKU.
    const products = [{ id: 'p1', sku: 'SAMP-A', name: 'Sample Product A' }];
    const rows = [
      ['Sample Product A', '10', '4.50'],
      ['Sample Product B', '5', '12.00'],
    ];
    const built = buildImportRows({ headers: scanHeaders, rows, mapping: scanMapping, products, backfillSkuFromMatch: true });

    expect(built[0].mappedData.sku).toBe('SAMP-A');
    expect(built[1].mappedData.sku).toBe('SAMP-A');
    expect(built[1].validationStatus).toBe('NEEDS_REVIEW');
    expect(built[1].validationMessages[0]).toMatch(/possible duplicate/);
  });
});
