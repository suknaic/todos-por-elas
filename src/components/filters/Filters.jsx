import { useDashboard } from '@/context/DashboardContext.jsx';

export default function Filters() {
  const { filters, fields, choices, actions } = useDashboard();
  const { setDaysFilter, setCityFilter } = actions;

  const fCidade = fields.find(f => f.xpath === 'wb2gy08' || f.name === 'wb2gy08' || (f.label && f.label.includes('Cidade')));

  const cidades = new Set();
  if (fCidade) {
    // Use choices from form for cities
    const listaCidades = (choices['wb2gy08'] || []).map(c => c.label || c.name);
    listaCidades.forEach(c => cidades.add(c));
  }

  return (
    <section className="filtros" id="filtros">
      <h2 className="filtro-titulo">Filtros </h2>
      <div className="filtro-linha">
        <div className="filtro-item">
          <label>Período</label>
          <select id="filtroPeriodo" value={filters.days} onChange={e => setDaysFilter(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </div>
        <div className="filtro-item">
          <label>Município</label>
          <select id="filtroMunicipio" value={filters.city || ''} onChange={e => setCityFilter(e.target.value || null)}>
            <option value="">Todos os municípios</option>
            {[...cidades].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-sm" id="btnLimparFiltros" onClick={() => { setDaysFilter('todos'); setCityFilter(null); }}>Limpar filtros</button>
      </div>
      <Chips />
    </section>
  );
}

function Chips() {
  const { filters, actions } = useDashboard();
  const { setCityFilter, setDaysFilter } = actions;
  return (
    <div className="chips" id="chips">
      {filters.city && (
        <div className="chip">
          <span>Município: {filters.city}</span>
          <button className="chip-remover" onClick={() => setCityFilter(null)}>×</button>
        </div>
      )}
      {filters.days !== 'todos' && (
        <div className="chip">
          <span>Período: últimos {filters.days} dias</span>
          <button className="chip-remover" onClick={() => { setDaysFilter('todos'); }}>×</button>
        </div>
      )}
    </div>
  );
}