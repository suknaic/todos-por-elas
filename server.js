import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONFIG,
  fetchSchema as koboFetchSchema,
  fetchIncremental,
  loadGeoJSON
} from './lib/kobo.js';
import { computeAggregates } from './lib/aggregate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.geojson': 'application/geo+json'
};

const BASIC_USER = process.env.DASHBOARD_USER || '';
const BASIC_PASS = process.env.DASHBOARD_PASS || '';
const requireAuth = !!(BASIC_USER && BASIC_PASS);

function basicAuth(req) {
  if (!requireAuth) return true;
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Basic\s+(.+)$/);
  if (!match) return false;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
    const [user, pass] = decoded.split(':');
    return user === BASIC_USER && pass === BASIC_PASS;
  } catch {
    return false;
  }
}

function authChallenge(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Dashboard"',
    'Content-Type': 'text/plain'
  });
  res.end('Não autorizado');
}

const state = {
  schema: null,
  fields: [],
  choices: {},
  signature: null,
  data: [],
  storeMaxId: null,
  version: 0,
  count: 0,
  lastUpdated: null,
  error: null,
  geoJSON: null,
  clients: new Set()
};

async function koboGet(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`Kobo API ${res.status} em ${url}`);
  return res.json();
}

function makeSignature(rows) {
  if (!rows.length) return 'empty';
  const last = rows[0];
  const keys = ['_id', '_uuid', '_submission_time', 'start'];
  const tail = keys.map((k) => last[k]).find((v) => v != null) || JSON.stringify(last).length;
  return `${rows.length}:${tail}`;
}

