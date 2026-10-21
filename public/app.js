const API_SCHEMA = '/api/schema';
const API_DATA = '/api/data';
const API_STREAM = '/api/stream';
const PAGE_SIZE = 15;

const PALETTE = [
  '#7c3aed', '#db2777', '#0ea5e9', '#059669', '#f59e0b',
  '#ef4444', '#8b5cf6', '#14b8a6', '#6366f1', '#ec4899',
  '#22c55e', '#eab308', '#06b6d4', '#f97316', '#a855f7',
  '#84cc16', '#0891b2', '#d946ef', '#facc15', '#64748b', '#1e293b'
];

const $ = (id) => document.getElementById(id);

const app = {
  schema: null,
  fields: [],
  fieldsByXpath: new Map(),
  records: [],
  charts: new Map(),
  page: 1,
  sort: { key: 'envio', dir: 'desc' },
  search: '',
  reveal: false,
  freshIds: new Set(),
  lastCount: 0
};

function normKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(v) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const diff = Math.max(0, (now - d) / 1000);
  if (diff < 60) return 'agora há pouco';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function animNum(el, to, decimals = 0) {
  if (!el) return;
  const from = Number(el.dataset.v || 0);
  if (from === to) { el.textContent = decimals ? to.toFixed(decimals) : String(to); el.dataset.v = to; return; }
  const t0 = performance.now();
  const dur = 620;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * e;
    el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('pt-BR');
    if (p < 1) requestAnimationFrame(step);
    else el.dataset.v = to;
  };
  requestAnimationFrame(step);
}

function setKpi(id, value, decimals = 0) {
  animNum($(id), value, decimals);
}

function choiceLabel(listName, value) {
  if (value == null || value === '') return '';
  if (!listName || !app.schema?.choices?.[listName]) return String(value).trim();
  const items = app.schema.choices[listName];
  const wanted = normKey(value);
  const hit = items.find((c) => normKey(c.name) === wanted || normKey(c.value) === wanted || normKey(c.label) === wanted);
  return hit ? hit.label : String(value).trim();
}

function getValue(rec, field) {
  const v = rec[field.xpath] ?? rec[field.name] ?? rec[normKey(field.xpath)];
  if (v == null) return '';
  if (field.type === 'select_multiple') {
    const arr = Array.isArray(v) ? v : String(v).split(/[;, ]+/).filter(Boolean);
    return arr.map((x) => choiceLabel(field.list, x)).filter(Boolean);
  }
  if (field.list) return choiceLabel(field.list, v);
  return String(v).trim();
}

function field(labelPart) {
  const wanted = normKey(labelPart);
  const exact = app.fields.find((f) =>
    normKey(f.xpath) === wanted || normKey(f.name) === wanted || normKey(f.label) === wanted
  );
  if (exact) return exact;
  return app.fields.find((f) => normKey(f.label).includes(wanted) || normKey(f.xpath).includes(wanted));
}

function countsOf(f, { multi = false } = {}) {
  const map = new Map();
  if (!f) return map;
  for (const rec of app.records) {
    const v = getValue(rec, f);
    const items = multi ? (Array.isArray(v) ? v : [v]) : [v];
    for (const raw of items) {
      const label = Array.isArray(raw) ? raw : raw;
      if (!label) continue;
      const key = String(label).trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return map;
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function destroyChart(id) {
  const c = app.charts.get(id);
  if (c) { c.destroy(); app.charts.delete(id); }
}

function mountChart(id, config) {
  if (!window.Chart) return;
  const canvas = $(id);
  if (!canvas) return;
  destroyChart(id);
  app.charts.set(id, new Chart(canvas.getContext('2d'), config));
}

const commonOpts = () => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 650, easing: 'easeOutQuart' },
  plugins: {
    legend: {
      labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14, font: { size: 11.5, family: 'Inter', weight: '500' }, color: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() }
    },
    tooltip: {
      backgroundColor: '#1c1730',
      padding: 10,
      cornerRadius: 9,
      titleFont: { family: 'Inter', size: 12 },
      bodyFont: { family: 'Inter', size: 12 }
    }
  }
});

const barOpts = (horizontal = false) => ({
  ...commonOpts(),
  indexAxis: horizontal ? 'y' : 'x',
  plugins: { ...commonOpts().plugins, legend: { display: false } },
  scales: {
    x: {
      grid: { display: horizontal, color: 'rgba(140,130,170,.14)' },
      ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(), font: { size: 11, family: 'Inter' }, maxRotation: horizontal ? 0 : 45, autoSkip: true },
      border: { display: false }
    },
    y: {
      grid: { display: !horizontal, color: 'rgba(140,130,170,.14)' },
      ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(), font: { size: 11, family: 'Inter' }, precision: 0, autoSkip: horizontal },
      border: { display: false },
      beginAtZero: true
    }
  }
});

