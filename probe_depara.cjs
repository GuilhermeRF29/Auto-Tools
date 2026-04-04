const XLSX = require('xlsx');
const deParaPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\De Para de Linhas.xlsx';

try {
    const wbDePara = XLSX.readFile(deParaPath);
    console.log('Sheets:', wbDePara.SheetNames);
    const sheetDePara = wbDePara.Sheets['De Para de linhas'];
    if (sheetDePara) {
        const rowsDePara = XLSX.utils.sheet_to_json(sheetDePara, { defval: null, raw: false });
        console.log('Columns:', Object.keys(rowsDePara[0]));
        console.log(rowsDePara.slice(0, 5));
    }
} catch (e) {
    console.error(e);
}
