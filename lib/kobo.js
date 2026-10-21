import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CONFIG = {
  //a8eeErM848tiUcqJXeES3d || a4xXqaUpseysrRoz8s4JKV
  assetUid: process.env.KOBO_ASSET_UID || 'a8eeErM848tiUcqJXeES3d',
  apiBase: process.env.KOBO_API_BASE || 'https://kf.kobotoolbox.org/api/v2',
  pageSize: 1000,
  maxRecords: Number(process.env.MAX_RECORDS || 50000),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 15000),
  port: Number(process.env.PORT || 3000)
};

export async function koboGet(url, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(45000)
      });
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Kobo API ${res.status} em ${url}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fetchAsset() {
  return koboGet(`${CONFIG.apiBase}/assets/${CONFIG.assetUid}/`);
}

export async function fetchSchema() {
  const asset = await fetchAsset();
  let content = asset.content || {};
  const deployedId = asset.deployed_version_id;
  if (deployedId) {
    try {
      const deployed = await koboGet(`${CONFIG.apiBase}/assets/${CONFIG.assetUid}/versions/${deployedId}/`);
      if (deployed && deployed.content) content = deployed.content;
    } catch (err) {
      console.warn('[schema] falha ao carregar versão implantada; usando rascunho:', err.message);
    }
  }
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
  return {
    title: asset.name || 'Cadastro de Usuários',
    description: (asset.settings || {}).description || '',
    formUrl: (asset.deployment__links || {}).single_url || null,
    version: deployedId || asset.version_id || null,
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
}

export async function fetchAllData() {
  const results = [];
  let url = `${CONFIG.apiBase}/assets/${CONFIG.assetUid}/data/?limit=${CONFIG.pageSize}`;
  while (url) {
    const page = await koboGet(url);
    results.push(...(page.results || []));
    if (results.length >= CONFIG.maxRecords) break;
    url = page.next;
  }
  return results;
}

export async function fetchDataDiff(lastId) {
  const results = await fetchAllData();
  if (lastId == null) return { results, lastId: null };
  const filtered = results.filter((r) => {
    const n = Number(r._id);
    return Number.isFinite(n) && n > lastId;
  });
  return { results: filtered, lastId: lastId };
}

export async function fetchIncremental(lastId) {
  const pageSize = CONFIG.pageSize;
  const page1 = await koboGet(`${CONFIG.apiBase}/assets/${CONFIG.assetUid}/data/?limit=${pageSize}`);
  const count = page1.count ?? 0;
  const results1 = page1.results || [];
  const candidateIds = results1.map((r) => Number(r._id)).filter(Number.isFinite);
  if (count > pageSize) {
    const lastOffset = count - pageSize;
    const lastPage = await koboGet(`${CONFIG.apiBase}/assets/${CONFIG.assetUid}/data/?limit=${pageSize}&offset=${lastOffset}`);
    candidateIds.push(...(lastPage.results || []).map((r) => Number(r._id)).filter(Number.isFinite));
  }
  const maxSample = candidateIds.length ? Math.max(...candidateIds) : null;
  const hasNew = maxSample != null && maxSample > lastId;
  if (!hasNew) return { results: [], count, lastId, changed: false };
  const all = await fetchAllData();
  const maxAll = all.length ? Math.max(...all.map((r) => Number(r._id)).filter(Number.isFinite)) : lastId;
  const newResults = lastId == null
    ? all
    : all.filter((r) => { const n = Number(r._id); return Number.isFinite(n) && n > lastId; });
  return { results: newResults, count, lastId: maxAll, changed: newResults.length > 0 };
}

export async function loadGeoJSON() {
  const rel = path.join(__dirname, '..', 'public', 'geo', 'acre-municipios.geojson');
  const text = await fs.readFile(rel, 'utf-8');
  return JSON.parse(text);
}
