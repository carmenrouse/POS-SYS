const { INTERNAL_FIELDS } = require('./internalFields');

const SYNONYMS = {
  sku: ['sku', 'item #', 'item#', 'item no', 'item number', 'product code', 'upc', 'barcode', 'part number', 'part#', 'code'],
  name: ['name', 'product', 'product name', 'item', 'item name', 'title', 'item description'],
  description: ['description', 'desc', 'details', 'notes', 'long description'],
  quantity: ['qty', 'quantity', 'qty ordered', 'count', 'units', 'on hand', 'quantity ordered'],
  unitCost: ['cost', 'unit cost', 'price', 'unit price', 'wholesale price', 'wholesale cost', 'cost each', 'cost/unit', 'cost per unit'],
  category: ['category', 'type', 'dept', 'department', 'group', 'product type'],
};

function normalize(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const maxLen = Math.max(normA.length, normB.length);
  return 1 - levenshtein(normA, normB) / maxLen;
}

const SUGGEST_THRESHOLD = 0.6;

/**
 * Fuzzy-matches one incoming CSV/XLSX header to the internal schema.
 * Exact synonym matches score 1; everything else falls back to string
 * similarity against the field name and its synonym list.
 */
function matchHeader(header) {
  const normHeader = normalize(header);
  let best = { internalField: null, score: 0 };

  for (const field of INTERNAL_FIELDS) {
    const candidates = [field, ...(SYNONYMS[field] || [])];
    for (const candidate of candidates) {
      if (normalize(candidate) === normHeader) {
        return { internalField: field, score: 1 };
      }
      const score = similarity(header, candidate);
      if (score > best.score) best = { internalField: field, score };
    }
  }

  if (best.score < SUGGEST_THRESHOLD) return { internalField: null, score: best.score };
  return best;
}

/**
 * Suggests an internal-field mapping for every incoming header. Each header
 * maps to at most one field, and each internal field is claimed by at most
 * one header (its best-scoring match) so two ambiguous columns don't both
 * land on the same target.
 */
function suggestMapping(headers) {
  const perHeader = headers.map((header) => ({ header, ...matchHeader(header) }));
  const claimed = new Map(); // internalField -> { header, score }

  for (const candidate of perHeader) {
    if (!candidate.internalField) continue;
    const existing = claimed.get(candidate.internalField);
    if (!existing || candidate.score > existing.score) {
      claimed.set(candidate.internalField, candidate);
    }
  }

  const claimedHeaders = new Set([...claimed.values()].map((c) => c.header));
  const mapping = {};
  const confidence = {};
  for (const header of headers) {
    const winner = [...claimed.entries()].find(([, c]) => c.header === header);
    if (winner && claimedHeaders.has(header)) {
      mapping[header] = winner[0];
      confidence[header] = winner[1].score;
    } else {
      mapping[header] = null;
      confidence[header] = 0;
    }
  }
  return { mapping, confidence };
}

module.exports = { matchHeader, suggestMapping, similarity };
