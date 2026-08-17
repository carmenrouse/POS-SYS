const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const businessRoutes = require('./routes/business');
const userRoutes = require('./routes/users');
const supplierRoutes = require('./routes/suppliers');
const productRoutes = require('./routes/products');
const posConnectionRoutes = require('./routes/posConnections');
const importJobRoutes = require('./routes/importJobs');
const scanRoutes = require('./routes/scan');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
// Uploaded source files (CSV/XLSX/scans) — dev/local storage; swap for S3/GCS in production.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/users', userRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);
app.use('/api/pos-connections', posConnectionRoutes);
app.use('/api/import-jobs', importJobRoutes);
app.use('/api/scan', scanRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
