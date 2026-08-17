const prisma = require('../../lib/prisma');
const { ApiError } = require('../../middleware/errorHandler');
const { getAdapter } = require('./index');

/**
 * Pushes an approved ImportJob's approved rows to a connected POS.
 * - Rows already matched to a cached Product with an externalId get an
 *   inventory adjustment (this import represents newly received stock).
 * - Unmatched rows (or matches with no externalId yet) are new-to-the-POS
 *   products; they're only pushed if their row id is in
 *   confirmedNewProductRowIds — otherwise they're skipped with a message
 *   asking the caller to confirm product creation, per the spec's
 *   "ask before auto-creating new products" requirement.
 * - Every row attempted gets a PushLog entry (audit trail), success or fail.
 */
async function pushImportJob({ businessId, importJobId, posConnectionId, userId, confirmedNewProductRowIds = [] }) {
  const job = await prisma.importJob.findFirst({
    where: { id: importJobId, businessId },
    include: { rows: { where: { approved: true }, include: { matchedProduct: true } } },
  });
  if (!job) throw new ApiError(404, 'Import job not found');
  if (!['APPROVED', 'PARTIALLY_PUSHED'].includes(job.status)) {
    throw new ApiError(400, `Cannot push a job in status ${job.status}`);
  }
  if (job.rows.length === 0) throw new ApiError(400, 'No approved rows to push');

  const connection = await prisma.pOSConnection.findFirst({ where: { id: posConnectionId, businessId } });
  if (!connection) throw new ApiError(404, 'POS connection not found');
  if (connection.status !== 'CONNECTED') throw new ApiError(400, 'This POS connection is not currently connected');

  const confirmedSet = new Set(confirmedNewProductRowIds);
  const rowsToPush = [];
  const skipped = [];

  for (const row of job.rows) {
    const hasKnownProduct = row.matchedProduct && row.matchedProduct.externalId;
    if (hasKnownProduct) {
      rowsToPush.push({ importRowId: row.id, action: 'UPDATE_INVENTORY', mappedData: row.mappedData, matchedProduct: row.matchedProduct });
    } else if (confirmedSet.has(row.id)) {
      rowsToPush.push({ importRowId: row.id, action: 'CREATE_PRODUCT', mappedData: row.mappedData, matchedProduct: null });
    } else {
      skipped.push({
        importRowId: row.id,
        success: false,
        error: 'No matching product in this POS — confirm creating a new product to push this row',
        action: 'NEEDS_CONFIRMATION',
      });
    }
  }

  const adapter = getAdapter(connection.platform);
  const { results } = rowsToPush.length > 0 ? await adapter.pushRows(connection, rowsToPush) : { results: [] };
  const allResults = [...results, ...skipped];

  await prisma.$transaction(async (tx) => {
    for (const result of allResults) {
      await tx.pushLog.create({
        data: {
          importJobId: job.id,
          importRowId: result.importRowId,
          posConnectionId: connection.id,
          action: result.action,
          requestPayload: { action: result.action },
          responsePayload: result.success ? { externalId: result.externalId } : { error: result.error },
          success: result.success,
          errorMessage: result.success ? null : result.error,
          pushedById: userId,
        },
      });

      if (!result.success) continue;
      const row = job.rows.find((r) => r.id === result.importRowId);

      if (result.action === 'CREATE_PRODUCT') {
        await tx.product.upsert({
          where: { businessId_sku: { businessId, sku: row.mappedData.sku } },
          create: {
            businessId,
            posConnectionId: connection.id,
            externalId: result.externalId,
            sku: row.mappedData.sku,
            name: row.mappedData.name,
            description: row.mappedData.description,
            cost: row.mappedData.unitCost,
            price: row.mappedData.unitCost,
            quantityOnHand: row.mappedData.quantity,
            category: row.mappedData.category,
            lastSyncedAt: new Date(),
          },
          update: {
            posConnectionId: connection.id,
            externalId: result.externalId,
            quantityOnHand: { increment: row.mappedData.quantity },
            lastSyncedAt: new Date(),
          },
        });
      } else if (result.action === 'UPDATE_INVENTORY') {
        await tx.product.update({
          where: { id: row.matchedProductId },
          data: { quantityOnHand: { increment: row.mappedData.quantity }, lastSyncedAt: new Date() },
        });
      }
    }

    const successCount = allResults.filter((r) => r.success).length;
    const newStatus = successCount === 0 ? 'FAILED' : successCount === job.rows.length ? 'PUSHED' : 'PARTIALLY_PUSHED';

    await tx.importJob.update({
      where: { id: job.id },
      data: { status: newStatus, pushedAt: new Date() },
    });
    await tx.pOSConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
  });

  const updatedJob = await prisma.importJob.findUnique({
    where: { id: job.id },
    include: { rows: { orderBy: { rowIndex: 'asc' }, include: { matchedProduct: true } }, supplier: true },
  });

  return { job: updatedJob, results: allResults };
}

module.exports = { pushImportJob };