function broadcast(type, payload) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of state.clients) {
    try {
      client.write(frame);
    } catch {
      state.clients.delete(client);
    }
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const firstNames = ['Ana', 'Maria', 'Juliana', 'Beatriz', 'Camila', 'Fernanda', 'Larissa', 'Aline', 'Rafaela', 'Sandra', 'Josefa', 'Mariana', 'Patrícia', 'Tainá', 'Vanessa', 'Cristiane', 'Adriana', 'Simone'];
const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Ribeiro', 'Ferreira', 'Carvalho', 'Gomes', 'Martins'];

function pickList(listName) {
  const items = state.choices[listName] || [];
  if (!items.length) return '';
  const item = pick(items);
  return item.value ?? item.name;
}

const simNao = (p = 0.5) => (Math.random() < p ? 'sim' : 'n_o');

function makeDemoRow(i) {
  const estrangeiro = Math.random() < 0.12;
  const trabalha = simNao();
  const possuiFilhos = simNao(0.65);
  const recebeAuxilio = simNao(0.6);
  const deficiencia = simNao(0.25);
  const migrante = simNao(0.3);
  const servicos = (state.choices.zx7ud82 || [])
    .filter(() => Math.random() < 0.4)
    .map((c) => c.value ?? c.name);
  const idade = 16 + Math.floor(Math.random() * 45);
  const nivel = pickList('ex68a42');
  return {
    _id: `demo-${i}-${Date.now()}`,
    _uuid: `demo-uuid-${i}-${Date.now()}`,
    _submission_time: new Date(Date.now() - Math.floor(Math.random() * 25) * 86400000).toISOString(),
    Nome_do_usu_rio: `${pick(firstNames)} ${pick(lastNames)}`,
    RG: String(100000000 + Math.floor(Math.random() * 899999999)),
    CPF: String(10000000000 + Math.floor(Math.random() * 89999999999)),
    Idade: String(idade),
    Nacionalidade: estrangeiro ? 'estrangeiro' : 'brasileiro',
    Se_for_estrangeiro_qual_a_nacionalidade: estrangeiro ? 'Bolívia' : '',
    Telefone: `(68) 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
    Cidade_de_Nascimento: pick(['Rio Branco', 'Cruzeiro do Sul', 'Tarauacá', 'Brasília']),
    Cidade_da_resid_ncia_atual: pickList('wb2gy08'),
    Estado_de_Nasimento: pickList('wi2ra14'),
    Endere_o: `Rua ${pick(lastNames)}, ${Math.floor(1 + Math.random() * 999)}`,
    Zona: pickList('ml1hg11'),
    Possui_Filhos: possuiFilhos,
    Se_sim_quantos: possuiFilhos === 'sim' ? String(1 + Math.floor(Math.random() * 4)) : '',
    Identidade_de_G_nero: pickList('xv1wh54'),
    Orienta_o_Sexual: pickList('ma9np89'),
    Quem_o_respons_vel_to_do_grupo_familiar: pick(firstNames),
    Trabalha: trabalha,
    Se_sim_qual_o_v_nculo: trabalha === 'sim' ? pickList('ge5pp48') : '',
    Renda_Familiar_per_capita: pickList('bi8dg53'),
    Voc_ou_algu_m_da_sua_fam_lia_: recebeAuxilio,
    Se_sim_qual: recebeAuxilio === 'sim' ? pickList('pn64m63') : '',
    Migrante: migrante,
    Se_sim_Localidade: migrante === 'sim' ? pick(['Cruzeiro do Sul', 'Tabatinga', 'Guajará-Mirim']) : '',
    Cidade: migrante === 'sim' ? pick(['Cruzeiro do Sul', 'Tabatinga']) : '',
    Estado: migrante === 'sim' ? pick(['AC', 'AM', 'RO']) : '',
    H_quanto_tempo: migrante === 'sim' ? String(1 + Math.floor(Math.random() * 10)) : '',
    Voc_ou_algu_m_da_fam_lia_poss: deficiencia,
    Se_sim_qual_001: deficiencia === 'sim' ? pickList('er71y45') : '',
    Ra_a_Cor_Etnia: pickList('ch7hy55'),
    Naturalidade: pick(['Rio Branco', 'Cruzeiro do Sul', 'Tarauacá']),
    N_vel: nivel,
    Se_superior_qual: nivel === 'superior' ? pickList('cb1tv98') : '',
    Ano_de_Ingresso: String(2021 + Math.floor(Math.random() * 5)),
    Turno: pickList('si8wk37'),
    Semestre: pickList('rz1op81'),
    _acompanhado_pelo: pickList('zi7jh00'),
    Quais_servi_os_acess_ama_Juntos_Pelo_Acre: servicos.join(' ')
  };
}

let demoSeq = 0;
function seedDemoDataAppend() {
  const row = makeDemoRow(demoSeq++);
  row._submission_time = new Date().toISOString();
  state.data.unshift(row);
  if (state.data.length > 5000) state.data.length = 5000;
  state.signature = makeSignature(state.data);
  state.version++;
  state.count = state.data.length;
  state.lastUpdated = new Date().toISOString();
  broadcast('stats', {
    count: state.data.length,
    added: 1,
    lastUpdated: state.lastUpdated,
    version: state.version
  });
}

function seedDemoData(n = 48) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(makeDemoRow(i));
  rows.sort((a, b) => new Date(b._submission_time) - new Date(a._submission_time));
  demoSeq = n;
  state.data = rows;
  state.signature = makeSignature(rows);
  state.version++;
  state.count = rows.length;
  state.lastUpdated = new Date().toISOString();
  broadcast('stats', { count: rows.length, added: rows.length, lastUpdated: state.lastUpdated, version: state.version });
}

async function syncFromKobo() {
  const demo = process.env.DEMO === '1' || process.env.DEMO === 'true';
  if (demo) {
    state.signature = makeSignature(state.data);
    state.count = state.data.length;
    state.lastUpdated = new Date().toISOString();
    return { changed: false, count: state.data.length };
  }
  const { results, count, lastId, changed } = await fetchIncremental(state.storeMaxId);
  if (!changed || !results.length) {
    state.count = count || state.data.length;
    state.lastUpdated = new Date().toISOString();
    return { changed: false, count: state.count };
  }
  state.data = results.concat(state.data).slice(0, 5000);
  state.storeMaxId = lastId;
  state.signature = makeSignature(state.data);
  state.version++;
  state.count = count;
  state.lastUpdated = new Date().toISOString();
  broadcast('stats', {
    count,
    added: results.length,
    lastUpdated: state.lastUpdated,
    version: state.version
  });
  return { changed: true, count, added: results.length };
}

async function pollOnce({ silent = false } = {}) {
  try {
    const r = await syncFromKobo();
    if (r.changed && !silent) broadcast('data', { count: r.count, added: r.added, lastUpdated: state.lastUpdated });
    return r;
  } catch (err) {
    state.error = err.message;
    state.lastUpdated = new Date().toISOString();
    if (!silent) broadcast('error', { message: err.message, lastUpdated: state.lastUpdated });
    return { changed: false, count: state.count, error: err.message };
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Proibido' });
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch {
    json(res, 404, { error: 'Não encontrado' });
  }
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ count: state.count, lastUpdated: state.lastUpdated, version: state.version })}\n\n`);
  res.write(`event: stats\ndata: ${JSON.stringify({ count: state.count, lastUpdated: state.lastUpdated, version: state.version, demo: process.env.DEMO === '1' })}\n\n`);

  state.clients.add(res);
  const ping = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(ping);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    state.clients.delete(res);
  });
}

