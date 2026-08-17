const mockAdapter = require('./mockAdapter');
const textractAdapter = require('./textractAdapter');
const documentAiAdapter = require('./documentAiAdapter');

// Pluggable OCR/document-parsing adapter — same pattern as the POS adapter
// registry: one interface (extract), swap the implementation via env config.
const ADAPTERS = {
  mock: mockAdapter,
  textract: textractAdapter,
  documentai: documentAiAdapter,
};

function getOcrAdapter() {
  const provider = process.env.OCR_PROVIDER || 'mock';
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown OCR_PROVIDER "${provider}"`);
  return adapter;
}

module.exports = { getOcrAdapter, ADAPTERS };
