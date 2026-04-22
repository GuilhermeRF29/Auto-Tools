import { readTabularRows } from './src_backend/routes/dashboard/dashboardUtils.js';

async function testSqlite() {
    console.log("Iniciando leitura SQLite via Streaming...");
    try {
        const rows = await readTabularRows('C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\database.db');
        console.log("Linhas lidas do DB gigante:", rows.length);
        if (rows.length > 0) {
            console.log("Amostra (1a linha):", rows[0]);
        }
    } catch (e) {
        console.error("Erro SQLite:", e);
    }
}
testSqlite();
