// Stub Clover adapter — same interface as squareAdapter.js. Not yet implemented;
// wire up Clover's REST API (https://docs.clover.com/docs/inventory-api) here
// following the same testConnection/pushRows contract.
const { ApiError } = require('../../middleware/errorHandler');

async function testConnection(_connection) {
  return { ok: false, error: 'Clover adapter is not implemented yet' };
}

async function pushRows(_connection, _rows) {
  throw new ApiError(501, 'Clover adapter is not implemented yet');
}

module.exports = { platform: 'CLOVER', testConnection, pushRows };
