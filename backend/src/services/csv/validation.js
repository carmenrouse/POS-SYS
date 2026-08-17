const LARGE_QUANTITY_THRESHOLD = 10000;
const LARGE_COST_THRESHOLD = 10000;

/**
 * Validates one coerced row and produces a status + human-readable reasons.
 * ERROR = can't be pushed as-is (missing SKU/name, or a quantity/cost that's
 * either blank or couldn't be parsed as a number, or is negative).
 * NEEDS_REVIEW = mechanically valid but ambiguous enough to want a human look
 * (zero cost, outlier quantity/cost, possible duplicate SKU).
 * CLEAN = nothing flagged.
 *
 * @param {object} mappedData coerced row from coercion.js
 * @param {string[]} coercionNotes parse failures already surfaced by coercion.js
 * @param {number} duplicateSkuCount how many rows in this job share this SKU
 */
function validateRow(mappedData, coercionNotes, duplicateSkuCount) {
  const errors = [];
  const warnings = [];

  if (!mappedData.sku) errors.push('Missing SKU');
  if (!mappedData.name) errors.push('Missing product name');

  const quantityNote = coercionNotes.find((n) => n.toLowerCase().includes('quantity'));
  if (mappedData.quantity === null) {
    errors.push(quantityNote || 'Quantity is missing');
  } else if (mappedData.quantity < 0) {
    errors.push('Quantity cannot be negative');
  }

  const costNote = coercionNotes.find((n) => n.toLowerCase().includes('cost'));
  if (mappedData.unitCost === null) {
    errors.push(costNote || 'Unit cost is missing');
  } else if (mappedData.unitCost < 0) {
    errors.push('Unit cost cannot be negative');
  }

  if (errors.length > 0) {
    return { status: 'ERROR', messages: errors };
  }

  if (mappedData.unitCost === 0) warnings.push('Unit cost is $0.00 — confirm this is correct');
  if (mappedData.quantity > LARGE_QUANTITY_THRESHOLD) {
    warnings.push(`Unusually large quantity (${mappedData.quantity.toLocaleString()}) — please confirm`);
  }
  if (mappedData.unitCost > LARGE_COST_THRESHOLD) {
    warnings.push(`Unusually large unit cost ($${mappedData.unitCost.toLocaleString()}) — please confirm`);
  }
  if (duplicateSkuCount > 1) {
    warnings.push(`SKU "${mappedData.sku}" appears ${duplicateSkuCount} times in this file — possible duplicate`);
  }

  return { status: warnings.length > 0 ? 'NEEDS_REVIEW' : 'CLEAN', messages: warnings };
}

module.exports = { validateRow, LARGE_QUANTITY_THRESHOLD, LARGE_COST_THRESHOLD };
