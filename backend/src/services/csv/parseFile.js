const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // ExcelJS rich text / formula result objects.
    if ('text' in value) return String(value.text);
    if ('result' in value) return String(value.result);
    return '';
  }
  return String(value).trim();
}

/**
 * Parses an uploaded CSV or XLSX buffer into { headers, rows } — rows are
 * arrays of raw string values aligned to headers. Fully blank rows are
 * dropped here so downstream mapping/validation never sees them.
 */
async function parseFile(buffer, sourceType) {
  let headers;
  let records;

  if (sourceType === 'XLSX') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('Workbook has no sheets');

    const allRows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values.slice(1); // ExcelJS rows are 1-indexed with a leading undefined
      allRows.push(values.map(cellToString));
    });
    if (allRows.length === 0) throw new Error('Sheet is empty');
    headers = allRows[0];
    records = allRows.slice(1);
  } else {
    const text = buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
    const parsed = parse(text, { skip_empty_lines: true, relax_column_count: true });
    if (parsed.length === 0) throw new Error('File is empty');
    headers = parsed[0].map((h) => String(h).trim());
    records = parsed.slice(1);
  }

  headers = headers.map((h, i) => h || `Column ${i + 1}`);

  const rows = records
    .map((record) => headers.map((_, i) => (record[i] !== undefined ? String(record[i]).trim() : '')))
    .filter((row) => row.some((cell) => cell !== ''));

  return { headers, rows };
}

module.exports = { parseFile };
