import { readTabularRows } from './src_backend/routes/dashboard/dashboardUtils.js';
import { DEMAND_COLUMN_ALIASES } from './src_backend/routes/dashboard/dashboardUtils.js';

async function testFiles() {
    console.log("=== Parquet ===");
    try {
        const rowsP = await readTabularRows('C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\05-04-2026.parquet');
        console.log("Parquet rows:", rowsP.length);
        if (rowsP.length > 0) {
            console.log("Exemplo:", rowsP[0]);
        }
    } catch(e) { console.error(e); }

    console.log("\n=== DuckDB ===");
    try {
        const rowsD = await readTabularRows('C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\Forecast2\\Base_completa_teste.duckdb', {
            columnAliases: DEMAND_COLUMN_ALIASES
        });
        console.log("DuckDB rows:", rowsD.length);
        if (rowsD.length > 0) {
            console.log("Exemplo:", rowsD[0]);
        }
    } catch(e) { console.error(e); }
}

testFiles();
