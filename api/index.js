import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CONFIG,
  fetchSchema as koboFetchSchema,
  fetchIncremental,
  loadGeoJSON
} from '../lib/kobo.js';
import { computeAggregates, cityName, getValue } from '../lib/aggregate.js';
import { resolveField } from '../lib/normalize.js';

const __dirname = path.dirname(path.resolve());

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.geojson': 'application/geo+json'
};

let requireAuth = false;
if (process.env.DASHBOARD_USER && process.env.DASHBOARD_PASS) {
  requireAuth = true;
}

function basicAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return false;
  const cred = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  const [user, pass] = cred.split(':');
  return user === process.env.DASHBOARD_USER && pass === process.env.DASHBOARD_PASS;
}

function authChallenge(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Dashboard"',
    'Content-Type': 'text/plain'
  });
  res.end('Autenticação necessária');
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const state = {
  schema: null,
  fields: [],
  choices: {},
  records: [],
  data: [],
  storeMaxId: null,
  version: 0,
  count: 0,
  error: null,
  geoJSON: null,
  syncing: false,
  clients: new Set()
};

async function loadGeoJSON() {
  try {
    const data = await fs.readFile(path.join(PUBLIC_DIR, 'geo', 'acre-municipios.geojson'));
    return JSON.parse(data.toString());
  } catch { return null; }
}

async function handleRequest(req, res) {
  if (requireAuth && !basicAuth(req)) return authChallenge(res);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método não permitido' });
  }

  if (pathname === '/api/data') {
    return json(res, 200, {
      count: state.count,
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

  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ count: state.count, version: state.version })}\n\n`);
    res.write(`event: stats\ndata: ${JSON.stringify({ count: state.count, version: state.version })}\n\n`);
    state.clients.add(res);
    const ping = setInterval(() => {
      try { res.write(`: ping ${Date.now()}\n\n`); } catch { clearInterval(ping); }
    }, 20000);
    req.on('close', () => { clearInterval(ping); state.clients.delete(res); });
    return;
  }

  if (pathname === '/api/refresh') {
    const r = await pollOnce();
    return json(res, 200, { ok: true, ...r, count: state.count, version: state.version });
  }

  if (pathname === '/api/aggregate') {
    const city = url.searchParams.get('city') || undefined;
    const days = url.searchParams.get('days') || undefined;
    const agg = computeAggregates(state.data, { fields: state.fields, choices: state.choices }, state.geoJSON, { city, days });
    return json(res, 200, { ...agg, version: state.version });
  }

  if (pathname === '/api/submissions') {
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size') || 15)));
    const city = url.searchParams.get('city') || undefined;
    const q = url.searchParams.get('q') || undefined;
    const days = url.searchParams.get('days') || undefined;
    const rawSortKey = url.searchParams.get('sort') || 'submitted_at';
    const sortDir = url.searchParams.get('dir') || 'desc';

    let rows = state.data.slice();
    if (city) {
      const fCidade = resolveField(state.fields, 'Cidade da residência atual', 'wb2gy08');
      rows = rows.filter((r) => cityName(getValue(r, fCidade, state.choices)) === city);
    }
    if (q) {
      const nq = q.toLowerCase();
      rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(nq));
    }
    const SORT_KEYS = {
      nome: 'Nome_do_usu_rio',
      idade: 'Idade',
      cidade: 'Cidade_da_resid_ncia_atual',
      zona: 'Zona',
      genero: 'Identidade_de_G_nero',
      trabalha: 'Trabalha',
      renda: 'Renda_Familiar_per_capita',
      servicos: '__service_count',
      cpf: 'CPF',
      envio: '_submission_time',
      submitted_at: '_submission_time'
    };
    const sortKey = SORT_KEYS[rawSortKey] || rawSortKey;
    rows.sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      const an = Number(av), bn = Number(bv);
      let cmp = 0;
      if (av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) cmp = an - bn;
      else if (av < bv) cmp = -1;
      else if (av > bv) cmp = 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    const start = (page - 1) * size;
    const slice = rows.slice(start, start + size);
    const pages = Math.max(1, Math.ceil(total / size));
    return json(res, 200, {
      rows: slice.map((r) => ({
        ...r,
        __cpf: r.CPF ? '***' : null,
        __envio: r._submission_time || r.received_at || ''
      })),
      total: rows.length,
      page,
      pages,
      size
    });
  }

  if (pathname === '/api/meta') {
    return json(res, 200, {
      ok: true,
      count: state.count,
      version: state.version,
      clients: state.clients.size,
      error: state.error,
      pollIntervalMs: CONFIG.pollIntervalMs,
      fields: state.fields.length
    });
  }

  if (pathname === '/api/export.csv') {
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; export.csv"'
    });
    res.end('nome,idade,cidade,zona,genero,trabalha,renda,servicos,envio\n');
    return;
  }

  if (pathname === '/api/export.resumo.csv') {
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="resumo.csv"'
    });
    res.end('municipio,total\n');
    return;
  }

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

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Proibido' });
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'Não encontrado' });
  }
}

let total = 0;

async function pollOnce({ silent = false } = {}) {
  if (state.syncing) return { changed: false, count: state.count, skipped: true };
  state.syncing = true;
  try {
    const r = await syncFromKobo();
    if (r.changed && !silent) broadcast('data', { count: r.count, added: r.added });
    return r;
  } catch (err) {
    state.error = err.message;
    if (!silent) broadcast('sync-error', { message: err.message });
    return { changed: false, count: state.count, error: err.message };
  } finally {
    state.syncing = false;
  }
}

async function syncFromKobo() {
  const { results, count, lastId, changed } = await fetchIncremental(state.storeMaxId);
  if (!changed || !results.length) {
    state.count = count || state.data.length;
    state.error = null;
    return { changed: false, count: state.count };
  }
  state.data = results.concat(state.data).slice(0, CONFIG.maxRecords);
  state.storeMaxId = lastId;
  state.signature = makeSignature(state.data);
  state.version++;
  state.count = count;
  state.error = null;
  total = count;
  broadcast('stats', { count, added: results.length, version: state.version });
  return { changed: true, count, added: results.length };
}

function makeSignature(data) {
  return data.length;
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of state.clients) {
    try { client.write(payload); } catch { state.clients.delete(client); }
  }
}

async function init() {
  try {
    const schema = await koboFetchSchema();
    state.schema = schema;
    state.fields = schema.fields || [];
    state.choices = schema.choices || {};
  } catch (err) {
    console.error('[schema] falha:', err.message);
  }
  try {
    state.geoJSON = await loadGeoJSON();
  } catch (err) {
    console.warn('[geo] falha ao carregar acre-municipios.geojson:', err.message);
  }
  pollOnce({ silent: true }).catch(() => {});
  setInterval(() => pollOnce(), CONFIG.pollIntervalMs);
  setInterval(() => koboFetchSchema().catch(() => {}), 5 * 60 * 1000);
}

export default async (req, res) => {
  await handleRequest(req, res);
};

if (typeof process.env.VERCEL === 'undefined') {
  const server = http.createServer(handleRequest);
  server.listen(CONFIG.port, () => {
    console.log(`Dashboard em http://localhost:${CONFIG.port}`);
  });
  pollOnce({ silent: true }).catch(() => {});
  setInterval(() => pollOnce(), CONFIG.pollIntervalMs);
}
