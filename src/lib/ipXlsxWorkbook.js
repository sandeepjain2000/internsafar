import ExcelJS from 'exceljs';

function cellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.map((x) => String(x ?? '')).filter(Boolean).join('; ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return v;
}

/**
 * Build an .xlsx Buffer from sheet descriptors.
 * @param {{ name: string, rows: object[] | any[][] }[]} sheets
 *   - object rows: first object's keys become the header row
 *   - array rows: first row is typically headers; written as-is
 */
export async function workbookToBuffer(sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InternSafar';
  wb.created = new Date();

  for (const sheet of sheets || []) {
    const name = String(sheet?.name || 'Sheet').replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
    const ws = wb.addWorksheet(name);
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];

    if (!rows.length) continue;

    if (Array.isArray(rows[0])) {
      for (const row of rows) {
        ws.addRow((row || []).map(cellValue));
      }
    } else {
      const headers = Object.keys(rows[0] || {});
      if (headers.length) ws.addRow(headers);
      for (const row of rows) {
        ws.addRow(headers.map((h) => cellValue(row?.[h])));
      }
    }
  }

  if (!wb.worksheets.length) {
    wb.addWorksheet('Sheet');
  }

  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw);
}
