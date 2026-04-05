const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const deParaPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\De Para de Linhas.xlsx';
const baseDataPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\Forecast2\\30-03-2026.xlsx';

const normalize = (val) => String(val || '').trim().replace(/^0+/, '') || '0';

async function run() {
    // 1. Load De Para
    const wbDP = XLSX.readFile(deParaPath);
    const sheetDP = wbDP.Sheets['De Para de linhas'] || wbDP.Sheets[wbDP.SheetNames[0]];
    const rowsDP = XLSX.utils.sheet_to_json(sheetDP);
    const deParaSet = new Set();
    rowsDP.forEach(r => {
        const cod = normalize(r['Cod Linha'] || r['COD LINHA']);
        if (cod) deParaSet.add(cod);
    });

    console.log(`De Para has ${deParaSet.size} unique code entries.`);

    // 2. Load Base Data Sample
    const wbBase = XLSX.readFile(baseDataPath);
    const sheetBase = wbBase.Sheets[wbBase.SheetNames[0]];
    const rowsBase = XLSX.utils.sheet_to_json(sheetBase);
    
    const missingLineCodes = new Map();
    rowsBase.forEach(r => {
        const cod = normalize(r['LINHA'] || r['Linha'] || r['SERVIÇO'] || r['SERVICO']);
        if (!deParaSet.has(cod)) {
            missingLineCodes.set(cod, (missingLineCodes.get(cod) || 0) + 1);
        }
    });

    console.log(`\nFound ${missingLineCodes.size} line codes in base data NOT in De Para.`);
    const sortedMissing = Array.from(missingLineCodes.entries()).sort((a,b) => b[1] - a[1]);
    
    console.log('\nTop Missing Line Codes:');
    sortedMissing.slice(0, 20).forEach(([cod, count]) => {
        console.log(`Code: ${cod} | Rows: ${count}`);
    });
}

run().catch(console.error);
