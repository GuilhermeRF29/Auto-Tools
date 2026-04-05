const q = "http://127.0.0.1:3001/api/demand-dashboard?baseDir=C:\\Users\\guilherme.felix\\Documents\\Relat%C3%B3rio%20Demanda\\DASH%20Forecast\\Forecast2&noCache=true";
fetch(q).then(r=>r.json()).then(j => {
    console.log('FilesRead:', j.meta.filesRead);
    console.log('Records:', j.meta.records);
    if(j.meta.groupedByObservation && j.meta.groupedByObservation["2026-03-30"]) {
        const rows = j.meta.groupedByObservation["2026-03-30"];
        let totalPax = 0;
        let totalOferta = 0;
        const mercados = new Set();
        rows.forEach(r => {
             totalPax += r.ocupacao;
             totalOferta += r.capacidade;
             mercados.add(r.mercado);
        });
        console.log('Total Pax:', totalPax);
        console.log('Total Oferta:', totalOferta);
        console.log('APV Total:', ((totalPax / totalOferta) * 100).toFixed(2) + '%');
        console.log('Unique Markets count:', mercados.size);
    }
}).catch(console.error);
