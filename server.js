import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const CONFIG = {
  assetUid: process.env.KOBO_ASSET_UID || 'a8eeErM848tiUcqJXeES3d',

  exportSettingsUid: process.env.KOBO_EXPORT_UID || 'aiJnVoQnGvKBSATXBugyNZ',
  apiBase: process.env.KOBO_API_BASE || 'https://kf.kobotoolbox.org/api/v2',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 15000),
  port: Number(process.env.PORT || 3000),
  pageSize: 1000
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8'
};

const state = {
  data: null,
  meta: { count: 0, lastUpdated: null, error: null, submissionCount: null },
  schema: null,
  schemaError: null,
  signature: null,
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

async function fetchSchema() {
  try {
    const asset = await koboGet(`${CONFIG.apiBase}/assets/${CONFIG.assetUid}/`);
    const content = asset.content || {};
    const survey = (content.survey || []).filter((q) => {
      const t = q.type || '';
      return !['start', 'end', 'note', 'begin_group', 'end_group', 'begin_repeat', 'end_repeat'].includes(t);
    });
    const choices = {};
    for (const c of content.choices || []) {
      const list = c.list_name;
      if (!choices[list]) choices[list] = [];
      choices[list].push({
        name: c.name,
        label: ((c.label || [])[0] || c.name).trim(),
        value: c.$autovalue || c.name
      });
    }
    state.schema = {
      title: asset.name || 'Cadastro de Usuários',
      description: (asset.settings || {}).description || '',
      languages: (asset.summary || {}).languages || [],
      updated: asset.date_modified,
      deployed: asset.date_deployed,
      formUrl: (asset.deployment__links || {}).single_url || null,
      fields: survey.map((q) => ({
        name: q.name || q.$xpath || q.$autoname,
        xpath: q.$xpath || q.$autoname || q.name,
        type: q.type,
        label: ((q.label || [])[0] || q.name || '').trim(),
        list: q.select_from_list_name || null,
        relevant: q.relevant || null,
        required: !!q.required
      })),
      choices
    };
    state.schemaError = null;
  } catch (err) {
    state.schemaError = err.message;
  }
}

async function fetchData() {
  const results = [];
  let url = `${CONFIG.apiBase}/assets/${CONFIG.assetUid}/data/?limit=${CONFIG.pageSize}`;
  let count = 0;
  while (url) {
    const page = await koboGet(url);
    count = page.count ?? count;
    results.push(...(page.results || []));
    url = page.next;
  }
  return { results, count };
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

function makeDemoRow(i) {
  const first = ['Ana', 'Maria', 'Juliana', 'Beatriz', 'Camila', 'Fernanda', 'Larissa', 'Aline', 'Rafaela', 'Sandra', 'Josefa', 'Mariana', 'Patrícia', 'Tainá', 'Vanessa', 'Cristiane', 'Adriana', 'Simone'];
  const last = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Ribeiro', 'Ferreira', 'Carvalho', 'Gomes', 'Martins'];
  const pickList = (listName) => {
    const items = state.schema?.choices?.[listName] || [];
    if (!items.length) return '';
    const item = pick(items);
    return item.value ?? item.name;
  };
  const simNao = (p = 0.5) => (Math.random() < p ? 'sim' : 'n_o');

  const estrangeiro = Math.random() < 0.12;
  const trabalha = simNao();
  const possuiFilhos = simNao(0.65);
  const recebeAuxilio = simNao(0.6);
  const deficiencia = simNao(0.25);
  const migrante = simNao(0.3);
  const servicos = (state.schema?.choices?.zx7ud82 || [])
    .filter(() => Math.random() < 0.4)
    .map((c) => c.value ?? c.name);
  const idade = 16 + Math.floor(Math.random() * 45);
  const nivel = pickList('ex68a42');
  return {
    _id: `demo-${i}-${Date.now()}`,
    _uuid: `demo-uuid-${i}-${Date.now()}`,
    _submission_time: new Date(Date.now() - Math.floor(Math.random() * 25) * 86400000).toISOString(),
    Nome_do_usu_rio: `${pick(first)} ${pick(last)}`,
    RG: String(100000000 + Math.floor(Math.random() * 899999999)),
    CPF: String(10000000000 + Math.floor(Math.random() * 89999999999)),
    Idade: String(idade),
    Nacionalidade: estrangeiro ? 'estrangeiro' : 'brasileiro',
    Se_for_estrangeiro_qual_a_nacionalidade: estrangeiro ? 'Bolívia' : '',
    Telefone: `(68) 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
    Cidade_de_Nascimento: pick(['Rio Branco', 'Cruzeiro do Sul', 'Tarauacá', 'Sena Madureira', 'Brasília']),
    Cidade_da_resid_ncia_atual: pickList('wb2gy08'),
    Estado_de_Nasimento: pickList('wi2ra14'),
    Endere_o: `Rua ${pick(last)}, ${Math.floor(1 + Math.random() * 999)}`,
    Zona: pickList('ml1hg11'),
    Possui_Filhos: possuiFilhos,
    Se_sim_quantos: possuiFilhos === 'sim' ? String(1 + Math.floor(Math.random() * 4)) : '',
    Identidade_de_G_nero: pickList('xv1wh54'),
    Orienta_o_Sexual: pickList('ma9np89'),
    Quem_o_respons_vel_to_do_grupo_familiar: pick(first),
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
}

function seedDemoData(n = 48) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(makeDemoRow(i));
  rows.sort((a, b) => new Date(b._submission_time) - new Date(a._submission_time));
  demoSeq = n;
  state.data = rows;
  state.signature = makeSignature(rows);
  state.meta = { count: rows.length, lastUpdated: new Date().toISOString(), error: null, submissionCount: rows.length };
}

async function pollOnce({ silent = false } = {}) {
  if (state.data) {
    if (process.env.DEMO === '1' || process.env.DEMO === 'true') {
      if (Math.random() < 0.7) {
        const before = state.data.length;
        seedDemoDataAppend();
        state.signature = makeSignature(state.data);
        state.meta = { count: state.data.length, lastUpdated: new Date().toISOString(), error: null, submissionCount: state.data.length };
        broadcast('data', { count: state.data.length, previousCount: before, added: state.data.length - before, lastUpdated: state.meta.lastUpdated, results: state.data });
        return { changed: true, count: state.data.length };
      }
    }
    const changed = makeSignature(state.data) !== state.signature;
    state.signature = makeSignature(state.data);
    state.meta = { count: state.data.length, lastUpdated: new Date().toISOString(), error: null, submissionCount: state.data.length };
    if (changed && !silent) broadcast('data', { count: state.data.length, previousCount: 0, added: state.data.length, lastUpdated: state.meta.lastUpdated, results: state.data });
    return { changed, count: state.data.length };
  }
  try {
    const { results, count } = await fetchData();
    const signature = makeSignature(results);
    const changed = signature !== state.signature;
    const previousCount = state.meta.count;

    state.data = results;
    state.signature = signature;
    state.meta = {
      count,
      lastUpdated: new Date().toISOString(),
      error: null,
      submissionCount: count
    };

    if (changed && !silent) {
      broadcast('data', {
        count,
        previousCount,
        added: Math.max(0, results.length - previousCount),
        lastUpdated: state.meta.lastUpdated,
        results
      });
    }
    return { changed, count };
  } catch (err) {
    state.meta.error = err.message;
    state.meta.lastUpdated = new Date().toISOString();
    if (!silent) broadcast('error', { message: err.message, lastUpdated: state.meta.lastUpdated });
    return { changed: false, count: state.meta.count, error: err.message };
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
  res.write(`event: hello\ndata: ${JSON.stringify({ count: state.meta.count, lastUpdated: state.meta.lastUpdated })}\n\n`);
  res.write(`event: data\ndata: ${JSON.stringify({
    count: state.meta.count,
    lastUpdated: state.meta.lastUpdated,
    results: state.data
  })}\n\n`);

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

function handleCsv(res) {
  const fields = state.schema?.fields || [];
  const header = ['submission_time', ...fields.map((f) => f.xpath)];
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(escape).join(',')];
  for (const row of state.data) {
    lines.push([
      row._submission_time || '',
      ...fields.map((f) => row[f.xpath] ?? row[f.name] ?? '')
    ].map(escape).join(','));
  }
  const payload = '﻿' + lines.join('\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="todas-por-elas-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método não permitido' });
  }

  if (pathname === '/api/data') {
    return json(res, 200, {
      count: state.meta.count,
      lastUpdated: state.meta.lastUpdated,
      error: state.meta.error,
      pollIntervalMs: CONFIG.pollIntervalMs,
      results: state.data
    });
  }

  if (pathname === '/api/schema') {
    return json(res, 200, {
      schema: state.schema,
      error: state.schemaError,
      exportSettingsUid: CONFIG.exportSettingsUid
    });
  }

  if (pathname === '/api/stream') return handleStream(req, res);

  if (pathname === '/api/refresh') {
    const r = await pollOnce();
    return json(res, 200, { ok: true, ...r, count: state.meta.count, lastUpdated: state.meta.lastUpdated });
  }

  if (pathname === '/api/export.csv') return handleCsv(res);

  if (pathname === '/health') {
    return json(res, 200, { ok: true, clients: state.clients.size, count: state.meta.count });
  }

  return serveStatic(req, res, pathname);
});

await fetchSchema();

const demoEnv = process.env.DEMO === '1' || process.env.DEMO === 'true';
if (demoEnv) {
  seedDemoData(Number(process.env.DEMO_ROWS || 48));
  console.log(`[demo] ${state.meta.count} registros de demonstração injetados`);
} else {
  await pollOnce({ silent: true });
}

setInterval(() => pollOnce(), CONFIG.pollIntervalMs);
setInterval(() => fetchSchema(), 5 * 60 * 1000);

server.listen(CONFIG.port, () => {
  console.log(`Dashboard TodosPorElas em http://localhost:${CONFIG.port}`);
  console.log(`Projeto: ${CONFIG.assetUid} | Poll: ${CONFIG.pollIntervalMs / 1000}s | Registros: ${state.meta.count}`);
});
