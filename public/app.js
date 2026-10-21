const API_AGGREGATE = '/api/aggregate';
const API_SUBMISSIONS = '/api/submissions';
const API_SCHEMA = '/api/schema';
const API_STREAM = '/api/stream';
const PAGE_SIZE = 15;

const PALETTE = [
  '#5a34a0', '#b02a5b', '#1f6f57', '#8a5a1d',
  '#0f6fb0', '#c2410c', '#0891b2', '#7c3aed'
];
const SCALE = ['#ede7f6', '#c3b0e2', '#8560c0', '#4b2a8a'];
const SCALE_DARK = ['#3a2d5c', '#4a3d70', '#8560c0', '#c3b0e2'];

const $ = (id) => document.getElementById(id);

const app = {
  schema: null,
  fields: [],
  choices: {},
  records: [],
  charts: new Map(),
  map: null,
  mapLayers: new Map(),
  page: 1,
  sort: { key: 'submitted_at', dir: 'desc' },
  search: '',
  reveal: false,
  cidadeFiltro: null,
  periodoFiltro: 'todos',
  lastVersion: -1
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
  if (from === to) { el.textContent = decimals ? to.toFixed(decimals) : String(to).toLocaleString('pt-BR'); el.dataset.v = to; return; }
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
  if (!listName || !app.choices?.[listName]) return String(value).trim();
  const items = app.choices[listName];
  const wanted = normKey(value);
  const hit = items.find((c) => normKey(c.name) === wanted || normKey(c.value) === wanted || normKey(c.label) === wanted);
  return hit ? hit.label : String(value).trim();
}

function getValue(rec, field) {
  const v = rec[field.xpath] ?? rec[field.name] ?? rec[normKey(field.xpath)] ?? rec[normKey(field.name)];
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

const mget = (m, k) => (m instanceof Map ? m.get(k) : (m && m[k])) || 0;

function sortedEntries(map) {
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map || {});
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
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

const commonOpts = () => {
  const border = cssVar('--border');
  const textSoft = cssVar('--text-soft');
  const grid = cssVar('--chart-grid');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 650, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        labels: {
          usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 12, boxHeight: 12,
          borderWidth: 1, borderColor: 'rgba(29,38,48,.15)', useBorderRadius: true,
          padding: 14, font: { size: 11.5, family: 'Inter', weight: '500' }, color: textSoft
        },
        tooltip: {
          backgroundColor: '#fff', borderColor: border, borderWidth: 1, cornerRadius: 8,
          titleFont: { family: 'Inter', size: 12, weight: '600' },
          bodyFont: { family: 'Inter', size: 12 },
          titleColor: cssVar('--text'), bodyColor: textSoft,
          padding: 10, boxPadding: 4, displayColors: true
        }
      }
    }
  };
};

const barOpts = (horizontal = false) => ({
  ...commonOpts(),
  indexAxis: horizontal ? 'y' : 'x',
  plugins: { ...commonOpts().plugins, legend: { display: false } },
  scales: {
    x: {
      grid: { display: horizontal, color: cssVar('--chart-grid') },
      ticks: { color: cssVar('--text-soft'), font: { size: 11, family: 'Inter' }, maxRotation: horizontal ? 0 : 45, autoSkip: true },
      border: { display: false }
    },
    y: {
      grid: { display: !horizontal, color: cssVar('--chart-grid') },
      ticks: { color: cssVar('--text-soft'), font: { size: 11, family: 'Inter' }, precision: 0, autoSkip: horizontal },
      border: { display: false }, beginAtZero: true
    }
  }
});

function barChart(id, map, { horizontal = false, max = 12, ordered = false } = {}) {
  let entries = ordered ? [...map] : sortedEntries(map);
  if (!ordered) entries = entries.slice(0, max);
  const data = entries;
  mountChart(id, {
    type: 'bar',
    data: {
      labels: data.map((d) => d[0] || '—'),
      datasets: [{
        data: data.map((d) => d[1]),
        backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length] + 'd9'),
        borderColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1.2, borderRadius: 6, maxBarThickness: horizontal ? 22 : 44
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
        backgroundColor: (empty ? ['#e7e3f0'] : entries.map((_, i) => PALETTE[i % PALETTE.length])),
        borderColor: '#fff', borderWidth: 2, hoverOffset: 8
      }]
    },
    options: {
      ...commonOpts(),
      cutout: '62%',
      plugins: {
        ...commonOpts().plugins,
        legend: {
          position: 'right',
          labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 12, boxHeight: 12, padding: 11, font: { size: 11.5, family: 'Inter' }, color: cssVar('--text-soft') }
        }
      }
    }
  });
}

