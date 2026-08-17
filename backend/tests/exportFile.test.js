const ExcelJS = require('exceljs');
const { exportCsv, exportXlsx } = require('../src/services/csv/exportFile');

const rows = [
  { mappedData: { sku: '007', name: 'Whole Chicken', description: null, quantity: 40, unitCost: 4.75, category: 'Poultry' } },
];

describe('exportCsv', () => {
  test('produces a header row plus one row per approved import row', () => {
    const csv = exportCsv(rows);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('sku,name,description,quantity,unitCost,category');
    expect(lines[1]).toBe('007,Whole Chicken,,40,4.75,Poultry');
  });
});

describe('exportXlsx', () => {
  test('produces a readable workbook with the SKU preserved as text', async () => {
    const buffer = await exportXlsx(rows);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe('sku');
    expect(String(sheet.getRow(2).getCell(1).value)).toBe('007');
  });
});
