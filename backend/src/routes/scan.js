const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { body } = require('express-validator');

const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ApiError } = require('../middleware/errorHandler');
const { getOcrAdapter } = require('../services/ocr');
const { buildImportRows } = require('../services/csv/pipeline');
const { similarity } = require('../services/csv/headerMatcher');

const router = express.Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) return cb(new ApiError(400, `Unsupported file type: ${file.mimetype}`));
    cb(null, true);
  },
});

// The fixed "mapping" from an OCR extraction's line-item shape into the
// internal schema — there's no ambiguous header matching to do here (unlike
// CSV/XLSX), so a scan skips straight to NEEDS_REVIEW with rows already
// built, then flows through the exact same review/approve/push/export
// pipeline as a CSV import.
const SCAN_HEADERS = ['description', 'quantity', 'unitCost'];
const SCAN_MAPPING = { description: 'name', quantity: 'quantity', unitCost: 'unitCost' };

router.post('/purchase-order', requireRole('MANAGER'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'No file uploaded (field name "file")');

    let supplierId = req.body.supplierId || null;
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, businessId: req.user.businessId } });
      if (!supplier) throw new ApiError(400, 'Invalid supplier');
    }

    const sourceType = req.file.mimetype === 'application/pdf' ? 'SCAN_PDF' : 'SCAN_IMAGE';
    const ext = req.file.mimetype === 'application/pdf' ? 'pdf' : req.file.mimetype.split('/')[1];
    const filename = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

    const adapter = getOcrAdapter();
    const extraction = await adapter.extract(req.file.buffer, req.file.mimetype);
    if (extraction.lineItems.length === 0) {
      throw new ApiError(400, 'OCR did not find any line items in this document — try a clearer photo or a different file');
    }

    // Auto-match the extracted supplier name if the caller didn't already pick one.
    if (!supplierId && extraction.header.supplierName) {
      const suppliers = await prisma.supplier.findMany({ where: { businessId: req.user.businessId } });
      const ranked = suppliers
        .map((s) => ({ id: s.id, score: similarity(extraction.header.supplierName, s.name) }))
        .sort((a, b) => b.score - a.score);
      if (ranked[0] && ranked[0].score >= 0.55) supplierId = ranked[0].id;
    }

    const rows = extraction.lineItems.map((li) => [li.description, String(li.quantity), String(li.unitCost)]);
    const products = await prisma.product.findMany({ where: { businessId: req.user.businessId } });
    const built = buildImportRows({ headers: SCAN_HEADERS, rows, mapping: SCAN_MAPPING, products, backfillSkuFromMatch: true });

    const job = await prisma.importJob.create({
      data: {
        businessId: req.user.businessId,
        supplierId,
        sourceType,
        originalFileUrl: `/uploads/${filename}`,
        originalFileName: req.file.originalname,
        status: 'NEEDS_REVIEW',
        columnMapping: SCAN_MAPPING,
        rawOcrData: { provider: extraction.provider, header: extraction.header, raw: extraction.raw },
        createdById: req.user.id,
        rows: { create: built },
      },
      include: {
        supplier: true,
        rows: { orderBy: { rowIndex: 'asc' }, include: { matchedProduct: true } },
      },
    });

    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