function ageBucketsMap(map) {
  const ordenada = ['0–17', '18–24', '25–34', '35–44', '45–54', '55+'];
  return ordenada.map((k) => [k, map.get(k) || 0]);
}

function crossTabToSeries(ct, keyA) {
  const out = {};
  for (const [a, obj] of Object.entries(ct || {})) {
    out[a] = obj;
  }
  return out;
}

// ---------- KPIs ----------
function renderKpis(agg) {
  setKpi('kpiTotal', agg.total);
  $('kpiTotalSub').textContent = agg.total === 0 ? 'aguardando respostas' : `${agg.total} resposta${agg.total === 1 ? '' : 's'} recebida${agg.total === 1 ? '' : 's'}`;
  setKpi('kpiNovos7d', agg.n);
  $('kpiNovos7dSub').textContent = 'novos no período selecionado';
  setKpi('kpiMunicipios', agg.volumetria.cidadesAlcancadas);
  $('kpiMunicipiosSub').textContent = 'de 22 municípios do Acre';
  const rendaBaixa = mget(agg.socioeconomico.renda, 'Inferior meio salário mínimo');
  const meio = mget(agg.socioeconomico.renda, 'De meio a 1 salário mínimo');
  setKpi('kpiRendaBaixa', agg.n ? Math.round(((rendaBaixa + meio) / agg.n) * 100) : 0);
  $('kpiRendaBaixaSub').textContent = '% dos cadastros com renda baixa';
  setKpi('kpiServicos', agg.servicos.distinct);
  $('kpiServicosSub').textContent = 'serviços distintos acessados';
  setKpi('kpiCompletude', agg.qualidade.mediaCompletude, 1);
  $('kpiCompletudeSub').textContent = '% dos campos preenchidos por cadastro';
  setKpi('kpiDup', agg.qualidade.duplicidadesCPF.length + agg.qualidade.duplicidadesRG.length);
  $('kpiDupSub').textContent = 'CPF ou RG repetidos';
}

// ---------- Charts ----------
function renderCharts(agg) {
  const d = agg.demografia;
  doughnutChart('chartGenero', d.genero);
  doughnutChart('chartZona', d.zona);
  barChart('chartRaca', d.raca);
  barChart('chartOrientacao', d.orientacao, { horizontal: true });
  barChart('chartIdade', ageBucketsMap(d.idade.buckets.reduce((m, [k, v]) => { m.set(k, v); return m; }, new Map())));
  barChart('chartUfNascimento', d.ufNascimento, { horizontal: true, max: 14 });
  barChart('chartCidadeNascimento', d.cidadeNascimento, { horizontal: true, max: 10 });
  doughnutChart('chartNacionalidade', d.nacionalidade);

  const s = agg.socioeconomico;
  barChart('chartVinculo', s.vinculo);
  doughnutChart('chartFilhosSimNao', s.filhosSimNao);
  barChart('chartFilhosDist', Object.entries(s.filhosDist || {}));
  const rendaXzona = s.rendaXzona || {};
  const rendaSeries = Object.keys(rendaXzona).map((a) => [a, Object.values(rendaXzona[a] || {}).reduce((x, y) => x + y, 0)]);
  barChart('chartRendaXzona', rendaSeries, { horizontal: true });

  const b = agg.beneficios;
  doughnutChart('chartBeneficio', b.recebe);
  barChart('chartTipoBeneficio', b.tipo, { horizontal: true });
  doughnutChart('chartDeficiencia', b.deficiencia);
  barChart('chartTipoDeficiencia', b.tipoDeficiencia, { horizontal: true });
  doughnutChart('chartMigrante', b.migrante);

  const e = agg.educacao;
  barChart('chartNivel', e.nivel);
  barChart('chartCursoSuperior', e.cursoSuperior, { horizontal: true });
  doughnutChart('chartTurno', e.turno);
  doughnutChart('chartSemestre', e.semestre);
  barChart('chartIngresso', e.ingresso);

  const sv = agg.servicos;
  barChart('chartServicos', sv.ranking, { horizontal: true, max: 15 });
  barChart('chartHistServicos', sv.histograma || []);

  const q = agg.qualidade;
  barChart('chartRespostaCampo', q.respostaPorCampo.map((r) => [r.campo, r.n]), { horizontal: true, max: 10 });
  doughnutChart('chartCompletude', q.completudeDist || {});
}

