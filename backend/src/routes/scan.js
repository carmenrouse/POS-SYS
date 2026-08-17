// Scan-to-import (Feature 2) is implemented once the CSV pipeline (Feature 1)
// is validated end to end — see services/ocr/ and the OCR-sourced ImportJob
// creation path added in a later pass.
const express = require('express');

const router = express.Router();

module.exports = router;
