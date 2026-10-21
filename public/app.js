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

async function fetchJson(input, options) {
  const response = await fetch(input, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida do servidor (HTTP ${response.status})`);
  }
}

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
  if (c) {
    try { c.destroy(); } catch (_) { /* já removido */ }
    app.charts.delete(id);
  }
}

function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}

function chartBase() {
  const soft = cssVar('--text-soft');
  const grid = cssVar('--chart-grid');
  const dark = isDark();
  return {
    theme: { mode: dark ? 'dark' : 'light' },
    chart: {
      foreColor: soft,
      fontFamily: 'Inter, system-ui, sans-serif',
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: true, speed: 650 },
      parentHeightOffset: 0
    },
    grid: {
      borderColor: grid,
      strokeDashArray: 3,
      padding: { left: 6, right: 10, top: 0, bottom: 0 }
    },
    dataLabels: { enabled: false },
    legend: {
      show: false,
      fontSize: '11.5px',
      fontFamily: 'Inter',
      labels: { colors: soft },
      markers: { size: 6, shape: 'square', radius: 2, offsetX: -2 },
      itemMargin: { horizontal: 8, vertical: 4 }
    },
    tooltip: {
      theme: dark ? 'dark' : 'light',
      style: { fontFamily: 'Inter', fontSize: '12px' }
    },
    states: {
      hover: { filter: { type: 'lighten', value: 0.06 } },
      active: { filter: { type: 'none' } }
    },
    noData: {
      text: 'Sem dados',
      align: 'center',
      verticalAlign: 'middle',
      style: { color: soft, fontSize: '12px' }
    }
  };
}

function mountChart(id, options) {
  if (!window.ApexCharts) return;
  const host = $(id);
  if (!host) return;
  destroyChart(id);
  host.innerHTML = '';
  const height = host.clientHeight || host.parentElement?.clientHeight || 260;
  const chart = new ApexCharts(host, {
    ...options,
    chart: {
      height,
      width: '100%',
      type: options.chart?.type || 'bar',
      ...options.chart
    }
  });
  chart.render();
  app.charts.set(id, chart);
}

function barChart(id, map, { horizontal = false, max = 12, ordered = false, labelFormat = null } = {}) {
  const isArray = Array.isArray(map);
  let entries = isArray ? map.map((d) => (Array.isArray(d) ? [d[0], d[1]] : [d, 0])) : sortedEntries(map);
  if (entries.length > max) entries = entries.slice(0, max);
  const labels = entries.map((d) => (labelFormat ? labelFormat(d[0]) : (d[0] || '—')));
  const values = entries.map((d) => Number(d[1]) || 0);
  const colors = entries.map((_, i) => PALETTE[i % PALETTE.length]);
  const soft = cssVar('--text-soft');
  const axisLabel = { style: { colors: soft, fontSize: '11px', fontFamily: 'Inter' } };

  mountChart(id, {
    ...chartBase(),
    chart: { type: 'bar' },
    series: [{ name: 'Cadastros', data: values }],
    labels,
    colors,
    plotOptions: {
      bar: {
        horizontal,
        distributed: true,
        borderRadius: 5,
        borderRadiusApplication: 'end',
        columnWidth: horizontal ? '60%' : '58%',
        barHeight: horizontal ? '58%' : undefined
      }
    },
    xaxis: {
      categories: labels,
      labels: { ...axisLabel, rotate: horizontal ? 0 : -45, rotateAlways: false, hideOverlappingLabels: true, trim: true },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: { ...axisLabel, maxWidth: horizontal ? 240 : undefined },
      min: 0,
      forceNiceScale: true
    },
    grid: {
      ...chartBase().grid,
      xaxis: { lines: { show: horizontal } },
      yaxis: { lines: { show: !horizontal } }
    },
    legend: { show: false },
    tooltip: {
      ...chartBase().tooltip,
      y: { formatter: (v) => `${v} cadastro${v === 1 ? '' : 's'}` }
    }
  });
}

function doughnutChart(id, map) {
  const entries = sortedEntries(map);
  const empty = entries.length === 0;
  const labels = empty ? ['Sem dados'] : entries.map((d) => d[0] || '—');
  const series = empty ? [1] : entries.map((d) => Number(d[1]) || 0);
  const colors = empty ? ['#e7e3f0'] : entries.map((_, i) => PALETTE[i % PALETTE.length]);
  const soft = cssVar('--text-soft');

  mountChart(id, {
    ...chartBase(),
    chart: { type: 'donut' },
    series,
    labels,
    colors,
    stroke: { colors: [cssVar('--surface')], width: 2 },
    plotOptions: {
      pie: {
        expandOnClick: true,
        donut: { size: '62%', labels: { show: false } }
      }
    },
    legend: {
      ...chartBase().legend,
      show: true,
      position: 'right',
      horizontalAlign: 'center',
      labels: { colors: soft }
    },
    tooltip: {
      ...chartBase().tooltip,
      y: { formatter: (v) => `${v} cadastro${v === 1 ? '' : 's'}` }
    }
  });
}

function ageBucketsMap(map) {
  const ordenada = ['0–17', '18–24', '25–34', '35–44', '45–54', '55+'];
  return ordenada.map((k) => [k, map.get(k) || 0]);
}

function fmtMes(m) {
  const [ano, mes] = String(m).split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const i = Number(mes) - 1;
  return i >= 0 && i < 12 ? `${nomes[i]}/${String(ano).slice(2)}` : String(m);
}

function crossTabSeries(ct, maxSeries = 7) {
  const categories = Object.keys(ct || {});
  const totals = new Map();
  for (const obj of Object.values(ct || {})) {
    for (const [k, v] of Object.entries(obj || {})) {
      totals.set(k, (totals.get(k) || 0) + (Number(v) || 0));
    }
  }
  const chosen = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSeries)
    .map(([k]) => k);
  const series = chosen.map((k) => ({
    name: k,
    data: categories.map((c) => Number(ct[c]?.[k]) || 0)
  }));
  return { categories, series };
}

function stackedChart(id, ct, { horizontal = false, maxSeries = 7 } = {}) {
  const { categories, series } = crossTabSeries(ct, maxSeries);
  const soft = cssVar('--text-soft');
  const axis = { style: { colors: soft, fontSize: '10.5px', fontFamily: 'Inter' } };

  mountChart(id, {
    ...chartBase(),
    chart: { type: 'bar' },
    series,
    colors: PALETTE,
    plotOptions: {
      bar: {
        horizontal,
        stacked: true,
        borderRadius: 3,
        columnWidth: '55%',
        barHeight: horizontal ? '55%' : undefined
      }
    },
    xaxis: {
      categories,
      labels: { ...axis, rotate: horizontal ? 0 : -35, rotateAlways: false, hideOverlappingLabels: true, trim: true },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: { ...axis, maxWidth: horizontal ? 240 : undefined },
      min: 0,
      forceNiceScale: true
    },
    grid: {
      ...chartBase().grid,
      xaxis: { lines: { show: horizontal } },
      yaxis: { lines: { show: !horizontal } }
    },
    legend: {
      ...chartBase().legend,
      show: true,
      position: horizontal ? 'right' : 'top',
      horizontalAlign: horizontal ? 'center' : 'right'
    },
    tooltip: {
      ...chartBase().tooltip,
      shared: true,
      intersect: false,
      y: { formatter: (v) => `${v} cadastro${v === 1 ? '' : 's'}` }
    }
  });
}

function histogramChart(id, entries) {
  const labels = entries.map(([k]) => k);
  const values = entries.map(([, v]) => Number(v) || 0);
  const soft = cssVar('--text-soft');
  const axis = { style: { colors: soft, fontSize: '11px', fontFamily: 'Inter' } };

  mountChart(id, {
    ...chartBase(),
    chart: { type: 'bar' },
    series: [{ name: 'Cadastros', data: values }],
    colors: [PALETTE[0]],
    plotOptions: {
      bar: { columnWidth: '62%', borderRadius: 4, borderRadiusApplication: 'end' }
    },
    xaxis: {
      categories: labels,
      labels: { ...axis, rotate: 0 },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: { labels: { ...axis }, min: 0, forceNiceScale: true },
    grid: {
      ...chartBase().grid,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } }
    },
    legend: { show: false },
    tooltip: {
      ...chartBase().tooltip,
      y: { formatter: (v) => `${v} cadastro${v === 1 ? '' : 's'}` }
    }
  });
}

// ---------- KPIs ----------
function renderKpis(agg) {
  const ind = agg.indicadores || {};
  setKpi('kpiTotal', agg.total);
  $('kpiTotalSub').textContent = agg.total === 0 ? 'aguardando respostas' : `${agg.total} resposta${agg.total === 1 ? '' : 's'} recebida${agg.total === 1 ? '' : 's'}`;
  setKpi('kpiNovos7d', agg.n);
  $('kpiNovos7dSub').textContent = 'novos no período selecionado';
  setKpi('kpiMunicipios', agg.volumetria.cidadesAlcancadas);
  $('kpiMunicipiosSub').textContent = 'de 22 municípios do Acre';
  setKpi('kpiUrbana', ind.pctUrbana || 0, 1);
  $('kpiUrbanaSub').textContent = `${ind.pctRural || 0}% rural`;
  setKpi('kpiFilhos', ind.pctComFilhos || 0, 1);
  $('kpiFilhosSub').textContent = '% dos cadastros com filhos';
  setKpi('kpiDeficiencia', ind.pctComDeficiencia || 0, 1);
  $('kpiDeficienciaSub').textContent = '% com deficiência na família';
  setKpi('kpiMediaServicos', agg.servicos.media || 0, 2);
  $('kpiMediaServicosSub').textContent = 'média solicitada por cadastro';
  setKpi('kpiCompletude', agg.qualidade.mediaCompletude, 1);
  $('kpiCompletudeSub').textContent = '% dos campos preenchidos por cadastro';
  setKpi('kpiDup', agg.qualidade.duplicidadesCPF.length);
  $('kpiDupSub').textContent = 'CPF repetidos';
}

// ---------- Charts ----------
function renderCharts(agg) {
  const d = agg.demografia;
  const s = agg.socioeconomico;
  const b = agg.beneficios;
  const sv = agg.servicos;
  const v = agg.vulnerabilidade || {};
  const dm = agg.demanda || {};
  const q = agg.qualidade;

  // Painel 2 — perfil social e familiar
  histogramChart('chartIdade', ageBucketsMap(d.idade.buckets.reduce((m, [k, val]) => { m.set(k, val); return m; }, new Map())));
  doughnutChart('chartGenero', d.genero);
  barChart('chartOrientacao', d.orientacao, { horizontal: true, max: 8 });
  doughnutChart('chartRaca', d.raca);
  doughnutChart('chartZona', d.zona);
  barChart('chartCidade', d.cidade, { horizontal: true, max: 12 });
  doughnutChart('chartFilhosSimNao', s.filhosSimNao);
  histogramChart('chartFilhosDist', (s.filhosDist || []).map(([k, val]) => [`${k} filho(s)`, val]));
  doughnutChart('chartDeficiencia', b.deficiencia);
  barChart('chartTipoDeficiencia', b.tipoDeficiencia, { horizontal: true, max: 6 });

  // Painel 3 — vulnerabilidade
  barChart('chartRenda', s.renda);
  doughnutChart('chartTrabalha', s.trabalha);
  barChart('chartVinculo', s.vinculo, { horizontal: true, max: 8 });
  doughnutChart('chartAuxilio', b.recebe);
  barChart('chartTipoBeneficio', b.tipo, { horizontal: true, max: 10 });
  doughnutChart('chartAcompanhamento', v.acompanhamento);
  stackedChart('chartRendaXzona', s.rendaXzona, { maxSeries: 4 });
  stackedChart('chartTrabalhaXrenda', v.trabalhaXrenda, { maxSeries: 4 });
  stackedChart('chartRacaXrenda', v.racaXrenda, { maxSeries: 5 });

  // Painel 4 — demanda por serviços
  barChart('chartServicos', sv.ranking, { horizontal: true, max: 20, ordered: true });
  barChart('chartAreas', dm.areas || [], { horizontal: true, max: 8, ordered: true });
  barChart('chartDemandaCidade', dm.porCidade || [], { horizontal: true, max: 10, ordered: true });

  const porMes = dm.porMes || {};
  const meses = Object.keys(porMes).sort();
  const porMesOrd = {};
  for (const m of meses) porMesOrd[fmtMes(m)] = porMes[m];
  stackedChart('chartServicosMes', porMesOrd, { maxSeries: 6 });

  stackedChart('chartRendaXservicos', v.rendaXservicos, { horizontal: true, maxSeries: 6 });
  stackedChart('chartZonaXservicos', v.zonaXservicos, { maxSeries: 6 });
  const idadeOrdem = ['0–17', '18–24', '25–34', '35–44', '45–54', '55+'];
  const idadeOrd = {};
  for (const k of idadeOrdem) if (dm.idadeXsaude?.[k]) idadeOrd[k] = dm.idadeXsaude[k];
  stackedChart('chartIdadeXsaude', idadeOrd, { maxSeries: 6 });
  stackedChart('chartCrasXservicos', v.acompanhamentoXservicos, { horizontal: true, maxSeries: 6 });
  stackedChart('chartRacaXservicos', v.racaXservicos, { maxSeries: 6 });
  histogramChart('chartHistServicos', sv.histograma || []);

  // Qualidade
  barChart('chartRespostaCampo', q.respostaPorCampo.map((r) => [r.campo, r.n]), { horizontal: true, max: 10 });
  doughnutChart('chartCompletude', q.completudeDist || {});
}

// ---------- Evolução ----------
function renderEvolucao(agg) {
  const serie = agg.serieTemporal || [];
  const dias = serie.map((s) => s.dia);
  const novos = serie.map((s) => s.novos);
  const acum = serie.map((s) => s.acumulado);
  const soft = cssVar('--text-soft');
  const axis = { style: { colors: soft, fontSize: '10.5px', fontFamily: 'Inter' } };

  mountChart('chartEvolucao', {
    ...chartBase(),
    chart: { type: 'line' },
    series: [
      { name: 'Novos no dia', type: 'column', data: novos },
      { name: 'Acumulado', type: 'line', data: acum }
    ],
    colors: [PALETTE[0], PALETTE[4]],
    stroke: { width: [0, 2], curve: 'smooth' },
    fill: { type: 'solid', opacity: [0.85, 1] },
    markers: { size: 3, strokeWidth: 0 },
    plotOptions: {
      bar: { columnWidth: '55%', borderRadius: 4, borderRadiusApplication: 'end' }
    },
    xaxis: {
      categories: dias,
      labels: { ...axis, rotate: -45, rotateAlways: false, hideOverlappingLabels: true, trim: true },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: { labels: { ...axis }, min: 0, forceNiceScale: true },
    grid: {
      ...chartBase().grid,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } }
    },
    legend: {
      ...chartBase().legend,
      show: true,
      position: 'top',
      horizontalAlign: 'right'
    },
    tooltip: {
      ...chartBase().tooltip,
      shared: true,
      intersect: false
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
          layer.options.bubblingMouseEvents = false;
          layer.bindTooltip(`<b>${nome}</b><br>${n} cadastro${n === 1 ? '' : 's'} (${pct}%)`, { sticky: true, className: 'mapa-tooltip' });
          layer.on('click', () => setCidadeFiltro(nome === app.cidadeFiltro ? null : nome));
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
function fieldByList(list) {
  return app.fields.find((f) => f.list === list) || null;
}

function cellChoice(r, list) {
  const f = fieldByList(list);
  if (!f) return '';
  const v = getValue(r, f);
  return Array.isArray(v) ? v.join(', ') : v;
}

function serviceCount(r) {
  const f = fieldByList('zx7ud82');
  if (!f) return 0;
  const v = getValue(r, f);
  return Array.isArray(v) ? v.length : (v ? 1 : 0);
}

const TABLE_COLS = [
  { key: 'nome', label: 'Nome', get: (r) => r.Nome_do_usu_rio, html: (r) => esc(r.Nome_do_usu_rio) || '<span class="masked">sem nome</span>' },
  { key: 'idade', label: 'Idade', get: (r) => r.Idade, html: (r) => esc(r.Idade) },
  { key: 'cidade', label: 'Cidade', get: (r) => cellChoice(r, 'wb2gy08'), html: (r) => esc(cellChoice(r, 'wb2gy08')) },
  { key: 'zona', label: 'Zona', get: (r) => cellChoice(r, 'ml1hg11'), html: (r) => { const v = cellChoice(r, 'ml1hg11'); return v ? `<span class="pill">${esc(v)}</span>` : ''; } },
  { key: 'genero', label: 'Gênero', get: (r) => cellChoice(r, 'xv1wh54'), html: (r) => esc(cellChoice(r, 'xv1wh54')) },
  { key: 'trabalha', label: 'Trabalha', get: (r) => cellChoice(r, 'li3gq59'), html: (r) => esc(cellChoice(r, 'li3gq59')) },
  { key: 'renda', label: 'Renda per capita', get: (r) => cellChoice(r, 'bi8dg53'), html: (r) => esc(cellChoice(r, 'bi8dg53')) },
  { key: 'servicos', label: 'Serviços', get: (r) => serviceCount(r), html: (r) => { const n = serviceCount(r); return n ? `<span class="pill">${n}</span>` : ''; } },
  { key: 'cpf', label: 'CPF', get: (r) => r.CPF, html: (r) => (r.CPF ? (app.reveal ? esc(r.CPF) : '<span class="masked">••••••••</span>') : '') },
  { key: 'envio', label: 'Envio', get: (r) => r.__envio, html: (r) => esc(fmtDate(r.__envio)) }
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
    const json = await fetchJson(url, { cache: 'no-store' });
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
    const json = await fetchJson(url, { cache: 'no-store' });
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
  const btnClear = $('btnLimparFiltros');
  const tem = app.cidadeFiltro || (app.periodoFiltro !== 'todos');
  chips.innerHTML = '';
  if (btnClear) btnClear.hidden = !tem;
  const btnCob = $('btnLimparCobertura');
  if (btnCob) btnCob.hidden = !app.cidadeFiltro;
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
const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

function initTema() {
  const btn = $('themeToggle');
  const icon = $('themeIcon');
  const text = $('themeText');
  const saved = localStorage.getItem('dashboard:theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  icon.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
  text.textContent = theme === 'dark' ? 'Claro' : 'Escuro';
  btn.addEventListener('click', () => {
    const atual = document.documentElement.dataset.theme;
    const novo = atual === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    localStorage.setItem('dashboard:theme', novo);
    icon.innerHTML = novo === 'dark' ? ICON_SUN : ICON_MOON;
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
  es.addEventListener('sync-error', (ev) => {
    try {
      const p = JSON.parse(ev.data);
      showError(`Falha na sincronização com o Kobo: ${p.message}`);
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

  $('btnLimparCobertura').addEventListener('click', () => setCidadeFiltro(null));

  $('tbodyMunicipio').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || !tr.children.length) return;
    const nome = tr.children[0].textContent.trim();
    setCidadeFiltro(nome === app.cidadeFiltro ? null : nome);
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

}

async function loadSchema() {
  try {
    const json = await fetchJson(API_SCHEMA, { cache: 'no-store' });
    app.schema = json.schema;
    app.fields = json.schema?.fields || [];
    app.choices = json.schema?.choices || {};
    if (app.schema?.title) {
      $('projectTitle').textContent = app.schema.title;
      document.title = `${app.schema.title} — Dashboard`;
    }
    if (app.schema?.description) {
      $('projectSubtitle').textContent = app.schema.description;
    } else if (app.schema?.title) {
      $('projectSubtitle').textContent = 'Cadastro de Usuários';
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
    // opções do formulário (mesmo que ainda não haja registros)
    const listaCidades = (app.choices.wb2gy08 || []).map((c) => c.label || c.name);
    for (const c of listaCidades) cidades.add(c);
    sel.innerHTML = '<option value="">Todos os municípios</option>' + [...cidades].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  } catch (err) {
    showError(`Falha ao carregar o schema do formulário: ${err.message}`);
  }
}

function initScrollProgress() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const update = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
    bar.style.setProperty('--scroll-progress', p.toFixed(4));
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

// ---------- Visibilidade de seções (modal) ----------
const SECOES_PADRAO = [
  'sec-visao-geral',
  'sec-evolucao',
  'sec-cobertura',
  'sec-perfil-social',
  'sec-vulnerabilidade',
  'sec-demanda-servicos',
  'sec-qualidade',
  'sec-cadastros-recentes'
];

const LABEL_SECOS = {
  'sec-visao-geral': 'Painel 1 — Visão geral',
  'sec-evolucao': 'Evolução do cadastro',
  'sec-cobertura': 'Cobertura territorial (mapa)',
  'sec-perfil-social': 'Painel 2 — Perfil social e familiar',
  'sec-vulnerabilidade': 'Painel 3 — Vulnerabilidade socioeconômica',
  'sec-demanda-servicos': 'Painel 4 — Demanda por serviços',
  'sec-qualidade': 'Qualidade da coleta',
  'sec-cadastros-recentes': 'Cadastros recentes (tabela)'
};

function carregarVisibilidade() {
  try {
    const v = JSON.parse(localStorage.getItem('dashSecoesVisiveis') || 'null');
    return v && Array.isArray(v) ? v : [...SECOES_PADRAO];
  } catch { return [...SECOES_PADRAO]; }
}

function salvarVisibilidade(lista) {
  localStorage.setItem('dashSecoesVisiveis', JSON.stringify(lista));
}

function montarModalSecoes() {
  const lista = $('secaoLista');
  if (!lista) return;
  const visiveis = new Set(carregarVisibilidade());
  lista.innerHTML = SECOES_PADRAO.map((id) => `
    <label class="secao-item">
      <input type="checkbox" value="${id}" ${visiveis.has(id) ? 'checked' : ''} />
      <span>${LABEL_SECOS[id] || id}</span>
    </label>
  `).join('');
  const inputs = lista.querySelectorAll('input');
  inputs.forEach((inp) => {
    inp.addEventListener('change', () => {
      const visiveis = SECOES_PADRAO.filter((id) => {
        const el = lista.querySelector(`input[value="${id}"]`);
        return el && el.checked;
      });
      salvarVisibilidade(visiveis);
      aplicarVisibilidade();
    });
  });
}

function aplicarVisibilidade() {
  const visiveis = new Set(carregarVisibilidade());
  SECOES_PADRAO.forEach((id) => {
    const el = $(id);
    if (el) el.hidden = !visiveis.has(id);
  });
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
}

function initSecoes() {
  const btn = $('btnVisibilidade');
  const modal = $('modalSecoes');
  const backdrop = $('modalSecoesBackdrop');
  const fechar = $('modalSecoesFechar');
  const aplicar = $('modalSecoesAplicar');
  const resetar = $('modalSecoesReset');
  if (!btn || !modal) return;
  montarModalSecoes();
  aplicarVisibilidade();
  const abrir = () => { montarModalSecoes(); modal.hidden = false; };
  const fecharModal = () => { modal.hidden = true; };
  btn.addEventListener('click', abrir);
  fechar.addEventListener('click', fecharModal);
  backdrop.addEventListener('click', fecharModal);
  aplicar.addEventListener('click', fecharModal);
  resetar.addEventListener('click', () => {
    salvarVisibilidade([...SECOES_PADRAO]);
    montarModalSecoes();
    aplicarVisibilidade();
  });
}

async function init() {
  bind();
  initTema();
  initScrollProgress();
  initSecoes();
  await loadSchema();
  await initMapa();
  await loadSubmissions();
  connectStream();
}

init();
