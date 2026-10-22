import { useDashboard } from '@/context/DashboardContext.jsx';
import { useMemo } from 'react';
import { esc, fmtDate } from '../../lib/format.js';
import { fieldByList, getValue, choiceLabel } from '../../lib/choices.js';

const TABLE_COLS = [
  { key: 'nome', label: 'Nome', render: (r) => esc(r.Nome_do_usu_rio) || '<span class="masked">sem nome</span>' },
  { key: 'idade', label: 'Idade', render: (r) => esc(r.Idade) },
  { key: 'cidade', label: 'Cidade', render: (r, fields, choices) => esc(choiceLabel('wb2gy08', getValue(r, fieldByList(fields, 'wb2gy08'), choices), choices)) },
  { key: 'zona', label: 'Zona', render: (r, fields, choices) => { const v = choiceLabel('ml1hg11', getValue(r, fieldByList(fields, 'ml1hg11'), choices), choices); return v ? `<span class="pill">${esc(v)}</span>` : ''; } },
  { key: 'genero', label: 'Gênero', render: (r, fields, choices) => esc(choiceLabel('xv1wh54', getValue(r, fieldByList(fields, 'xv1wh54'), choices), choices)) },
  { key: 'trabalha', label: 'Trabalha', render: (r, fields, choices) => esc(choiceLabel('li3gq59', getValue(r, fieldByList(fields, 'li3gq59'), choices), choices)) },
  { key: 'renda', label: 'Renda per capita', render: (r, fields, choices) => esc(choiceLabel('bi8dg53', getValue(r, fieldByList(fields, 'bi8dg53'), choices), choices)) },
  { key: 'servicos', label: 'Serviços', render: (r, fields, choices) => { const f = fieldByList(fields, 'zx7ud82'); const v = f ? getValue(r, f, choices) : []; const n = Array.isArray(v) ? v.length : (v ? 1 : 0); return n ? `<span class="pill">${n}</span>` : ''; } },
  { key: 'cpf', label: 'CPF', render: (r, fields, choices, reveal) => { const f = fieldByList(fields, 'CPF'); if (!f) return ''; const v = getValue(r, f, choices); return v ? (reveal ? esc(v) : '<span class="masked">••••••••</span>') : ''; } },
  { key: 'envio', label: 'Envio', render: (r) => esc(fmtDate(r.__envio)) }
];

export default function SubmissionsTable() {
  const { fields, choices, submissions, tableState, actions } = useDashboard();
  const { setSort, setReveal, setPage, setSearch, refreshAll } = actions;
  const { rows, total, page, pages, size } = submissions;
  const { sort, search, reveal } = tableState;
  const dir = sort.dir;

  const handleCellHtml = (row, col) => {
    const v = col.render(row, fields, choices, reveal);
    return { __html: v };
  };

  return (
    <section className="section" id="sec-cadastros-recentes">
      <div className="table-head">
        <h2 className="section-title">Cadastros recentes</h2>
        <div className="table-tools">
          <input
            type="search"
            id="searchInput"
            placeholder="Buscar nome, município, telefone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <label className="toggle">
            <input type="checkbox" id="revealSensitive" checked={reveal} onChange={e => setReveal(e.target.checked)} />
            <span>Revelar RG / CPF</span>
          </label>
        </div>
      </div>

      <div className="empty" id="emptyState" hidden={total > 0}>
        <div className="empty-icon">⏳</div>
        <h3>Nenhum cadastro recebido ainda</h3>
        <p>O dashboard atualiza automaticamente assim que uma resposta for enviada pelo coletor de campo.</p>
      </div>

      <div className="card table-card" id="tableCard" hidden={total === 0}>
        <div className="table-scroll">
          <table id="dataTable">
            <thead>
              <tr>
                {TABLE_COLS.map(col => (
                  <th
                    key={col.key}
                    data-key={col.key}
                    className={sort.key === col.key ? 'sorted' : ''}
                    onClick={() => setSort(col.key)}
                  >
                    {col.label}
                    {sort.key === col.key && (dir === 'asc' ? ' ↑' : ' ↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {TABLE_COLS.map(col => (
                    <td key={col.key} dangerouslySetInnerHTML={handleCellHtml(r, col)} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span id="tableCount">{total} {total === 1 ? 'registro' : 'registros'}</span>
          <div className="pager">
            <button className="btn btn-sm" id="prevPage" onClick={() => setPage(page - 1)} disabled={page <= 1}>Anterior</button>
            <span id="pageInfo">Página {page} de {pages}</span>
            <button className="btn btn-sm" id="nextPage" onClick={() => setPage(page + 1)} disabled={page >= pages}>Próxima</button>
          </div>
        </div>
      </div>
    </section>
  );
}