const XLSX = require('xlsx');
const deParaPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\De Para de Linhas.xlsx';

try {
    const wbDePara = XLSX.readFile(deParaPath);
    const sheetDePara = wbDePara.Sheets['De Para de linhas'];
    if (sheetDePara) {
        const rowsDePara = XLSX.utils.sheet_to_json(sheetDePara, { defval: null, raw: false });
        console.log("Searching for 7072...");
        const matched = rowsDePara.filter(r => String(r['Cod Linha']) === '7072' || String(r['PREFIXO']) === '7072' || String(r['Linha']) === '7072');
        console.log(matched);
    }
} catch (e) {
    console.error(e);
}
