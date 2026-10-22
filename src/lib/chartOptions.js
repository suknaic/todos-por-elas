import { PALETTE, SCALE, SCALE_DARK, ORDERED_AGES, cssVar, isDark } from './constants';
import { sortedEntries } from './choices.js';

export function chartBase() {
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

export function barChartOptions(map, { horizontal = false, max = 12, labelFormat = null } = {}) {
  const isArray = Array.isArray(map);
  let entries = isArray ? map.map((d) => (Array.isArray(d) ? [d[0], d[1]] : [d, 0])) : sortedEntries(map);
  if (entries.length > max) entries = entries.slice(0, max);
  const labels = entries.map((d) => (labelFormat ? labelFormat(d[0]) : (d[0] || '—')));
  const values = entries.map((d) => Number(d[1]) || 0);
  const colors = entries.map((_, i) => PALETTE[i % PALETTE.length]);
  const soft = cssVar('--text-soft');
  const axisLabel = { style: { colors: soft, fontSize: '11px', fontFamily: 'Inter' } };

  return {
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
  };
}

export function doughnutChartOptions(map) {
  const entries = sortedEntries(map);
  const empty = entries.length === 0;
  const labels = empty ? ['Sem dados'] : entries.map((d) => d[0] || '—');
  const series = empty ? [1] : entries.map((d) => Number(d[1]) || 0);
  const colors = empty ? ['#e7e3f0'] : entries.map((_, i) => PALETTE[i % PALETTE.length]);
  const soft = cssVar('--text-soft');

  return {
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
  };
}

export function histogramChartOptions(entries) {
  const labels = entries.map(([k]) => k);
  const values = entries.map(([, v]) => Number(v) || 0);
  const soft = cssVar('--text-soft');
  const axis = { style: { colors: soft, fontSize: '11px', fontFamily: 'Inter' } };

  return {
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
  };
}

export function crossTabSeries(ct, maxSeries = 7) {
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

export function stackedChartOptions(ct, { horizontal = false, maxSeries = 7 } = {}) {
  const { categories, series } = crossTabSeries(ct, maxSeries);
  const soft = cssVar('--text-soft');
  const axis = { style: { colors: soft, fontSize: '10.5px', fontFamily: 'Inter' } };

  return {
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
  };
}

export function ageBucketsMap(map) {
  return ORDERED_AGES.map((k) => [k, map.get(k) || 0]);
}

export function evolucaoChartOptions(serie) {
  const dias = serie.map((s) => s.dia);
  const novos = serie.map((s) => s.novos);
  const acum = serie.map((s) => s.acumulado);
  const soft = cssVar('--text-soft');
  const axis = { style: { colors: soft, fontSize: '10.5px', fontFamily: 'Inter' } };

  return {
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
  };
}