function barChart(id, map, { horizontal = false, max = 12 } = {}) {
  const entries = horizontal ? sortedEntries(map) : [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const data = entries.slice(0, max);
  mountChart(id, {
    type: 'bar',
    data: {
      labels: data.map((d) => d[0] || '—'),
      datasets: [{
        data: data.map((d) => d[1]),
        backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length] + 'd9'),
        borderColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1.2,
        borderRadius: 7,
        maxBarThickness: horizontal ? 22 : 44
      }]
    },
    options: barOpts(horizontal)
  });
}

function doughnutChart(id, map) {
  const entries = sortedEntries(map);
  const empty = entries.length === 0;
  mountChart(id, {
    type: 'doughnut',
    data: {
      labels: empty ? ['Sem dados'] : entries.map((d) => d[0]),
      datasets: [{
        data: empty ? [1] : entries.map((d) => d[1]),
        backgroundColor: (empty ? ['#e7e3f0'] : entries.map((_, i) => PALETTE[i % PALETTE.length])).map((c) => c + (c.startsWith('#') && c.length === 7 ? 'e6' : '')),
        borderColor: 'transparent',
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      ...commonOpts(),
      cutout: '62%',
      plugins: {
        ...commonOpts().plugins,
        legend: {
          position: 'right',
          labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 11, font: { size: 11.5, family: 'Inter' }, color: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() }
        }
      }
    }
  });
}

function ageBuckets(f) {
  const buckets = new Map();
  if (!f) return buckets;
  for (const rec of app.records) {
    const n = Number(String(getValue(rec, f)).replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    const label = n < 18 ? '0–17' : n < 25 ? '18–24' : n < 35 ? '25–34' : n < 45 ? '35–44' : n < 55 ? '45–54' : '55+';
    buckets.set(label, (buckets.get(label) || 0) + 1);
  }
  return buckets;
}

function renderKpis() {
  const total = app.records.length;
  setKpi('kpiTotal', total);
  $('kpiTotalSub').textContent = total === 0 ? 'aguardando respostas' : `${total === 1 ? 'resposta recebida' : 'respostas recebidas'}`;

  const fIdade = field('Idade:');
  const ages = app.records
    .map((r) => Number(String(getValue(r, fIdade)).replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);
  const avg = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
  setKpi('kpiIdade', ages.length ? Number(avg.toFixed(1)) : 0, ages.length ? 1 : 0);
  $('kpiIdadeSub').textContent = ages.length ? `anos · ${ages.length} informado(s)` : 'sem idades informadas';

  const zona = countsOf(field('Zona:'));
  const urb = zona.get('Urbana') || 0;
  const urbPct = total ? Math.round((urb / total) * 100) : 0;
  setKpi('kpiUrbana', urbPct, 0);
  $('kpiUrbanaSub').textContent = total ? `${urb} de ${total} registros` : 'das residências informadas';

  const acomp = countsOf(field('É acompanhado pelo'));
  const acompTotal = [...acomp.values()].reduce((a, b) => a + b, 0);
  setKpi('kpiAcomp', acompTotal);
  $('kpiAcompSub').textContent = 'CRASS / CREAS';

  const fQtd = field('Se sim, quantos');
  const filhos = app.records.reduce((acc, r) => {
    const n = Number(getValue(r, fQtd));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  setKpi('kpiFilhos', filhos);
  $('kpiFilhosSub').textContent = 'filhos informados';

  const serv = countsOf(field('Quais serviços'), { multi: true });
  setKpi('kpiServicos', sortedEntries(serv).filter(([, v]) => v > 0).length);
  $('kpiServicosSub').textContent = 'itens distintos acessados';
}

function renderCharts() {
  barChart('chartCidade', countsOf(field('Cidade da residência atual')), { horizontal: true, max: 25 });
  doughnutChart('chartGenero', countsOf(field('Identidade de gênero')));
  doughnutChart('chartZona', countsOf(field('Zona:')));
  barChart('chartRaca', countsOf(field('Raça/Cor/Etnia')));
  barChart('chartOrientacao', countsOf(field('Orientação Sexual')), { horizontal: true });
  barChart('chartIdade', ageBuckets(field('Idade:')));
  barChart('chartRenda', countsOf(field('Renda Familiar per capita')), { horizontal: true });
  doughnutChart('chartTrabalha', countsOf(field('Trabalha?')));
  doughnutChart('chartNacionalidade', countsOf(field('Nacionalidade')));
  doughnutChart('chartFilhos', countsOf(field('Possui Filhos?')));
  doughnutChart('chartAuxilio', countsOf(field('recebe algum auxílio')));
  doughnutChart('chartDeficiencia', countsOf(field('possui alguma deficiência')));
  doughnutChart('chartMigrante', countsOf(field('Migrante?')));

  barChart('chartNivel', countsOf(field('Nível:')));
  barChart('chartTurno', countsOf(field('Turno:')));
  barChart('chartSuperior', countsOf(field('Se superior, qual')));
  barChart('chartIngresso', countsOf(field('Ano de Ingresso')));

  doughnutChart('chartAcompanhado', countsOf(field('É acompanhado pelo')));
  barChart('chartServicos', countsOf(field('Quais serviços'), { multi: true }), { horizontal: true, max: 25 });
}

const TABLE_COLS = [
  { key: 'nome', label: 'Nome', get: (r) => r.__nome, html: (r) => esc(r.__nome) || '<span class="masked">sem nome</span>' },
  { key: 'idade', label: 'Idade', get: (r) => r.__idade, html: (r) => esc(r.__idade) },
  { key: 'cidade', label: 'Cidade', get: (r) => r.__cidade, html: (r) => esc(r.__cidade) },
  { key: 'zona', label: 'Zona', get: (r) => r.__zona, html: (r) => r.__zona ? `<span class="pill">${esc(r.__zona)}</span>` : '' },
  { key: 'genero', label: 'Gênero', get: (r) => r.__genero, html: (r) => esc(r.__genero) },
  { key: 'trabalha', label: 'Trabalha', get: (r) => r.__trabalha, html: (r) => esc(r.__trabalha) },
  { key: 'renda', label: 'Renda per capita', get: (r) => r.__renda, html: (r) => esc(r.__renda) },
  { key: 'acomp', label: 'Acompanhamento', get: (r) => r.__acomp, html: (r) => r.__acomp ? `<span class="pill">${esc(r.__acomp)}</span>` : '' },
  { key: 'servicos', label: 'Serviços', get: (r) => r.__servicos.length, html: (r) => r.__servicos.length ? `<span class="pill">${r.__servicos.length}</span>` : '' },
  { key: 'rg', label: 'RG', get: (r) => r.__rg, html: (r) => (r.__rg ? (app.reveal ? esc(r.__rg) : '<span class="masked">•••••</span>') : '') },
  { key: 'cpf', label: 'CPF', get: (r) => r.__cpf, html: (r) => (r.__cpf ? (app.reveal ? esc(r.__cpf) : '<span class="masked">••••••••</span>') : '') },
  { key: 'envio', label: 'Envio', get: (r) => r.__envioTs, html: (r) => esc(r.__envio) }
];

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function enrich(rec) {
  const get = (label) => getValue(rec, field(label));
  const servicos = get('Quais serviços');
  const envio = rec._submission_time || rec._id || '';
  return {
    ...rec,
    __nome: get('Nome do usuário'),
    __idade: get('Idade:'),
    __rg: get('RG:'),
    __cpf: get('CPF:'),
    __cidade: get('Cidade da residência atual'),
    __zona: get('Zona:'),
    __genero: get('Identidade de gênero'),
    __trabalha: get('Trabalha?'),
    __renda: get('Renda Familiar per capita'),
    __acomp: get('É acompanhado pelo'),
    __servicos: Array.isArray(servicos) ? servicos : [],
    __telefone: get('Telefone'),
    __envio: fmtDate(envio),
    __envioTs: envio ? new Date(envio).getTime() || 0 : 0
  };
}

function filteredRows() {
  const q = normKey(app.search);
  let rows = app.records.map(enrich);
  if (q) {
    rows = rows.filter((r) =>
      [r.__nome, r.__cidade, r.__telefone, r.__genero, r.__renda, r.__acomp, r.__zona, ...r.__servicos]
        .some((v) => normKey(v).includes(q))
    );
  }
  const { key, dir } = app.sort;
  const col = TABLE_COLS.find((c) => c.key === key) || TABLE_COLS[0];
  rows.sort((a, b) => {
    const av = col.get(a), bv = col.get(b);
    let r;
    if (typeof av === 'number' && typeof bv === 'number') r = av - bv;
    else r = normKey(av).localeCompare(normKey(bv));
    return dir === 'asc' ? r : -r;
  });
  return rows;
}

function renderTable() {
  const has = app.records.length > 0;
  $('emptyState').hidden = has;
  $('tableCard').hidden = !has;
  if (!has) return;

  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  app.page = Math.min(Math.max(1, app.page), pages);
  const slice = rows.slice((app.page - 1) * PAGE_SIZE, app.page * PAGE_SIZE);

  const thead = $('dataTable').querySelector('thead');
  const tbody = $('dataTable').querySelector('tbody');

  thead.innerHTML = `<tr>${TABLE_COLS.map((c) =>
    `<th data-key="${c.key}" class="${app.sort.key === c.key ? 'sorted' : ''}">${c.label}${app.sort.key === c.key ? (app.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`
  ).join('')}</tr>`;

  tbody.innerHTML = slice.map((r) => {
    const fresh = app.freshIds.has(r._id || r._uuid) ? ' class="fresh"' : '';
    return `<tr${fresh}>${TABLE_COLS.map((c) => `<td>${c.html(r)}</td>`).join('')}</tr>`;
  }).join('');

  thead.querySelectorAll('th').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (app.sort.key === key) app.sort.dir = app.sort.dir === 'asc' ? 'desc' : 'asc';
      else app.sort = { key, dir: 'asc' };
      renderTable();
    });
  });

  $('tableCount').textContent = `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}${rows.length !== app.records.length ? ` (filtrados de ${app.records.length})` : ''}`;
  $('pageInfo').textContent = `Página ${app.page} de ${pages}`;
  $('prevPage').disabled = app.page <= 1;
  $('nextPage').disabled = app.page >= pages;
}

function renderAll() {
  renderKpis();
  renderCharts();
  renderTable();
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 5200);
}

function setLive(status, text) {
  const badge = $('liveBadge');
  badge.classList.remove('online', 'offline');
  if (status) badge.classList.add(status);
  $('liveText').textContent = text;
}

function showError(msg) {
  const b = $('errorBanner');
  if (!msg) { b.hidden = true; return; }
  $('errorText').textContent = msg;
  b.hidden = false;
}

async function loadData({ toast = false } = {}) {
  const btn = $('btnRefresh');
  btn.disabled = true;
  try {
    const res = await fetch(API_DATA, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    applyData(json.results || [], json.count, json.lastUpdated);
    if (toast) showToast('Dados atualizados manualmente');
    showError(null);
  } catch (err) {
    showError(`Falha ao carregar dados: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

function applyData(results, count, lastUpdated) {
  const prev = app.lastCount;
  if (results.length > prev && prev > 0) {
    app.freshIds = new Set(results.slice(0, results.length - prev).map((r) => r._id || r._uuid));
    showToast(`${results.length - prev} novo(s) cadastro(s) recebido(s)`);
  }
  app.records = results;
  app.lastCount = count ?? results.length;
  $('lastUpdated').dataset.iso = lastUpdated || '';
  $('lastUpdated').textContent = fmtTime(lastUpdated);
  renderAll();
}

async function loadSchema() {
  try {
    const res = await fetch(API_SCHEMA, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    app.schema = json.schema;
    app.fields = json.schema?.fields || [];
    if (app.schema?.title) {
      $('projectTitle').textContent = app.schema.title;
      document.title = `${app.schema.title} — Dashboard`;
    }
    if (app.schema?.description) {
      $('projectSubtitle').textContent = `${app.schema.description} · Juntos Pelo Acre`;
    }
    if (app.schema?.formUrl) {
      $('formLinks').innerHTML = `<a class="btn btn-primary" href="${app.schema.formUrl}" target="_blank" rel="noopener">Abrir formulário ↗</a>`;
      $('footerForm').href = app.schema.formUrl;
      $('footerForm').hidden = false;
    }
    $('footerInfo').textContent = `Dados via KoboToolbox API · ${app.fields.length} campos monitorados`;
  } catch (err) {
    showError(`Falha ao carregar o schema do formulário: ${err.message}`);
  }
}

function connectStream() {
  let retry = 1000;
  const es = new EventSource(API_STREAM);

  es.addEventListener('hello', () => {
    retry = 1000;
    setLive('online', 'Tempo real');
    showError(null);
  });

  es.addEventListener('data', (ev) => {
    setLive('online', 'Tempo real');
    try {
      const payload = JSON.parse(ev.data);
      applyData(payload.results || [], payload.count, payload.lastUpdated);
    } catch { /* payload inválido: ignora */ }
  });

  es.addEventListener('error', () => {
    es.close();
    setLive('offline', 'Reconectando…');
    setTimeout(connectStream, retry);
    retry = Math.min(retry * 2, 30000);
  });
}

function bind() {
  $('btnRefresh').addEventListener('click', () => loadData({ toast: true }));
  $('errorClose').addEventListener('click', () => showError(null));

  $('searchInput').addEventListener('input', (e) => {
    app.search = e.target.value;
    app.page = 1;
    renderTable();
  });

  $('revealSensitive').addEventListener('change', (e) => {
    app.reveal = e.target.checked;
    renderTable();
  });

  $('prevPage').addEventListener('click', () => { app.page--; renderTable(); });
  $('nextPage').addEventListener('click', () => { app.page++; renderTable(); });

  setInterval(() => {
    $('lastUpdated').textContent = fmtTime($('lastUpdated').dataset.iso || null);
  }, 20000);
}

async function init() {
  bind();
  await loadSchema();
  await loadData();
  connectStream();
}

init();
