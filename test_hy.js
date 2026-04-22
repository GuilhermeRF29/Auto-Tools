import * as hyparquet from 'hyparquet';
console.log(Object.keys(hyparquet));
const { asyncBufferFromFile, parquetRead } = hyparquet;

async function test() {
    const file = await asyncBufferFromFile('C:\\Users\\guilherme.felix\\Documents\\Relatório Demanda\\DASH Forecast\\05-04-2026.parquet');
    await hyparquet.parquetRead({
        file,
        onComplete: (data) => console.log('Rows:', data.length),
    });
}
test().catch(console.error);
