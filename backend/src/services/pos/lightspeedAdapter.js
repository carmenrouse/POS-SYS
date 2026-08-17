// Stub Lightspeed adapter — same interface as squareAdapter.js. Not yet implemented;
// wire up the Lightspeed Retail API here following the same
// testConnection/pushRows contract.
const { ApiError } = require('../../middleware/errorHandler');

async function testConnection(_connection) {
  return { ok: false, error: 'Lightspeed adapter is not implemented yet' };
}

async function pushRows(_connection, _rows) {
  throw new ApiError(501, 'Lightspeed adapter is not implemented yet');
}

module.exports = { platform: 'LIGHTSPEED', testConnection, pushRows };
