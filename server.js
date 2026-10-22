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
import { computeAggregates, cityName, getValue } from './lib/aggregate.js';
import { resolveField } from './lib/normalize.js';
import {
  authChallenge,
  authenticateRequest,
  isLoginRequest,
  isPublicPath,
  loginRequest,
  logoutRequest,
  securityHeaders
} from './lib/auth.js';

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

const state = {
  schema: null,
  fields: [],
  choices: {},
  signature: null,
  data: [],
  storeMaxId: null,
  version: 0,
  count: 0,
  error: null,
  geoJSON: null,
  syncing: false,
  clients: new Set()
};

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
  broadcast('stats', {
    count,
    added: results.length,
    version: state.version
  });
  return { changed: true, count, added: results.length };
}

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

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders(),
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
      ...securityHeaders(),
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
  res.write(`event: hello\ndata: ${JSON.stringify({ count: state.count, version: state.version })}\n\n`);
  res.write(`event: stats\ndata: ${JSON.stringify({ count: state.count, version: state.version })}\n\n`);

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
    version: state.version
  });
}

function handleSubmissions(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
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
  json(res, 200, {
    rows: slice.map((r) => ({
      ...r,
      __cpf: r.CPF ? '***' : null,
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
    version: state.version,
    clients: state.clients.size,
    error: state.error,
    pollIntervalMs: CONFIG.pollIntervalMs,
    fields: state.fields.length
  });
}

const server = http.createServer(async (req, res) => {
  await handleRequest(req, res);
});

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (isLoginRequest(req)) return loginRequest(req, res);
  if (req.method === 'POST' && pathname === '/api/logout') {
    const auth = await authenticateRequest(req);
    if (!auth.ok) return authChallenge(res, 401, 'Não autorizado');
    return logoutRequest(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método não permitido' });
  }

  const protectedPath = pathname !== '/health' && !isPublicPath(pathname);
  if (protectedPath) {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      if (pathname.startsWith('/api/')) return authChallenge(res, auth.status, auth.message);
      res.writeHead(302, { ...securityHeaders(), Location: `/login?next=${encodeURIComponent(pathname)}` });
      return res.end();
    }
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
      ...securityHeaders(),
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
    const pages = Math.max(1, Math.ceil(rows.length / size));
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
      res.writeHead(200, { ...securityHeaders(), 'Content-Type': 'application/geo+json', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    } catch {
      json(res, 404, { error: 'GeoJSON não encontrado' });
    }
    return;
  }

  if (pathname === '/health') {
    return json(res, 200, { ok: true, clients: state.clients.size, count: state.count });
  }

  const rel = pathname === '/login' ? 'login.html' : pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Proibido' });
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { ...securityHeaders(), 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'Não encontrado' });
  }
}

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

  server.listen(CONFIG.port, () => {
    console.log(`Dashboard em http://localhost:${CONFIG.port}`);
    console.log(`Projeto: ${CONFIG.assetUid} | Poll: ${CONFIG.pollIntervalMs / 1000}s | Registros: ${state.count}`);
    if (process.env.DASHBOARD_USER && process.env.DASHBOARD_PASS) console.log('[auth] Basic auth ativo');
  });

  pollOnce({ silent: true }).catch(() => {});
  setInterval(() => pollOnce(), CONFIG.pollIntervalMs);
  setInterval(() => koboFetchSchema().catch(() => {}), 5 * 60 * 1000);
}

process.on('SIGTERM', () => server.close());

if (typeof process.env.VERCEL === 'undefined') {
  init();
}