// ---------- Evolução ----------
function renderEvolucao(agg) {
  const serie = agg.serieTemporal || [];
  const dias = serie.map((s) => s.dia);
  const novos = serie.map((s) => s.novos);
  const acum = serie.map((s) => s.acumulado);
  mountChart('chartEvolucao', {
    type: 'bar',
    data: {
      labels: dias,
      datasets: [
        { label: 'Novos no dia', data: novos, backgroundColor: PALETTE[0] + 'd9', borderColor: PALETTE[0], borderWidth: 1, borderRadius: 4 },
        { label: 'Acumulado', data: acum, type: 'line', borderColor: PALETTE[4], backgroundColor: PALETTE[4] + '1a', borderWidth: 2, fill: false, tension: 0.3, pointRadius: 3 }
      ]
    },
    options: {
      ...commonOpts(),
      scales: {
        x: { grid: { display: false, color: cssVar('--chart-grid') }, ticks: { color: cssVar('--text-soft'), font: { size: 10, family: 'Inter' }, maxRotation: 45, autoSkip: true }, border: { display: false } },
        y: { grid: { color: cssVar('--chart-grid') }, ticks: { color: cssVar('--text-soft'), font: { size: 11, family: 'Inter' }, precision: 0, beginAtZero: true }, border: { display: false } }
      },
      plugins: { ...commonOpts().plugins, legend: { position: 'top', labels: { padding: 20, font: { size: 11.5, family: 'Inter' }, color: cssVar('--text-soft') } } }
    }
  });
}

// ---------- Mapa ----------
function initMap() {
  if (!window.L) return;
  const container = $('mapa');
  if (!container) return;
  if (app.map) { app.map.remove(); app.mapLayers.clear(); }
  const map = L.map(container, { attributionControl: false, zoomControl: true, minZoom: 6, maxZoom: 13, zoomDelta: 0.5, wheelPxPerZoomLevel: 120 });
  app.map = map;
  const dark = document.documentElement.dataset.theme === 'dark';
  const escala = dark ? SCALE_DARK : SCALE;
  fetch('/geo/acre-municipios.geojson')
    .then((r) => r.json())
    .then((geo) => {
      const counts = new Map();
      if (window.aggCobertura) {
        for (const c of window.aggCobertura) counts.set(c.nome, c.n);
      }
      const maxCount = Math.max(...Array.from(counts.values()), 1);
      const breaks = [maxCount * 0.25, maxCount * 0.5, maxCount * 0.75];
      function fillFor(n) {
        if (!n) return dark ? '#2a263c' : '#f2f2f4';
        if (n <= breaks[0]) return escala[0];
        if (n <= breaks[1]) return escala[1];
        if (n <= breaks[2]) return escala[2];
        return escala[3];
      }
      const layer = L.geoJSON(geo, {
        style: (feat) => {
          const nome = feat.properties.nome;
          const n = counts.get(nome) || 0;
          const selecionado = app.cidadeFiltro === nome;
          return {
            fillColor: fillFor(n),
            color: selecionado ? (dark ? '#f4a06a' : '#f0873f') : cssVar('--border'),
            weight: selecionado ? 3 : 1,
            fillOpacity: 0.85,
            dashArray: n ? '' : '2 2'
          };
        },
        onEachFeature: (feat, layer) => {
          const nome = feat.properties.nome;
          const n = counts.get(nome) || 0;
          const pct = aggN ? Math.round((n / aggN) * 100) : 0;
          layer.bindTooltip(`<b>${nome}</b><br>${n} cadastro${n === 1 ? '' : 's'} (${pct}%)`, { sticky: true, className: 'mapa-tooltip' });
          layer.on('click', () => setCidadeFiltro(nome));
          app.mapLayers.set(nome, layer);
        }
      }).addTo(map);
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
      map.on('click', () => setCidadeFiltro(null));
      renderMapaTabela(agg.cobertura || []);
    });
}

