import { useEffect } from 'react';
import { useDashboard } from '@/context/DashboardContext.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import MobileDrawer from '../components/layout/MobileDrawer.jsx';
import ErrorBanner from '../components/layout/ErrorBanner.jsx';
import Toast from '../components/layout/Toast.jsx';
import Footer from '../components/layout/Footer.jsx';
import Filters from '../components/filters/Filters.jsx';
import Chart from '../components/charts/Chart.jsx';
import { useChartOptions } from '../hooks/useChartOptions.js';
import EvolutionChart from '../components/charts/EvolutionChart.jsx';
import MunicipalityMap from '../components/map/MunicipalityMap.jsx';
import MunicipalityTable from '../components/tables/MunicipalityTable.jsx';
import SubmissionsTable from '../components/tables/SubmissionsTable.jsx';
import SectionVisibilityModal from '../components/modals/SectionVisibilityModal.jsx';
import KpiCard from '../components/kpi/KpiCard.jsx';

function SectionWrapper({ id, children }) {
  const { sections } = useDashboard();
  return sections.includes(id) ? <section className="section" id={id}>{children}</section> : null;
}

export default function DashboardPage() {
  const { aggregate, schema, sections, actions } = useDashboard();
  const { showToast } = actions;
  const chartOptions = useChartOptions();
  const renderChart = (id) => {
    const opts = chartOptions.find(c => c.id === id)?.opts || {};
    return <Chart id={id} options={opts} series={opts.series} type={opts.chart?.type || 'bar'} />;
  };

  useEffect(() => {
    if (schema?.formUrl) {
      const footerForm = document.getElementById('footerForm');
      if (footerForm) footerForm.href = schema.formUrl;
    }
  }, [schema]);

  const ind = aggregate?.indicadores || {};
  const vol = aggregate?.volumetria || {};

  return (
    <>
      <Topbar />
      <MobileDrawer />
      <ErrorBanner />
      <Toast />
      <SectionVisibilityModal />
      <main>
        <Filters />
        <SectionWrapper id="sec-visao-geral">
          <h2 className="section-title">Painel 1 — Visão geral</h2>
          <div className="kpis" id="kpis">
            <KpiCard id="kpiTotal" label="Cadastros totais" value={aggregate?.total || 0} sub={aggregate?.total ? `${aggregate.total} resposta${aggregate.total === 1 ? '' : 's'} recebida${aggregate.total === 1 ? '' : 's'}` : 'aguardando respostas'} />
            <KpiCard id="kpiNovos7d" label="Novos no período" value={aggregate?.n || 0} sub="novos no período selecionado" className="kpi-verde" />
            <KpiCard id="kpiMunicipios" label="Municípios alcançados" value={vol.cidadesAlcancadas || 0} sub="de 22 municípios do Acre" className="kpi-roxo" />
            <KpiCard id="kpiUrbana" label="Zona urbana" value={ind.pctUrbana || 0} decimals={1} sub={`${ind.pctRural || 0}% rural`} className="kpi-laranja" />
            <KpiCard id="kpiFilhos" label="Com filhos" value={ind.pctComFilhos || 0} decimals={1} sub="% dos cadastros com filhos" className="kpi-verde" />
            <KpiCard id="kpiDeficiencia" label="Deficiência na família" value={ind.pctComDeficiencia || 0} decimals={1} sub="% com deficiência na família" className="kpi-rosa" />
            <KpiCard id="kpiMediaServicos" label="Serviços por pessoa" value={aggregate?.servicos?.media || 0} decimals={2} sub="média solicitada por cadastro" className="kpi-laranja" />
          </div>
        </SectionWrapper>

        <SectionWrapper id="sec-evolucao">
          <h2 className="section-title">Evolução do cadastro</h2>
          <div className="grid">
            <article className="card card-wide">
              <div className="chart-box tall">
                <EvolutionChart />
              </div>
            </article>
          </div>
        </SectionWrapper>

        <SectionWrapper id="sec-cobertura">
          <h2 className="section-title">Cobertura territorial — Municípios do Acre</h2>
          <div className="grid">
            <article className="card card-wide">
              <div className="mapa-legenda">
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-soft)' }}>Cadastros por município</span>
                <span className="escala escala-1" title="Baixo" />
                <span className="escala escala-2" />
                <span className="escala escala-3" />
                <span className="escala escala-4" title="Alto" />
                <span className="escala escala-sem" title="Sem registro" />
              </div>
              <MunicipalityMap />
            </article>
            <MunicipalityTable />
          </div>
        </SectionWrapper>

        <SectionWrapper id="sec-perfil-social">
          <h2 className="section-title">Painel 2 — Perfil social e familiar</h2>
          <div className="grid">
            <article className="card"><h3>Faixa etária</h3><div className="chart-box">{renderChart('chartIdade')}</div></article>
            <article className="card"><h3>Identidade de gênero</h3><div className="chart-box">{renderChart('chartGenero')}</div></article>
            <article className="card"><h3>Orientação sexual</h3><div className="chart-box">{renderChart('chartOrientacao')}</div></article>
            <article className="card"><h3>Raça/cor/etnia</h3><div className="chart-box">{renderChart('chartRaca')}</div></article>
            <article className="card"><h3>Zona de residência</h3><div className="chart-box">{renderChart('chartZona')}</div></article>
            <article className="card card-wide"><h3>Cidade de residência</h3><div className="chart-box">{renderChart('chartCidade')}</div></article>
            <article className="card"><h3>Possui filhos</h3><div className="chart-box">{renderChart('chartFilhosSimNao')}</div></article>
            <article className="card"><h3>Quantidade de filhos</h3><div className="chart-box">{renderChart('chartFilhosDist')}</div></article>
            <article className="card"><h3>Deficiência na família</h3><div className="chart-box">{renderChart('chartDeficiencia')}</div></article>
            <article className="card card-wide"><h3>Tipo de deficiência</h3><div className="chart-box">{renderChart('chartTipoDeficiencia')}</div></article>
          </div>
        </SectionWrapper>

        <SectionWrapper id="sec-vulnerabilidade">
          <h2 className="section-title">Painel 3 — Vulnerabilidade socioeconômica</h2>
          <div className="grid">
            <article className="card"><h3>Renda familiar per capita</h3><div className="chart-box">{renderChart('chartRenda')}</div></article>
            <article className="card"><h3>Trabalha atualmente</h3><div className="chart-box">{renderChart('chartTrabalha')}</div></article>
            <article className="card"><h3>Tipo de vínculo</h3><div className="chart-box">{renderChart('chartVinculo')}</div></article>
            <article className="card"><h3>Recebe auxílio financeiro</h3><div className="chart-box">{renderChart('chartAuxilio')}</div></article>
            <article className="card card-wide"><h3>Tipos de auxílio recebidos</h3><div className="chart-box">{renderChart('chartTipoBeneficio')}</div></article>
            <article className="card"><h3>Acompanhamento CRAS/CREAS</h3><div className="chart-box">{renderChart('chartAcompanhamento')}</div></article>
            <article className="card card-wide"><h3>Renda por zona de residência</h3><div className="chart-box">{renderChart('chartRendaXzona')}</div></article>
            <article className="card card-wide"><h3>Trabalho por faixa de renda</h3><div className="chart-box">{renderChart('chartTrabalhaXrenda')}</div></article>
            <article className="card card-wide"><h3>Raça/cor por faixa de renda</h3><div className="chart-box">{renderChart('chartRacaXrenda')}</div></article>
          </div>
        </SectionWrapper>

        <SectionWrapper id="sec-demanda-servicos">
          <h2 className="section-title">Painel 4 — Demanda por serviços</h2>
          <div className="grid">
            <article className="card card-wide"><h3>Serviços mais procurados</h3><div className="chart-box tall">{renderChart('chartServicos')}</div></article>
            <article className="card card-wide"><h3>Demanda por área</h3><div className="chart-box">{renderChart('chartAreas')}</div></article>
            <article className="card card-wide"><h3>Demanda por município</h3><div className="chart-box">{renderChart('chartDemandaCidade')}</div></article>
            <article className="card card-wide"><h3>Evolução mensal dos serviços</h3><div className="chart-box tall">{renderChart('chartServicosMes')}</div></article>
            <article className="card card-wide"><h3>Renda x serviços procurados</h3><div className="chart-box tall">{renderChart('chartRendaXservicos')}</div></article>
            <article className="card card-wide"><h3>Zona de residência x serviços</h3><div className="chart-box">{renderChart('chartZonaXservicos')}</div></article>
            <article className="card card-wide"><h3>Faixa etária x serviços de saúde</h3><div className="chart-box">{renderChart('chartIdadeXsaude')}</div></article>
            <article className="card card-wide"><h3>CRAS/CREAS x serviços</h3><div className="chart-box">{renderChart('chartCrasXservicos')}</div></article>
            <article className="card card-wide"><h3>Raça/cor x serviços</h3><div className="chart-box">{renderChart('chartRacaXservicos')}</div></article>
            <article className="card card-wide"><h3>Serviços por pessoa</h3><div className="chart-box">{renderChart('chartHistServicos')}</div></article>
          </div>
        </SectionWrapper>

        <SectionWrapper id="sec-qualidade">
          <h2 className="section-title">Qualidade da coleta</h2>
          <div className="kpis" style={{ marginBottom: '16px' }}>
            <KpiCard id="kpiCompletude" label="Completude média" value={aggregate?.qualidade?.mediaCompletude || 0} decimals={1} sub="% dos campos preenchidos por cadastro" className="kpi-roxo" />
            <KpiCard id="kpiDup" label="Possíveis duplicidades" value={aggregate?.qualidade?.duplicidadesCPF?.length || 0} sub="CPF repetidos" className="kpi-rosa" />
          </div>
          <div className="grid">
            <article className="card card-wide"><div className="chart-box tall">{renderChart('chartRespostaCampo')}</div></article>
            <article className="card"><div className="chart-box">{renderChart('chartCompletude')}</div></article>
          </div>
        </SectionWrapper>

        {sections.includes('sec-cadastros-recentes') && <SubmissionsTable />}

        <Footer />
      </main>
    </>
  );
}