const express = require('express');
const { body } = require('express-validator');

const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ApiError } = require('../middleware/errorHandler');
const { getAdapter, SUPPORTED_PLATFORMS } = require('../services/pos');

const router = express.Router();
router.use(authenticate);

function redact(connection) {
  return {
    ...connection,
    accessToken: connection.accessToken ? '••••••••' : null,
    refreshToken: connection.refreshToken ? '••••••••' : null,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const connections = await prisma.pOSConnection.findMany({ where: { businessId: req.user.businessId } });
    res.json(connections.map(redact));
  } catch (err) {
    next(err);
  }
});

// Manually register/update credentials for a platform (a real OAuth flow would
// redirect through the platform first; this is the equivalent "save token" step
// once that flow completes, and is enough to exercise the adapter locally with
// a Square sandbox access token).
router.put(
  '/:platform',
  requireRole('OWNER'),
  [
    body('accessToken').optional().isString(),
    body('refreshToken').optional().isString(),
    body('externalLocationId').optional().isString(),
    body('config').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const platform = req.params.platform.toUpperCase();
      if (!SUPPORTED_PLATFORMS.includes(platform)) {
        throw new ApiError(400, `Unsupported platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
      }
      const { accessToken, refreshToken, externalLocationId, config } = req.body;

      const connection = await prisma.pOSConnection.upsert({
        where: { businessId_platform: { businessId: req.user.businessId, platform } },
        create: {
          businessId: req.user.businessId,
          platform,
          accessToken,
          refreshToken,
          externalLocationId,
          config,
          status: accessToken ? 'CONNECTED' : 'NOT_CONNECTED',
        },
        update: {
          ...(accessToken !== undefined && { accessToken }),
          ...(refreshToken !== undefined && { refreshToken }),
          ...(externalLocationId !== undefined && { externalLocationId }),
          ...(config !== undefined && { config }),
          status: accessToken ? 'CONNECTED' : 'NOT_CONNECTED',
          lastError: null,
        },
      });
      res.json(redact(connection));
    } catch (err) {
      next(err);
    }
  }
);

router.post('/:platform/test', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const platform = req.params.platform.toUpperCase();
    const connection = await prisma.pOSConnection.findFirst({
      where: { businessId: req.user.businessId, platform },
    });
    if (!connection) throw new ApiError(404, `No ${platform} connection configured`);

    const adapter = getAdapter(platform);
    const result = await adapter.testConnection(connection);

    const updated = await prisma.pOSConnection.update({
      where: { id: connection.id },
      data: {
        status: result.ok ? 'CONNECTED' : 'ERROR',
        lastError: result.ok ? null : result.error,
        lastSyncedAt: result.ok ? new Date() : connection.lastSyncedAt,
      },
    });
    res.json({ ...redact(updated), testResult: result });
  } catch (err) {
    next(err);
  }
});

router.delete('/:platform', requireRole('OWNER'), async (req, res, next) => {
  try {
    const platform = req.params.platform.toUpperCase();
    const connection = await prisma.pOSConnection.findFirst({
      where: { businessId: req.user.businessId, platform },
    });
    if (!connection) throw new ApiError(404, `No ${platform} connection configured`);
    await prisma.pOSConnection.delete({ where: { id: connection.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
