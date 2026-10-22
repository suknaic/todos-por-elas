import { useDashboard } from '@/context/DashboardContext.jsx';
import { SECOES_PADRAO } from '../../lib/constants.js';

export default function SectionVisibilityModal() {
  const {
    sections,
    sectionLabels,
    sectionsModalOpen,
    actions: { toggleSection, resetSections, closeSectionsModal }
  } = useDashboard();

  return (
    <div className="modal" id="modalSecoes" hidden={!sectionsModalOpen} aria-labelledby="modalSecoesTitulo" role="dialog">
      <div className="modal-backdrop" id="modalSecoesBackdrop" onClick={closeSectionsModal} />
      <div className="modal-panel">
        <div className="modal-header">
          <h3 id="modalSecoesTitulo">Seções visíveis</h3>
          <button className="btn-close" id="modalSecoesFechar" aria-label="Fechar" onClick={closeSectionsModal}>×</button>
        </div>
        <div className="modal-body">
          <p className="modal-hint">Marque as seções que deseja exibir no dashboard.</p>
          <div className="secao-lista" id="secaoLista">
            {SECOES_PADRAO.map(id => (
              <label key={id} className="secao-item">
                <input
                  type="checkbox"
                  value={id}
                  checked={sections.includes(id)}
                  onChange={() => toggleSection(id)}
                />
                <span>{sectionLabels[id] || id}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" id="modalSecoesReset" onClick={resetSections}>Restaurar padrão</button>
          <button className="btn btn-primary" id="modalSecoesAplicar" onClick={closeSectionsModal}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}
