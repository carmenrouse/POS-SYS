const { similarity } = require('./headerMatcher');

const NAME_MATCH_THRESHOLD = 0.6;

/**
 * Matches a coerced row to an existing cached Product: exact SKU match wins
 * outright (confidence 1), otherwise falls back to fuzzy name similarity.
 * Used both for CSV rows and OCR-extracted scan lines.
 */
function matchProduct(mappedData, products) {
  if (mappedData.sku) {
    const exact = products.find((p) => p.sku.toLowerCase() === mappedData.sku.toLowerCase());
    if (exact) return { matchedProductId: exact.id, confidence: 1 };
  }

  if (!mappedData.name || products.length === 0) return { matchedProductId: null, confidence: 0 };

  let best = null;
  for (const product of products) {
    const score = similarity(mappedData.name, product.name);
    if (!best || score > best.score) best = { productId: product.id, score };
  }

  if (best && best.score >= NAME_MATCH_THRESHOLD) {
    return { matchedProductId: best.productId, confidence: best.score };
  }
  return { matchedProductId: null, confidence: best ? best.score : 0 };
}

module.exports = { matchProduct, NAME_MATCH_THRESHOLD };