let aggN = 0;
function renderMapaTabela(cobertura) {
  const tbody = $('tbodyMunicipio');
  if (!tbody) return;
  tbody.innerHTML = cobertura.map((c) => {
    const sel = app.cidadeFiltro === c.nome;
    return `<tr${sel ? ' style="background:var(--brand-soft);font-weight:600"' : ''}>
      <td>${esc(c.nome)}</td>
      <td data-key="n">${c.n}</td>
      <td data-key="pct">${c.pct}</td>
      <td data-key="mediaIdade">${c.mediaIdade}</td>
      <td data-key="comServicoPct">${c.comServicoPct}</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      const nome = tr.children[0].textContent.trim();
      setCidadeFiltro(nome === app.cidadeFiltro ? null : nome);
    });
  });
}

function highlightMapa(nome) {
  if (!app.mapLayers) return;
  app.mapLayers.forEach((layer, key) => {
    const selecionado = key === nome;
    layer.setStyle({
      color: selecionado ? (document.documentElement.dataset.theme === 'dark' ? '#f4a06a' : '#f0873f') : cssVar('--border'),
      weight: selecionado ? 3 : 1
    });
    if (selecionado && app.map) app.map.flyToBounds(layer.getBounds(), { padding: [40, 40] });
  });
}

// ---------- Tabela de registros (paginada no servidor) ----------
const TABLE_COLS = [
  { key: 'nome', label: 'Nome', get: (r) => r.Nome_do_usu_rio, html: (r) => esc(r.Nome_do_usu_rio) || '<span class="masked">sem nome</span>' },
  { key: 'idade', label: 'Idade', get: (r) => r.Idade, html: (r) => esc(r.Idade) },
  { key: 'cidade', label: 'Cidade', get: (r) => r.Cidade_da_resid_ncia_atual, html: (r) => esc(r.Cidade_da_resid_ncia_atual) },
  { key: 'zona', label: 'Zona', get: (r) => r.Zona, html: (r) => r.Zona ? `<span class="pill">${esc(r.Zona)}</span>` : '' },
  { key: 'genero', label: 'Gênero', get: (r) => r.Identidade_de_G_nero, html: (r) => esc(r.Identidade_de_G_nero) },
  { key: 'trabalha', label: 'Trabalha', get: (r) => r.Trabalha, html: (r) => esc(r.Trabalha) },
  { key: 'renda', label: 'Renda per capita', get: (r) => r.Renda_Familiar_per_capita, html: (r) => esc(r.Renda_Familiar_per_capita) },
  { key: 'servicos', label: 'Serviços', get: (r) => r.__service_count, html: (r) => r.__service_count ? `<span class="pill">${r.__service_count}</span>` : '' },
  { key: 'rg', label: 'RG', get: (r) => r.RG, html: (r) => (r.RG ? (app.reveal ? esc(r.RG) : '<span class="masked">•••••</span>') : '') },
  { key: 'cpf', label: 'CPF', get: (r) => r.CPF, html: (r) => (r.CPF ? (app.reveal ? esc(r.CPF) : '<span class="masked">••••••••</span>') : '') },
  { key: 'envio', label: 'Envio', get: (r) => r.__envio, html: (r) => esc(r.__envio) }
];

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTableState({ rows, total, page, pages, size }) {
  const has = total > 0;
  $('emptyState').hidden = has;
  $('tableCard').hidden = !has;
  if (!has) return;

  const thead = $('dataTable').querySelector('thead');
  const tbody = $('dataTable').querySelector('tbody');
  thead.innerHTML = `<tr>${TABLE_COLS.map((c) =>
    `<th data-key="${c.key}" class="${app.sort.key === c.key ? 'sorted' : ''}">${c.label}${app.sort.key === c.key ? (app.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`
  ).join('')}</tr>`;

  tbody.innerHTML = rows.map((r) =>
    `<tr>${TABLE_COLS.map((c) => `<td>${c.html(r)}</td>`).join('')}</tr>`
  ).join('');

  thead.querySelectorAll('th').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (app.sort.key === key) app.sort.dir = app.sort.dir === 'asc' ? 'desc' : 'asc';
      else app.sort = { key, dir: 'asc' };
      loadSubmissions();
    });
  });

  $('tableCount').textContent = `${total} ${total === 1 ? 'registro' : 'registros'}`;
  $('pageInfo').textContent = `Página ${page} de ${pages}`;
  $('prevPage').disabled = page <= 1;
  $('nextPage').disabled = page >= pages;
}

async function loadSubmissions() {
  const url = new URL(API_SUBMISSIONS, window.location.origin);
  url.searchParams.set('page', app.page);
  url.searchParams.set('size', PAGE_SIZE);
  if (app.cidadeFiltro) url.searchParams.set('city', app.cidadeFiltro);
  if (app.search) url.searchParams.set('q', app.search);
  if (app.periodoFiltro !== 'todos') url.searchParams.set('days', app.periodoFiltro);
  url.searchParams.set('sort', app.sort.key);
  url.searchParams.set('dir', app.sort.dir);
  try {
    const json = await fetch(url, { cache: 'no-store' }).then((r) => r.json());
    renderTableState({ rows: json.rows || [], total: json.total || 0, page: json.page || 1, pages: json.pages || 1, size: PAGE_SIZE });
  } catch (err) {
    showError(`Falha ao carregar registros: ${err.message}`);
  }
}

// ---------- Agregado principal ----------
async function loadAggregate() {
  const url = new URL(API_AGGREGATE, window.location.origin);
  if (app.cidadeFiltro) url.searchParams.set('city', app.cidadeFiltro);
  if (app.periodoFiltro !== 'todos') url.searchParams.set('days', app.periodoFiltro);
  try {
    const json = await fetch(url, { cache: 'no-store' }).then((r) => r.json());
    window.aggCobertura = json.cobertura || [];
    aggN = json.n || 0;
    renderKpis(json);
    renderCharts(json);
    renderEvolucao(json);
    renderMapaTabela(json.cobertura || []);
    if (app.map) {
      const evt = new CustomEvent('mapa:dados', { detail: { cobertura: json.cobertura || [], n: json.n || 0, cidade: app.cidadeFiltro } });
      window.dispatchEvent(evt);
    }
    updateChips();
    showError(null);
  } catch (err) {
    showError(`Falha ao carregar agregados: ${err.message}`);
  }
}

async function initMapa() {
  await loadAggregate();
  initMap();
  window.addEventListener('mapa:dados', (ev) => {
    if (!app.map) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    const escala = dark ? SCALE_DARK : SCALE;
    const counts = new Map();
    const maxCount = Math.max(...ev.detail.cobertura.map((c) => c.n), 1);
    const breaks = [maxCount * 0.25, maxCount * 0.5, maxCount * 0.75];
    for (const c of ev.detail.cobertura) counts.set(c.nome, c.n);
    app.mapLayers.forEach((layer, nome) => {
      const n = counts.get(nome) || 0;
      const selecionado = nome === ev.detail.cidade;
      let fill;
      if (!n) fill = dark ? '#2a263c' : '#f2f2f4';
      else if (n <= breaks[0]) fill = escala[0];
      else if (n <= breaks[1]) fill = escala[1];
      else if (n <= breaks[2]) fill = escala[2];
      else fill = escala[3];
      layer.setStyle({ fillColor: fill, color: selecionado ? (dark ? '#f4a06a' : '#f0873f') : cssVar('--border'), weight: selecionado ? 3 : 1, dashArray: n ? '' : '2 2' });
    });
    renderMapaTabela(ev.detail.cobertura);
  });
}

function setCidadeFiltro(nome) {
  app.cidadeFiltro = nome;
  const sel = $('filtroMunicipio');
  if (sel) sel.value = nome || '';
  updateChips();
  loadAggregate();
  loadSubmissions();
}

function updateChips() {
  const chips = $('chips');
  const btnClear = $('btnLimparChips');
  const tem = app.cidadeFiltro || (app.periodoFiltro !== 'todos');
  chips.innerHTML = '';
  btnClear.hidden = !tem;
  if (app.cidadeFiltro) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>Município: ${esc(app.cidadeFiltro)}</span><button class="chip-remover" data-tipo="cidade">×</button>`;
    chip.querySelector('button').addEventListener('click', () => setCidadeFiltro(null));
    chips.appendChild(chip);
  }
  if (app.periodoFiltro !== 'todos') {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>Período: últimos ${app.periodoFiltro} dias</span><button class="chip-remover" data-tipo="periodo">×</button>`;
    chip.querySelector('button').addEventListener('click', () => { app.periodoFiltro = 'todos'; $('filtroPeriodo').value = 'todos'; updateChips(); loadAggregate(); loadSubmissions(); });
    chips.appendChild(chip);
  }
}

// ---------- Tema ----------
function initTema() {
  const btn = $('themeToggle');
  const icon = $('themeIcon');
  const text = $('themeText');
  const saved = localStorage.getItem('dashboard:theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  text.textContent = theme === 'dark' ? 'Claro' : 'Escuro';
  btn.addEventListener('click', () => {
    const atual = document.documentElement.dataset.theme;
    const novo = atual === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    localStorage.setItem('dashboard:theme', novo);
    icon.textContent = novo === 'dark' ? '☀️' : '🌙';
    text.textContent = novo === 'dark' ? 'Claro' : 'Escuro';
    app.charts.forEach((c) => c.destroy());
    app.charts.clear();
    loadAggregate();
  });
}

// ---------- SSE ----------
function connectStream() {
  let retry = 1000;
  const es = new EventSource(API_STREAM);
  es.addEventListener('hello', () => {
    retry = 1000;
    setLive('online', 'Tempo real');
    showError(null);
  });
  es.addEventListener('stats', (ev) => {
    setLive('online', 'Tempo real');
    try {
      const p = JSON.parse(ev.data);
      if (p.version != null && p.version !== app.lastVersion) {
        app.lastVersion = p.version;
        loadAggregate();
        loadSubmissions();
      }
    } catch { /* ignora */ }
  });
  es.addEventListener('error', () => {
    es.close();
    setLive('offline', 'Reconectando…');
    setTimeout(connectStream, retry);
    retry = Math.min(retry * 2, 30000);
  });
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

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 5200);
}

function bind() {
  $('btnRefresh').addEventListener('click', () => { loadAggregate(); loadSubmissions(); showToast('Dados atualizados'); });
  $('errorClose').addEventListener('click', () => showError(null));

  $('filtroPeriodo').addEventListener('change', (e) => {
    app.periodoFiltro = e.target.value;
    app.page = 1;
    updateChips();
    loadAggregate();
    loadSubmissions();
  });

  $('filtroMunicipio').addEventListener('change', (e) => {
    setCidadeFiltro(e.target.value || null);
  });

  $('btnLimparFiltros').addEventListener('click', () => {
    app.cidadeFiltro = null;
    app.periodoFiltro = 'todos';
    $('filtroMunicipio').value = '';
    $('filtroPeriodo').value = 'todos';
    updateChips();
    loadAggregate();
    loadSubmissions();
  });

  $('searchInput').addEventListener('input', (e) => {
    app.search = e.target.value;
    app.page = 1;
    loadSubmissions();
  });

  $('revealSensitive').addEventListener('change', (e) => {
    app.reveal = e.target.checked;
    loadSubmissions();
  });

  $('prevPage').addEventListener('click', () => { app.page--; loadSubmissions(); });
  $('nextPage').addEventListener('click', () => { app.page++; loadSubmissions(); });

  setInterval(() => {
    $('lastUpdated').textContent = fmtTime($('lastUpdated').dataset.iso || null);
  }, 20000);
}

async function loadSchema() {
  try {
    const res = await fetch(API_SCHEMA, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    app.schema = json.schema;
    app.fields = json.schema?.fields || [];
    app.choices = json.schema?.choices || {};
    if (app.schema?.title) {
      $('projectTitle').textContent = app.schema.title;
      document.title = `${app.schema.title} — Dashboard`;
    }
    if (app.schema?.description) {
      $('projectSubtitle').textContent = `${app.schema.description} · Juntos Pelo Acre`;
    }
    if (app.schema?.formUrl) {
      $('footerForm').href = app.schema.formUrl;
      $('footerForm').hidden = false;
    }
    // preencher select de municípios
    const sel = $('filtroMunicipio');
    const fCidade = field('Cidade da residência atual');
    const cidades = new Set();
    for (const rec of app.records) {
      const v = getValue(rec, fCidade);
      if (v) cidades.add(v);
    }
    sel.innerHTML = '<option value="">Todos os municípios</option>' + [...cidades].sort().map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('footerInfo').textContent = `Dados via KoboToolbox API · ${app.fields.length} campos monitorados`;
  } catch (err) {
    showError(`Falha ao carregar o schema do formulário: ${err.message}`);
  }
}

async function init() {
  bind();
  initTema();
  await loadSchema();
  await initMapa();
  await loadSubmissions();
  connectStream();
}

init();
