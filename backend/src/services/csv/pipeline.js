const { coerceRow } = require('./coercion');
const { validateRow } = require('./validation');
const { matchProduct } = require('./productMatcher');

/**
 * Turns parsed { headers, rows } plus a confirmed header->internalField
 * mapping into fully coerced, validated, product-matched row objects ready
 * to persist as ImportRow records. Shared by the CSV/XLSX pipeline and the
 * OCR scan pipeline (which calls this with a synthetic header set) so both
 * sources go through one review/approve/push path.
 *
 * @param {string[]} headers source column headers
 * @param {string[][]} rows raw row values aligned to headers
 * @param {Record<string, string|null>} mapping header -> internal field name
 * @param {Array<{id, sku, name}>} products existing cached products for this business
 */
function buildImportRows({ headers, rows, mapping, products }) {
  const coercedRows = rows.map((rowValues) => {
    const rawByHeader = {};
    headers.forEach((header, i) => {
      rawByHeader[header] = rowValues[i] ?? '';
    });

    const rawByField = {};
    headers.forEach((header, i) => {
      const field = mapping[header];
      if (field) rawByField[field] = rowValues[i] ?? '';
    });

    const { mappedData, notes } = coerceRow(rawByField);
    return { rawByHeader, mappedData, notes };
  });

  const skuCounts = {};
  for (const row of coercedRows) {
    if (row.mappedData.sku) skuCounts[row.mappedData.sku] = (skuCounts[row.mappedData.sku] || 0) + 1;
  }

  return coercedRows.map((row, index) => {
    const duplicateCount = row.mappedData.sku ? skuCounts[row.mappedData.sku] : 1;
    const { status, messages } = validateRow(row.mappedData, row.notes, duplicateCount);
    const match = matchProduct(row.mappedData, products);

    return {
      rowIndex: index,
      rawData: row.rawByHeader,
      mappedData: row.mappedData,
      validationStatus: status,
      validationMessages: messages,
      confidence: match.confidence,
      matchedProductId: match.matchedProductId,
    };
  });
}

module.exports = { buildImportRows };
