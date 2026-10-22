import { useEffect } from 'react';
import { useDashboard } from '@/context/DashboardContext.jsx';
import { ICON_MOON, ICON_SUN } from '../../lib/constants.js';

export default function MobileDrawer() {
  const { actions, liveStatus, theme, mobileMenuOpen } = useDashboard();
  const { setTheme, refreshAll, showToast, openSectionsModal, closeMobileMenu, logout } = actions;

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeMobileMenu(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen, closeMobileMenu]);

  const runAndClose = (fn) => () => { fn(); closeMobileMenu(); };

  return (
    <>
      <div className="sidebar-backdrop" id="sidebarBackdrop" hidden={!mobileMenuOpen} onClick={closeMobileMenu} />
      <div className="sidebar-drawer" id="sidebarDrawer" hidden={!mobileMenuOpen}>
        <div className="topbar-actions" id="mobileTopbarActions">
          <button className="drawer-close" id="btnMenuClose" aria-label="Fechar menu" onClick={closeMobileMenu}>×</button>
          <button className="theme-toggle" id="mobileThemeToggle" title="Alternar tema claro/escuro" onClick={runAndClose(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
            <span id="mobileThemeIcon" dangerouslySetInnerHTML={{ __html: theme === 'dark' ? ICON_SUN : ICON_MOON }} />
            <span id="mobileThemeText">{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
          </button>
          <div className={`live ${liveStatus.status}`} id="mobileLiveBadge" title="Status da conexão em tempo real">
            <span className="live-dot" />
            <span id="mobileLiveText">{liveStatus.text}</span>
          </div>
          <a className="btn" href="/api/export.csv" id="mobileBtnExport" onClick={closeMobileMenu}>Exportar CSV</a>
          <a className="btn" href="/api/export.resumo.csv" id="mobileBtnExportResumo" onClick={closeMobileMenu}>Resumo por município</a>
          <button className="btn btn-primary" id="mobileBtnRefresh" onClick={runAndClose(() => { refreshAll(); showToast('Dados atualizados'); })}>Atualizar agora</button>
          <button className="btn" id="mobileBtnVisibilidade" title="Selecionar seções visíveis" onClick={runAndClose(openSectionsModal)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Seções</span>
          </button>
          <button className="btn" id="mobileBtnLogout" title="Sair da conta" onClick={logout}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sair</span>
          </button>
        </div>
      </div>
    </>
  );
}

