import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
let proc;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(new Error(`JSON inválido em ${path}: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  proc = spawn('node', ['server.js'], {
    env: { ...process.env, DEMO: '1', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', () => {});

  // espera o server subir
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      await get('/health');
      ready = true;
      break;
    } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  assert(ready, 'servidor não subiu');

  const meta = await get('/api/meta');
  assert(meta.ok, 'meta ok');
  assert(meta.demo === true, 'modo demo');
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
  assert(Array.isArray(agg.qualidade.duplicidadesRG), 'duplicidadesRG array');

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
  console.log(`  duplicidades CPF: ${agg.qualidade.duplicidadesCPF.length} | RG: ${agg.qualidade.duplicidadesRG.length}`);
  console.log(`  dias na série: ${(agg.serieTemporal || []).length}`);
}

main().then(() => {
  if (proc) proc.kill('SIGTERM');
  process.exit(0);
}).catch((err) => {
  console.error('[check] FALHA:', err.message);
  if (proc) proc.kill('SIGTERM');
  process.exit(1);
});
