import assert from 'node:assert/strict';
import http from 'node:http';

const PORT = Number(process.env.PORT || 4173);
const BASE = process.env.BASE || `http://localhost:${PORT}`;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(`JSON inválido em ${path}: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const meta = await get('/api/meta');
  assert(meta.ok, 'meta ok');
  const count = meta.count;
  console.log(`[check] registros: ${count}`);

  const agg = await get('/api/aggregate');
  assert(agg.total === count, `total do agg (${agg.total}) == count (${count})`);

  // Invariante 1: soma das contagens por cidade == n (do período)
  const somaCidades = agg.cobertura.reduce((a, c) => a + c.n, 0);
  assert(somaCidades === agg.n, `soma cidades (${somaCidades}) == n (${agg.n})`);

  // Invariante 2: pct_total soma ~100 (arredondamento)
  const somaPct = agg.cobertura.reduce((a, c) => a + c.pct, 0);
  assert(somaPct >= 90 && somaPct <= 110, `pct_total razoável: ${somaPct}`);

  // Invariante 3: serviços distintos >= 1 quando há servicos
  assert(typeof agg.servicos.distinct === 'number', 'servicos.distinct numérico');
  assert(agg.servicos.media >= 0, 'servicos.media >= 0');

  // Invariante 4: qualidade tem os campos esperados
  assert(Array.isArray(agg.qualidade.respostaPorCampo), 'respostaPorCampo array');
  assert(typeof agg.qualidade.mediaCompletude === 'number', 'mediaCompletude numérica');
  assert(Array.isArray(agg.qualidade.duplicidadesCPF), 'duplicidadesCPF array');

  // Invariante 5: série temporal soma == total
  const somaSerie = (agg.serieTemporal || []).reduce((a, s) => a + s.novos, 0);
  assert(somaSerie === count, `soma série temporal (${somaSerie}) == total (${count})`);

  // Invariante 6: idade média coerente
  assert(agg.demografia.idade.media >= 0, 'idade media >= 0');

  // Invariante 7: submissions paginado
  const sub = await get(`/api/submissions?page=1&size=5`);
  assert(sub.total === count, `submissions total (${sub.total}) == count (${count})`);
  assert(sub.rows.length <= 5, 'page size respeitado');
  assert(sub.pages >= 1, 'páginas >= 1');

  // Invariante 8: filtro por município soma <= total
  if (agg.cobertura.length > 0) {
    const primeira = agg.cobertura[0].nome;
    const aggFiltrado = await get(`/api/aggregate?city=${encodeURIComponent(primeira)}`);
    assert(aggFiltrado.n <= count, `filtro cidade <= total`);
    assert(aggFiltrado.cobertura.length === 1, `filtro cidade retorna 1 município`);
  }

  console.log('[check] TODAS AS INVARIANTES PASSARAM');
  console.log(`  cidades alcançadas: ${agg.volumetria.cidadesAlcancadas}/22`);
  console.log(`  média idade: ${agg.demografia.idade.media}`);
  console.log(`  completude: ${agg.qualidade.mediaCompletude}%`);
  console.log(`  duplicidades CPF: ${agg.qualidade.duplicidadesCPF.length}`);
  console.log(`  dias na série: ${(agg.serieTemporal || []).length}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[check] FALHA:', err.message);
  process.exit(1);
});
