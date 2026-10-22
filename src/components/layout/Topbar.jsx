import { useDashboard } from '@/context/DashboardContext.jsx';
import { ICON_MOON, ICON_SUN } from '../../lib/constants.js';

export default function Topbar() {
  const { theme, liveStatus, actions, mobileMenuOpen } = useDashboard();
  const { setTheme, refreshAll, showToast, openSectionsModal, toggleMobileMenu, logout } = actions;

  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src="/assets/por-todos-elas-logo.png" alt="Por Todas Elas" />
        <div className="brand-text">
          <h1 id="projectTitle">TodosPorElas</h1>
          <p id="projectSubtitle">Cadastro de Usuários</p>
        </div>
      </div>

      <div className="topbar-actions" id="topbarActions">
        <button className="theme-toggle" id="themeToggle" title="Alternar tema claro/escuro" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <span id="themeIcon" dangerouslySetInnerHTML={{ __html: theme === 'dark' ? ICON_SUN : ICON_MOON }} />
          <span id="themeText">{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
        </button>
        <div className={`live ${liveStatus.status}`} id="liveBadge" title="Status da conexão em tempo real">
          <span className="live-dot" />
          <span id="liveText">{liveStatus.text}</span>
        </div>
        <a className="btn" href="/api/export.csv" id="btnExport">Exportar CSV</a>
        <a className="btn" href="/api/export.resumo.csv" id="btnExportResumo">Resumo por município</a>
        <button className="btn btn-primary" id="btnRefresh" onClick={() => { refreshAll(); showToast('Dados atualizados'); }}>Atualizar agora</button>
        <button className="btn" id="btnVisibilidade" title="Selecionar seções visíveis" onClick={openSectionsModal}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Seções</span>
        </button>
        <button className="btn" id="btnLogout" title="Sair da conta" onClick={logout}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sair</span>
        </button>
      </div>

      <button className="menu-toggle" id="btnMenu" aria-label="Abrir menu" aria-controls="mobileTopbarActions" aria-expanded={mobileMenuOpen} onClick={toggleMobileMenu}>☰</button>
    </header>
  );
}

