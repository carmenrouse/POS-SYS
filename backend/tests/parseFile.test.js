const ExcelJS = require('exceljs');
const { parseFile } = require('../src/services/csv/parseFile');

describe('parseFile — CSV', () => {
  test('parses headers and rows, dropping fully blank rows', async () => {
    const csv = 'SKU,Name,Qty\nA,Widget,1\n,,\nB,Gadget,2\n';
    const { headers, rows } = await parseFile(Buffer.from(csv), 'CSV');
    expect(headers).toEqual(['SKU', 'Name', 'Qty']);
    expect(rows).toEqual([
      ['A', 'Widget', '1'],
      ['B', 'Gadget', '2'],
    ]);
  });

  test('strips a UTF-8 byte-order mark from the first header', async () => {
    const csv = '﻿SKU,Name\nA,Widget\n';
    const { headers } = await parseFile(Buffer.from(csv), 'CSV');
    expect(headers[0]).toBe('SKU');
  });

  test('handles quoted fields containing commas', async () => {
    const csv = 'SKU,Name\nA,"Widget, Deluxe"\n';
    const { rows } = await parseFile(Buffer.from(csv), 'CSV');
    expect(rows[0]).toEqual(['A', 'Widget, Deluxe']);
  });
});

describe('parseFile — XLSX', () => {
  test('parses a workbook and preserves a text-formatted leading-zero SKU', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['SKU', 'Name', 'Qty']);
    const row = sheet.addRow(['007', 'Whole Chicken', 40]);
    row.getCell(1).numFmt = '@'; // text format, as a real supplier export would use for SKUs
    const buffer = await workbook.xlsx.writeBuffer();

    const { headers, rows } = await parseFile(buffer, 'XLSX');
    expect(headers).toEqual(['SKU', 'Name', 'Qty']);
    expect(rows[0]).toEqual(['007', 'Whole Chicken', '40']);
  });
});
