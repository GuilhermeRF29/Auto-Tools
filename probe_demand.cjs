const XLSX = require('xlsx');

const deParaPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\De Para de Linhas.xlsx';
const baseDataPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\Forecast2\\31-03-2025.xlsx'; // using the smaller file for speed

try {
    const wbDePara = XLSX.readFile(deParaPath);
    const sheetDePara = wbDePara.Sheets[wbDePara.SheetNames[0]];
    const rowsDePara = XLSX.utils.sheet_to_json(sheetDePara, { defval: null, raw: false });
    if (rowsDePara.length > 0) {
        console.log('--- De Para Columns ---');
        console.log(Object.keys(rowsDePara[0]));
        console.log('Sample De Para Row:', rowsDePara[0]);
    }

    const wbBase = XLSX.readFile(baseDataPath);
    const sheetBase = wbBase.Sheets[wbBase.SheetNames[0]];
    const rowsBase = XLSX.utils.sheet_to_json(sheetBase, { defval: null, raw: false });
    if (rowsBase.length > 0) {
        console.log('\n--- Base Data Columns ---');
        console.log(Object.keys(rowsBase[0]));
        console.log('Sample Base Data Row:', rowsBase[0]);
    }
} catch (e) {
    console.error(e);
}
