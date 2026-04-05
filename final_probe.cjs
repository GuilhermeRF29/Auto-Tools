const XLSX = require('xlsx');
const deParaPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\De Para de Linhas.xlsx';
const baseDataPath = 'C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\Forecast2\\30-03-2026.xlsx';

try {
    const wbDePara = XLSX.readFile(deParaPath);
    const sheetDePara = wbDePara.Sheets['De Para de linhas'];
    const rowsDePara = XLSX.utils.sheet_to_json(sheetDePara, { defval: null, raw: false });
    
    console.log('--- DE PARA SAMPLES ---');
    console.log(rowsDePara.slice(0, 5).map(r => ({ 'Cod Linha': r['Cod Linha'], type: typeof r['Cod Linha'] })));

    const wbBase = XLSX.readFile(baseDataPath);
    const sheetBase = wbBase.Sheets[wbBase.SheetNames[0]];
    const rowsBase = XLSX.utils.sheet_to_json(sheetBase, { defval: null, raw: false, range: 0 }); // read first few
    
    console.log('\n--- BASE DATA SAMPLES ---');
    // find 'Linha' or 'Servico'
    rowsBase.slice(0, 5).forEach(r => {
        console.log({ 
            Linha: r['Linha'], typeLinha: typeof r['Linha'],
            'Serviço': r['Serviço'], typeServ: typeof r['Serviço']
        });
    });
} catch (e) {
    console.error(e);
}
