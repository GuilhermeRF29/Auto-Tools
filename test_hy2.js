import * as hyparquet from 'hyparquet';
const { asyncBufferFromFile, parquetReadObjects, parquetRead } = hyparquet;

async function test() {
    const file = await asyncBufferFromFile('C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\05-04-2026.parquet');
    try {
        await parquetReadObjects({ file, onComplete: (d) => console.log('CB:', d.length) });
    } catch(e) {}
    
    try {
        const data = await parquetRead({ file });
        console.log('ReadAsync:', data?.length);
    } catch(e) {}

    try {
        const dataObjects = await parquetReadObjects({ file });
        console.log('ObjectsReturn:', dataObjects?.length);
    } catch(e) {}
}
test().catch(console.error);
