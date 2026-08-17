const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { body, query } = require('express-validator');

const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ApiError } = require('../middleware/errorHandler');
const { parseFile } = require('../services/csv/parseFile');
const { suggestMapping } = require('../services/csv/headerMatcher');
const { buildImportRows } = require('../services/csv/pipeline');
const { coerceRow } = require('../services/csv/coercion');
const { validateRow } = require('../services/csv/validation');
const { matchProduct } = require('../services/csv/productMatcher');
const { exportCsv, exportXlsx } = require('../services/csv/exportFile');
const { INTERNAL_FIELDS } = require('../services/csv/internalFields');
const { pushImportJob } = require('../services/pos/pushService');

const router = express.Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || ext === '.csv' || ext === '.xlsx') return cb(null, true);
    cb(new ApiError(400, `Unsupported file type: ${file.mimetype || ext}`));
  },
});

function sourceTypeFor(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  return ext === '.xlsx' ? 'XLSX' : 'CSV';
}

async function headersMatchSavedMapping(headers, savedMapping) {
  const savedHeaders = Object.keys(savedMapping);
  const overlap = savedHeaders.filter((h) => headers.includes(h));
  // Require most of the saved mapping's columns to still be present before auto-applying it.
  return savedHeaders.length > 0 && overlap.length / savedHeaders.length >= 0.7;
}

