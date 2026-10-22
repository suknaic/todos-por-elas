import { useMemo } from 'react';
import { useDashboard } from '@/context/DashboardContext.jsx';
import { barChartOptions, doughnutChartOptions, histogramChartOptions, stackedChartOptions, ageBucketsMap } from '../lib/chartOptions.js';
import { ORDERED_AGES } from '../lib/constants.js';
import { fmtMes } from '../lib/format.js';

export function useChartOptions() {
  const { aggregate } = useDashboard();

  const d = aggregate?.demografia || {};
  const s = aggregate?.socioeconomico || {};
  const b = aggregate?.beneficios || {};
  const sv = aggregate?.servicos || {};
  const v = aggregate?.vulnerabilidade || {};
  const dm = aggregate?.demanda || {};
  const q = aggregate?.qualidade || {};

  const idadeMap = useMemo(() => new Map(d.idade?.buckets?.map(([k, val]) => [k, val]) || []), [d.idade?.buckets]);
  const filhosDist = useMemo(() => (s.filhosDist || []).map(([k, val]) => [`${k} filho(s)`, val]), [s.filhosDist]);
  const servicosPorMes = useMemo(() => {
    const porMes = dm.porMes || {};
    const meses = Object.keys(porMes).sort();
    const out = {};
    for (const m of meses) out[fmtMes(m)] = porMes[m];
    return out;
  }, [dm.porMes]);
  const idadeXsaude = useMemo(() => {
    const out = {};
    const idadeSaude = dm.idadeXsaude || {};
    for (const k of ORDERED_AGES) if (idadeSaude[k]) out[k] = idadeSaude[k];
    return out;
  }, [dm.idadeXsaude]);
  const rendaXservicos = useMemo(() => v.rendaXservicos || {}, [v.rendaXservicos]);
  const zonaXservicos = useMemo(() => v.zonaXservicos || {}, [v.zonaXservicos]);
  const racaXservicos = useMemo(() => v.racaXservicos || {}, [v.racaXservicos]);
  const acompanhamentoXservicos = useMemo(() => v.acompanhamentoXservicos || {}, [v.acompanhamentoXservicos]);

  const charts = useMemo(() => [
    // Painel 2
    { id: 'chartIdade', opts: histogramChartOptions(ageBucketsMap(idadeMap)) },
    { id: 'chartGenero', opts: doughnutChartOptions(d.genero) },
    { id: 'chartOrientacao', opts: barChartOptions(d.orientacao, { horizontal: true, max: 8 }) },
    { id: 'chartRaca', opts: doughnutChartOptions(d.raca) },
    { id: 'chartZona', opts: doughnutChartOptions(d.zona) },
    { id: 'chartCidade', opts: barChartOptions(d.cidade, { horizontal: true, max: 12 }) },
    { id: 'chartFilhosSimNao', opts: doughnutChartOptions(s.filhosSimNao) },
    { id: 'chartFilhosDist', opts: histogramChartOptions(filhosDist) },
    { id: 'chartDeficiencia', opts: doughnutChartOptions(b.deficiencia) },
    { id: 'chartTipoDeficiencia', opts: barChartOptions(b.tipoDeficiencia, { horizontal: true, max: 6 }) },
    // Painel 3
    { id: 'chartRenda', opts: barChartOptions(s.renda) },
    { id: 'chartTrabalha', opts: doughnutChartOptions(s.trabalha) },
    { id: 'chartVinculo', opts: barChartOptions(s.vinculo, { horizontal: true, max: 8 }) },
    { id: 'chartAuxilio', opts: doughnutChartOptions(b.recebe) },
    { id: 'chartTipoBeneficio', opts: barChartOptions(b.tipo, { horizontal: true, max: 10 }) },
    { id: 'chartAcompanhamento', opts: doughnutChartOptions(v.acompanhamento) },
    { id: 'chartRendaXzona', opts: stackedChartOptions(s.rendaXzona, { maxSeries: 4 }) },
    { id: 'chartTrabalhaXrenda', opts: stackedChartOptions(v.trabalhaXrenda, { maxSeries: 4 }) },
    { id: 'chartRacaXrenda', opts: stackedChartOptions(v.racaXrenda, { maxSeries: 5 }) },
    // Painel 4
    { id: 'chartServicos', opts: barChartOptions(sv.ranking, { horizontal: true, max: 20, ordered: true }) },
    { id: 'chartAreas', opts: barChartOptions(dm.areas || [], { horizontal: true, max: 8, ordered: true }) },
    { id: 'chartDemandaCidade', opts: barChartOptions(dm.porCidade || [], { horizontal: true, max: 10, ordered: true }) },
    { id: 'chartServicosMes', opts: stackedChartOptions(servicosPorMes, { maxSeries: 6 }) },
    { id: 'chartRendaXservicos', opts: stackedChartOptions(rendaXservicos, { horizontal: true, maxSeries: 6 }) },
    { id: 'chartZonaXservicos', opts: stackedChartOptions(zonaXservicos, { maxSeries: 6 }) },
    { id: 'chartIdadeXsaude', opts: stackedChartOptions(idadeXsaude, { maxSeries: 6 }) },
    { id: 'chartCrasXservicos', opts: stackedChartOptions(acompanhamentoXservicos, { horizontal: true, maxSeries: 6 }) },
    { id: 'chartRacaXservicos', opts: stackedChartOptions(racaXservicos, { maxSeries: 6 }) },
    { id: 'chartHistServicos', opts: histogramChartOptions(sv.histograma || []) },
    // Qualidade
    { id: 'chartRespostaCampo', opts: barChartOptions(q.respostaPorCampo?.map(r => [r.campo, r.n]) || [], { horizontal: true, max: 10 }) },
    { id: 'chartCompletude', opts: doughnutChartOptions(q.completudeDist || {}) },
  ], [
    d.genero, d.orientacao, d.raca, d.zona, d.cidade,
    s.filhosSimNao, s.renda, s.trabalha, s.vinculo, s.rendaXzona,
    b.deficiencia, b.tipoDeficiencia, b.recebe, b.tipo,
    v.acompanhamento, v.trabalhaXrenda, v.racaXrenda, v.rendaXservicos,
    v.zonaXservicos, v.racaXservicos, v.acompanhamentoXservicos,
    sv.ranking, dm.areas, dm.porCidade, servicosPorMes, idadeXsaude,
    q.respostaPorCampo, q.completudeDist
  ]);

  return charts;
}
