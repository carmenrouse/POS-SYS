// Stub Shopify adapter — same interface as squareAdapter.js. Not yet implemented;
// wire up the Shopify Admin API (REST or GraphQL) here following the same
// testConnection/pushRows contract.
const { ApiError } = require('../../middleware/errorHandler');

async function testConnection(_connection) {
  return { ok: false, error: 'Shopify adapter is not implemented yet' };
}

async function pushRows(_connection, _rows) {
  throw new ApiError(501, 'Shopify adapter is not implemented yet');
}

module.exports = { platform: 'SHOPIFY', testConnection, pushRows };