// Upload a CSV/XLSX file, parse its headers, and suggest a column mapping —
// from the supplier's saved profile if one exists and still fits, otherwise
// via fuzzy header matching. Does not create ImportRows yet; that happens
// once the user confirms the mapping (POST /:id/confirm-mapping).
router.post('/upload', requireRole('MANAGER'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'No file uploaded (field name "file")');
    const supplierId = req.body.supplierId || null;

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, businessId: req.user.businessId },
      });
      if (!supplier) throw new ApiError(400, 'Invalid supplier');
    }

    const sourceType = sourceTypeFor(req.file);
    const { headers, rows } = await parseFile(req.file.buffer, sourceType);
    if (rows.length === 0) throw new ApiError(400, 'File has a header row but no data rows');

    const filename = `${crypto.randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

    let mapping;
    let confidence;
    let appliedSavedMapping = false;

    if (supplierId) {
      const saved = await prisma.supplierFieldMapping.findUnique({ where: { supplierId } });
      if (saved && (await headersMatchSavedMapping(headers, saved.mapping))) {
        mapping = {};
        confidence = {};
        for (const header of headers) {
          mapping[header] = saved.mapping[header] ?? null;
          confidence[header] = mapping[header] ? 1 : 0;
        }
        appliedSavedMapping = true;
      }
    }

    if (!mapping) {
      const suggestion = suggestMapping(headers);
      mapping = suggestion.mapping;
      confidence = suggestion.confidence;
    }

    const importJob = await prisma.importJob.create({
      data: {
        businessId: req.user.businessId,
        supplierId,
        sourceType,
        originalFileUrl: `/uploads/${filename}`,
        originalFileName: req.file.originalname,
        status: 'PROCESSING',
        rawFileData: { headers, rows },
        createdById: req.user.id,
      },
    });

    res.status(201).json({
      importJobId: importJob.id,
      headers,
      previewRows: rows.slice(0, 5),
      rowCount: rows.length,
      suggestedMapping: mapping,
      confidence,
      appliedSavedMapping,
      internalFields: INTERNAL_FIELDS,
    });
  } catch (err) {
    next(err);
  }
});

// Confirm (or override) the column mapping, which builds every ImportRow —
// coerced, validated, and product-matched — in one pass.
router.post(
  '/:id/confirm-mapping',
  requireRole('MANAGER'),
  [body('mapping').isObject(), body('saveAsSupplierDefault').optional().isBoolean()],
  validate,
  async (req, res, next) => {
    try {
      const job = await prisma.importJob.findFirst({
        where: { id: req.params.id, businessId: req.user.businessId },
      });
      if (!job) throw new ApiError(404, 'Import job not found');
      if (job.status !== 'PROCESSING') throw new ApiError(400, `Mapping already confirmed for this job (status ${job.status})`);
      if (!job.rawFileData) throw new ApiError(400, 'This job has no pending file data to map');

      const { mapping, saveAsSupplierDefault } = req.body;
      for (const internalField of Object.values(mapping)) {
        if (internalField && !INTERNAL_FIELDS.includes(internalField)) {
          throw new ApiError(400, `Unknown internal field "${internalField}"`);
        }
      }

      const { headers, rows } = job.rawFileData;
      const products = await prisma.product.findMany({ where: { businessId: req.user.businessId } });
      const built = buildImportRows({ headers, rows, mapping, products });

      const transactionSteps = [
        prisma.importRow.createMany({
          data: built.map((row) => ({ ...row, importJobId: job.id })),
        }),
      ];
      if (saveAsSupplierDefault && job.supplierId) {
        transactionSteps.push(
          prisma.supplierFieldMapping.upsert({
            where: { supplierId: job.supplierId },
            create: { businessId: req.user.businessId, supplierId: job.supplierId, mapping },
            update: { mapping },
          })
        );
      }
      transactionSteps.push(
        prisma.importJob.update({
          where: { id: job.id },
          data: { status: 'NEEDS_REVIEW', columnMapping: mapping, rawFileData: null },
          include: { rows: true, supplier: true },
        })
      );

      const results = await prisma.$transaction(transactionSteps);
      res.json(results[results.length - 1]);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/',
  [query('status').optional().isString(), query('supplierId').optional().isString()],
  validate,
  async (req, res, next) => {
    try {
      const { status, supplierId } = req.query;
      const where = { businessId: req.user.businessId };
      if (status) where.status = status;
      if (supplierId) where.supplierId = supplierId;
      const jobs = await prisma.importJob.findMany({
        where,
        include: { supplier: true, _count: { select: { rows: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json(jobs);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', async (req, res, next) => {
  try {
    const job = await prisma.importJob.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        rows: { orderBy: { rowIndex: 'asc' }, include: { matchedProduct: true } },
      },
    });
    if (!job) throw new ApiError(404, 'Import job not found');
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// Edit one row's mapped data (human correction) — re-coerces, re-validates,
// and re-matches against the product catalog.
router.patch(
  '/:id/rows/:rowId',
  requireRole('MANAGER'),
  [
    body('sku').optional().isString(),
    body('name').optional().isString(),
    body('description').optional({ nullable: true }).isString(),
    body('quantity').optional(),
    body('unitCost').optional(),
    body('category').optional({ nullable: true }).isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const job = await prisma.importJob.findFirst({
        where: { id: req.params.id, businessId: req.user.businessId },
      });
      if (!job) throw new ApiError(404, 'Import job not found');
      const row = await prisma.importRow.findFirst({ where: { id: req.params.rowId, importJobId: job.id } });
      if (!row) throw new ApiError(404, 'Import row not found');

      // Re-run the row through coercion (so "$4.50" typed by a human is cleaned the same way) then re-validate.
      const rawByField = {
        sku: req.body.sku ?? row.mappedData.sku,
        name: req.body.name ?? row.mappedData.name,
        description: req.body.description !== undefined ? req.body.description : row.mappedData.description,
        quantity: req.body.quantity !== undefined ? String(req.body.quantity) : String(row.mappedData.quantity ?? ''),
        unitCost: req.body.unitCost !== undefined ? String(req.body.unitCost) : String(row.mappedData.unitCost ?? ''),
        category: req.body.category !== undefined ? req.body.category : row.mappedData.category,
      };
      const { mappedData, notes } = coerceRow(rawByField);

      const siblingRows = await prisma.importRow.findMany({ where: { importJobId: job.id, id: { not: row.id } } });
      const duplicateCount =
        1 + siblingRows.filter((r) => mappedData.sku && r.mappedData.sku === mappedData.sku).length;
      const { status, messages } = validateRow(mappedData, notes, duplicateCount);

      const products = await prisma.product.findMany({ where: { businessId: req.user.businessId } });
      const match = matchProduct(mappedData, products);

      const updated = await prisma.importRow.update({
        where: { id: row.id },
        data: {
          mappedData,
          validationStatus: status,
          validationMessages: messages,
          confidence: match.confidence,
          matchedProductId: match.matchedProductId,
          approved: status === 'ERROR' ? false : row.approved,
        },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/rows/:rowId/approve',
  requireRole('MANAGER'),
  [body('approved').optional().isBoolean()],
  validate,
  async (req, res, next) => {
    try {
      const job = await prisma.importJob.findFirst({
        where: { id: req.params.id, businessId: req.user.businessId },
      });
      if (!job) throw new ApiError(404, 'Import job not found');
      const row = await prisma.importRow.findFirst({ where: { id: req.params.rowId, importJobId: job.id } });
      if (!row) throw new ApiError(404, 'Import row not found');

      const approved = req.body.approved ?? true;
      if (approved && row.validationStatus === 'ERROR') {
        throw new ApiError(400, 'Fix this row\'s errors before approving it');
      }

      const updated = await prisma.importRow.update({ where: { id: row.id }, data: { approved } });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// Bulk-approve every row that came through validation with no flags at all.
router.post('/:id/approve-all-clean', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const job = await prisma.importJob.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });
    if (!job) throw new ApiError(404, 'Import job not found');

    const result = await prisma.importRow.updateMany({
      where: { importJobId: job.id, validationStatus: 'CLEAN' },
      data: { approved: true },
    });
    res.json({ approvedCount: result.count });
  } catch (err) {
    next(err);
  }
});

// Marks the job itself as reviewed/approved. Only approved rows get
// exported/pushed; this just records that a human signed off on the batch.
router.post('/:id/approve', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const job = await prisma.importJob.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
      include: { rows: true },
    });
    if (!job) throw new ApiError(404, 'Import job not found');
    if (job.status !== 'NEEDS_REVIEW') throw new ApiError(400, `Cannot approve a job in status ${job.status}`);

    const approvedRows = job.rows.filter((r) => r.approved);
    if (approvedRows.length === 0) throw new ApiError(400, 'Approve at least one row before approving the job');
    const badApproved = approvedRows.filter((r) => r.validationStatus === 'ERROR');
    if (badApproved.length > 0) throw new ApiError(400, 'Some approved rows still have unresolved errors');

    const updated = await prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() },
      include: { rows: true, supplier: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Output option (a): a corrected, standardized file for manual upload
// elsewhere — the fallback when no POS API integration is configured.
router.get('/:id/export', [query('format').optional().isIn(['csv', 'xlsx'])], validate, async (req, res, next) => {
  try {
    const job = await prisma.importJob.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
      include: { rows: { where: { approved: true }, orderBy: { rowIndex: 'asc' } } },
    });
    if (!job) throw new ApiError(404, 'Import job not found');
    if (job.rows.length === 0) throw new ApiError(400, 'No approved rows to export');

    const format = req.query.format || 'csv';
    if (format === 'xlsx') {
      const buffer = await exportXlsx(job.rows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="import-${job.id}.xlsx"`);
      res.send(buffer);
    } else {
      const csv = exportCsv(job.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="import-${job.id}.csv"`);
      res.send(csv);
    }
  } catch (err) {
    next(err);
  }
});

// Output option (b): push approved rows directly to a connected POS via its
// adapter. Rows with no matching cached product are skipped unless their id
// is explicitly confirmed for new-product creation.
router.post(
  '/:id/push',
  requireRole('MANAGER'),
  [body('posConnectionId').isString().notEmpty(), body('confirmedNewProductRowIds').optional().isArray()],
  validate,
  async (req, res, next) => {
    try {
      const result = await pushImportJob({
        businessId: req.user.businessId,
        importJobId: req.params.id,
        posConnectionId: req.body.posConnectionId,
        userId: req.user.id,
        confirmedNewProductRowIds: req.body.confirmedNewProductRowIds || [],
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id/push-log', async (req, res, next) => {
  try {
    const job = await prisma.importJob.findFirst({ where: { id: req.params.id, businessId: req.user.businessId } });
    if (!job) throw new ApiError(404, 'Import job not found');
    const logs = await prisma.pushLog.findMany({
      where: { importJobId: job.id },
      include: { pushedBy: { select: { id: true, name: true } }, posConnection: { select: { platform: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
