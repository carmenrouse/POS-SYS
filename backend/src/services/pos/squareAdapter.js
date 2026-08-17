// Square adapter — fleshed out fully once the CSV pipeline (Feature 1) is
// validated end to end. testConnection is implemented now since it's needed
// to exercise POSConnection setup; pushRows is built out in a later pass.
const fetch = require('node-fetch');
const { ApiError } = require('../../middleware/errorHandler');

function baseUrl() {
  return process.env.SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

async function testConnection(connection) {
  if (!connection.accessToken) return { ok: false, error: 'No access token configured' };
  try {
    const response = await fetch(`${baseUrl()}/v2/locations`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Square-Version': '2024-08-21',
      },
    });
    const body = await response.json();
    if (!response.ok) {
      return { ok: false, error: body.errors?.[0]?.detail || `HTTP ${response.status}` };
    }
    return { ok: true, locations: body.locations?.map((l) => ({ id: l.id, name: l.name })) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function pushRows(_connection, _rows) {
  throw new ApiError(501, 'Square pushRows not implemented yet');
}

module.exports = { platform: 'SQUARE', testConnection, pushRows };
