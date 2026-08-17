const express = require('express');
const { body, query } = require('express-validator');

const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ApiError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', [query('search').optional().isString()], validate, async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = { businessId: req.user.businessId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    const products = await prisma.product.findMany({ where, orderBy: { name: 'asc' } });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId },
    });
    if (!product) throw new ApiError(404, 'Product not found');
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Manual create/edit of the cached product record — normal flow is that Products
// get created/updated as a side effect of pushing an ImportJob to a POS adapter.
router.post(
  '/',
  requireRole('MANAGER'),
  [
    body('sku').isString().trim().notEmpty(),
    body('name').isString().trim().notEmpty(),
    body('description').optional().isString(),
    body('cost').optional().isFloat({ min: 0 }),
    body('price').optional().isFloat({ min: 0 }),
    body('quantityOnHand').optional().isInt({ min: 0 }),
    body('category').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { sku, name, description, cost, price, quantityOnHand, category } = req.body;
      const product = await prisma.product.create({
        data: {
          businessId: req.user.businessId,
          sku,
          name,
          description,
          cost: cost ?? 0,
          price: price ?? 0,
          quantityOnHand: quantityOnHand ?? 0,
          category,
        },
      });
      res.status(201).json(product);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id',
  requireRole('MANAGER'),
  [
    body('sku').optional().isString().trim().notEmpty(),
    body('name').optional().isString().trim().notEmpty(),
    body('description').optional().isString(),
    body('cost').optional().isFloat({ min: 0 }),
    body('price').optional().isFloat({ min: 0 }),
    body('quantityOnHand').optional().isInt({ min: 0 }),
    body('category').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const existing = await prisma.product.findFirst({
        where: { id: req.params.id, businessId: req.user.businessId },
      });
      if (!existing) throw new ApiError(404, 'Product not found');
      const product = await prisma.product.update({ where: { id: existing.id }, data: req.body });
      res.json(product);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
