const { stringify } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');

const EXPORT_COLUMNS = ['sku', 'name', 'description', 'quantity', 'unitCost', 'category'];

/**
 * Produces a corrected, standardized file from approved ImportRows — the
 * "export a corrected file" fallback for businesses with no POS API
 * integration configured yet.
 */
function buildExportRows(rows) {
  return rows.map((row) => {
    const data = row.mappedData;
    return {
      sku: data.sku || '',
      name: data.name || '',
      description: data.description || '',
      quantity: data.quantity ?? '',
      unitCost: data.unitCost ?? '',
      category: data.category || '',
    };
  });
}

function exportCsv(rows) {
  const records = buildExportRows(rows);
  return stringify(records, { header: true, columns: EXPORT_COLUMNS });
}

async function exportXlsx(rows) {
  const records = buildExportRows(rows);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.columns = EXPORT_COLUMNS.map((key) => ({ header: key, key }));
  sheet.addRows(records);
  return workbook.xlsx.writeBuffer();
}

module.exports = { exportCsv, exportXlsx, EXPORT_COLUMNS };
