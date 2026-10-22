import { useDashboard } from '@/context/DashboardContext.jsx';
import { esc } from '../../lib/format.js';

export default function MunicipalityTable() {
  const { aggregate, filters, actions: { setCityFilter } } = useDashboard();
  const cobertura = aggregate?.cobertura || [];

  return (
    <article className="card card-wide">
      <div className="table-head">
        <h3 style={{ margin: 0 }}>Municípios — ranking</h3>
        <button className="btn btn-sm" id="btnLimparCobertura" hidden={!filters.city} onClick={() => setCityFilter(null)}>Limpar filtro</button>
      </div>
      <div className="table-scroll" style={{ maxHeight: '360px', overflow: 'auto' }}>
        <table id="tabelaMunicipio">
          <thead>
            <tr>
              <th>Município</th>
              <th data-key="n">Cadastros</th>
              <th data-key="pct">% do total</th>
              <th data-key="mediaIdade">Idade média</th>
              <th data-key="comServicoPct">Com serviço</th>
            </tr>
          </thead>
          <tbody id="tbodyMunicipio">
            {cobertura.map(c => (
              <tr
                key={c.nome}
                onClick={() => setCityFilter(c.nome === filters.city ? null : c.nome)}
                style={{ background: c.nome === filters.city ? 'var(--brand-soft)' : '', fontWeight: c.nome === filters.city ? 600 : '' }}
              >
                <td>{esc(c.nome)}</td>
                <td data-key="n">{c.n}</td>
                <td data-key="pct">{c.pct}</td>
                <td data-key="mediaIdade">{c.mediaIdade}</td>
                <td data-key="comServicoPct">{c.comServicoPct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-soft)', marginTop: '8px' }}>
        Clique em um município na tabela para filtrar o restante do dashboard por ele.
      </p>
    </article>
  );
}