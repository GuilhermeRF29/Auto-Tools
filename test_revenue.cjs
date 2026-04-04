const fs = require('fs');
const XLSX = require('xlsx');

const file = 'backups_sistema/1774964787909_Relatorio Revenue Completo - Março 2026.xlsx';
const workbook = XLSX.readFile(file, { cellDates: true });
console.log('Sheetnames:', workbook.SheetNames);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
if (rows.length > 0) {
    console.log('Columns of first row:', Object.keys(rows[0]));
    console.log('First row values:', rows[0]);
} else {
    console.log('No rows found');
}
