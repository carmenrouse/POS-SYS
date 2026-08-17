const squareAdapter = require('./squareAdapter');
const cloverAdapter = require('./cloverAdapter');
const shopifyAdapter = require('./shopifyAdapter');
const lightspeedAdapter = require('./lightspeedAdapter');

// Every adapter implements the same contract:
//   testConnection(connection) -> { ok, error?, ... }
//   pushRows(connection, rows) -> { results: [{ importRowId, success, externalId?, error? }] }
const ADAPTERS = {
  SQUARE: squareAdapter,
  CLOVER: cloverAdapter,
  SHOPIFY: shopifyAdapter,
  LIGHTSPEED: lightspeedAdapter,
};

const SUPPORTED_PLATFORMS = Object.keys(ADAPTERS);

function getAdapter(platform) {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`Unknown POS platform "${platform}"`);
  return adapter;
}

module.exports = { getAdapter, ADAPTERS, SUPPORTED_PLATFORMS };