function escapeCsv(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function handleCsv(res) {
  const fields = state.fields || [];
  const header = ['submission_time', ...fields.map((f) => f.xpath)];
  const lines = [header.map(escapeCsv).join(',')];
  for (const row of state.data) {
    lines.push([
      row._submission_time || '',
      ...fields.map((f) => row[f.xpath] ?? row[f.name] ?? '')
    ].map(escapeCsv).join(','));
  }
  const payload = '\uFEFF' + lines.join('\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="todas-por-elas-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function handleCsvResumo(res) {
  const agg = computeAggregates(state.data, { fields: state.fields, choices: state.choices }, state.geoJSON, {});
  const linhas = agg.cobertura.map((c) => `${c.codigoIbge},${escapeCsv(c.nome)},${c.n},${c.pct},${c.mediaIdade},${c.urbana},${c.comServico},${c.acompanhado}`);
  const header = 'codigo_ibge,municipio,cadastros,pct_total,idade_media,urbana,com_servico,acompanhado';
  const payload = '\uFEFF' + header + '\n' + linhas.join('\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="resumo-municipios-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function handleAggregate(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const city = url.searchParams.get('city') || undefined;
  const days = url.searchParams.get('days') || undefined;
  const agg = computeAggregates(state.data, { fields: state.fields, choices: state.choices }, state.geoJSON, { city, days });
  json(res, 200, {
    ...agg,
    version: state.version,
    lastUpdated: state.lastUpdated,
    demo: process.env.DEMO === '1'
  });
}

function handleSubmissions(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size') || 15)));
  const city = url.searchParams.get('city') || undefined;
  const q = url.searchParams.get('q') || undefined;
  const days = url.searchParams.get('days') || undefined;
  const sortKey = url.searchParams.get('sort') || 'submitted_at';
  const sortDir = url.searchParams.get('dir') || 'desc';

  let rows = state.data.slice();
  if (city) {
    const fCidade = state.fields.find((f) => f.list === 'wb2gy08' || f.name === 'Cidade_da_resid_ncia_atual');
    rows = rows.filter((r) => {
      const v = r[fCidade.xpath] ?? r[fCidade.name] ?? '';
      return String(v) === city;
    });
  }
  if (q) {
    const nq = q.toLowerCase();
    rows = rows.filter((r) => {
      const hay = JSON.stringify(r).toLowerCase();
      return hay.includes(nq);
    });
  }
  if (days) {
    const since = new Date(Date.now() - days * 86400000);
    rows = rows.filter((r) => new Date(r.submitted_at || r._submission_time || r.start) >= since);
  }
  const total = rows.length;
  rows.sort((a, b) => {
    const av = a[sortKey] || a._submission_time || '';
    const bv = b[sortKey] || b._submission_time || '';
    let cmp = 0;
    if (av < bv) cmp = -1;
    else if (av > bv) cmp = 1;
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const start = (page - 1) * size;
  const slice = rows.slice(start, start + size);
  const pages = Math.max(1, Math.ceil(total / size));
  json(res, 200, {
    rows: slice.map((r) => ({
      ...r,
      __cpf: r.CPF ? '***' : null,
      __rg: r.RG ? '***' : null,
      __envio: r._submission_time || r.received_at || ''
    })),
    total,
    page,
    pages,
    size
  });
}

function handleMeta(req, res) {
  json(res, 200, {
    ok: true,
    count: state.count,
    lastUpdated: state.lastUpdated,
    version: state.version,
    demo: process.env.DEMO === '1',
    clients: state.clients.size,
    error: state.error,
    pollIntervalMs: CONFIG.pollIntervalMs,
    fields: state.fields.length
  });
}

const server = http.createServer(async (req, res) => {
  if (requireAuth && !basicAuth(req)) return authChallenge(res);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método não permitido' });
  }

  if (pathname === '/api/data') {
    return json(res, 200, {
      count: state.count,
      lastUpdated: state.lastUpdated,
      error: state.error,
      pollIntervalMs: CONFIG.pollIntervalMs,
      results: state.data
    });
  }

  if (pathname === '/api/schema') {
    return json(res, 200, {
      schema: state.schema,
      error: null,
      fields: state.fields.length
    });
  }

  if (pathname === '/api/stream') return handleStream(req, res);

  if (pathname === '/api/refresh') {
    const r = await pollOnce();
    return json(res, 200, { ok: true, ...r, count: state.count, lastUpdated: state.lastUpdated, version: state.version });
  }

  if (pathname === '/api/aggregate') return handleAggregate(req, res);

  if (pathname === '/api/submissions') return handleSubmissions(req, res);

  if (pathname === '/api/meta') return handleMeta(req, res);

  if (pathname === '/api/export.csv') return handleCsv(res);

  if (pathname === '/api/export.resumo.csv') return handleCsvResumo(res);

  if (pathname === '/geo/acre-municipios.geojson') {
    try {
      const data = await fs.readFile(path.join(PUBLIC_DIR, 'geo', 'acre-municipios.geojson'));
      res.writeHead(200, { 'Content-Type': 'application/geo+json', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    } catch {
      json(res, 404, { error: 'GeoJSON não encontrado' });
    }
    return;
  }

  if (pathname === '/health') {
    return json(res, 200, { ok: true, clients: state.clients.size, count: state.count });
  }

  return serveStatic(req, res, pathname);
});

async function init() {
  try {
    const schema = await koboFetchSchema();
    state.schema = schema;
    state.fields = schema.fields || [];
    state.choices = schema.choices || {};
    if (schema.title) {
      console.log(`[schema] ${schema.title} · ${state.fields.length} campos`);
    }
  } catch (err) {
    console.error('[schema] falha:', err.message);
  }
  try {
    state.geoJSON = await loadGeoJSON();
  } catch (err) {
    console.warn('[geo] falha ao carregar acre-municipios.geojson:', err.message);
  }

  const demoEnv = process.env.DEMO === '1' || process.env.DEMO === 'true';
  if (demoEnv) {
    seedDemoData(Number(process.env.DEMO_ROWS || 48));
    console.log(`[demo] ${state.count} registros de demonstração injetados`);
  } else {
    await pollOnce({ silent: true });
  }

  setInterval(() => pollOnce(), CONFIG.pollIntervalMs);
  setInterval(() => koboFetchSchema().catch(() => {}), 5 * 60 * 1000);

  server.listen(CONFIG.port, () => {
    console.log(`Dashboard em http://localhost:${CONFIG.port}`);
    console.log(`Projeto: ${CONFIG.assetUid} | Poll: ${CONFIG.pollIntervalMs / 1000}s | Registros: ${state.count}`);
    if (requireAuth) console.log('[auth] Basic auth ativo');
  });
}

process.on('SIGTERM', () => server.close());

init();
