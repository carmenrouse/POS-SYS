// Type coercion / cleanup pass. Only handles mechanical formatting issues —
// currency symbols, thousands separators, whitespace, leading zeros. Anything
// ambiguous (can't parse, negative, zero, duplicate, outlier) is left for
// validation.js to flag for human review rather than silently guessed at.

function coerceText(raw) {
  const value = (raw ?? '').trim();
  return value === '' ? null : value;
}

// SKUs must stay strings so leading zeros ("007") survive — never parsed as numbers.
function coerceSku(raw) {
  return coerceText(raw);
}

function coerceQuantity(raw) {
  const cleaned = (raw ?? '').replace(/,/g, '').trim();
  if (cleaned === '') return { value: null, note: null };
  const negative = /^\(.*\)$/.test(cleaned); // accounting-style negatives: (5)
  const numeric = cleaned.replace(/[()]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return { value: null, note: `Could not parse quantity "${raw}"` };
  const value = Math.round(parseFloat(numeric)) * (negative ? -1 : 1);
  return { value, note: null };
}

function coerceCurrency(raw) {
  const cleaned = (raw ?? '').replace(/[$€£,]/g, '').trim();
  if (cleaned === '') return { value: null, note: null };
  const negative = /^\(.*\)$/.test(cleaned);
  const numeric = cleaned.replace(/[()]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return { value: null, note: `Could not parse cost "${raw}"` };
  const value = Math.round(parseFloat(numeric) * (negative ? -1 : 1) * 100) / 100;
  return { value, note: null };
}

/**
 * Coerces one raw row (keyed by internal field, per the confirmed mapping)
 * into typed values, plus any coercion notes worth surfacing.
 */
function coerceRow(rawByField) {
  const mappedData = {};
  const notes = [];

  mappedData.sku = coerceSku(rawByField.sku);
  mappedData.name = coerceText(rawByField.name);
  mappedData.description = coerceText(rawByField.description);
  mappedData.category = coerceText(rawByField.category);

  const quantity = coerceQuantity(rawByField.quantity);
  mappedData.quantity = quantity.value;
  if (quantity.note) notes.push(quantity.note);

  const unitCost = coerceCurrency(rawByField.unitCost);
  mappedData.unitCost = unitCost.value;
  if (unitCost.note) notes.push(unitCost.note);

  return { mappedData, notes };
}

module.exports = { coerceRow, coerceText, coerceSku, coerceQuantity, coerceCurrency };
