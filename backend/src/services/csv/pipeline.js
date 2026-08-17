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
 * @param {boolean} [backfillSkuFromMatch] when a row has no SKU but confidently
 *   matches an existing product, fill the SKU in from that match before
 *   validating. Scanned documents (photos/PDFs of paper POs) never carry a
 *   SKU at all — without this, every scanned line would be an unconditional
 *   "Missing SKU" error regardless of how confident the match is. CSV/XLSX
 *   imports leave this off: a supplier file with a blank SKU is a real data
 *   problem worth flagging, not something to paper over.
 */
function buildImportRows({ headers, rows, mapping, products, backfillSkuFromMatch = false }) {
  const productsById = new Map(products.map((p) => [p.id, p]));

  const processedRows = rows.map((rowValues) => {
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
    const match = matchProduct(mappedData, products);
    if (backfillSkuFromMatch && !mappedData.sku && match.matchedProductId) {
      mappedData.sku = productsById.get(match.matchedProductId).sku;
    }

    return { rawByHeader, mappedData, notes, match };
  });

  const skuCounts = {};
  for (const row of processedRows) {
    if (row.mappedData.sku) skuCounts[row.mappedData.sku] = (skuCounts[row.mappedData.sku] || 0) + 1;
  }

  return processedRows.map((row, index) => {
    const duplicateCount = row.mappedData.sku ? skuCounts[row.mappedData.sku] : 1;
    const { status, messages } = validateRow(row.mappedData, row.notes, duplicateCount);

    return {
      rowIndex: index,
      rawData: row.rawByHeader,
      mappedData: row.mappedData,
      validationStatus: status,
      validationMessages: messages,
      confidence: row.match.confidence,
      matchedProductId: row.match.matchedProductId,
    };
  });
}

module.exports = { buildImportRows };
