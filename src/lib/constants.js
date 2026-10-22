export const PALETTE = [
  '#5a34a0', '#b02a5b', '#1f6f57', '#8a5a1d',
  '#0f6fb0', '#c2410c', '#0891b2', '#7c3aed'
];

export const SCALE = ['#ede7f6', '#c3b0e2', '#8560c0', '#4b2a8a'];
export const SCALE_DARK = ['#3a2d5c', '#4a3d70', '#8560c0', '#c3b0e2'];

export const SECOES_PADRAO = [
  'sec-visao-geral',
  'sec-evolucao',
  'sec-cobertura',
  'sec-perfil-social',
  'sec-vulnerabilidade',
  'sec-demanda-servicos',
  'sec-qualidade',
  'sec-cadastros-recentes'
];

export const LABEL_SECOES = {
  'sec-visao-geral': 'Painel 1 — Visão geral',
  'sec-evolucao': 'Evolução do cadastro',
  'sec-cobertura': 'Cobertura territorial (mapa)',
  'sec-perfil-social': 'Painel 2 — Perfil social e familiar',
  'sec-vulnerabilidade': 'Painel 3 — Vulnerabilidade socioeconômica',
  'sec-demanda-servicos': 'Painel 4 — Demanda por serviços',
  'sec-qualidade': 'Qualidade da coleta',
  'sec-cadastros-recentes': 'Cadastros recentes (tabela)'
};

export const API_AGGREGATE = '/api/aggregate';
export const API_SUBMISSIONS = '/api/submissions';
export const API_SCHEMA = '/api/schema';
export const API_STREAM = '/api/stream';


export const ORDERED_AGES = ['0–17', '18–24', '25–34', '35–44', '45–54', '55+'];

export const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
export const ICON_SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

export function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}