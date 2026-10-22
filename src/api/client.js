export async function fetchJson(input, options = {}) {
  const headers = new Headers(options.headers || {});
  const response = await fetch(input, { ...options, headers });
  const text = await response.text();
  if ((response.status === 401 || response.status === 403) && window.location.pathname !== '/login') {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    throw new Error('Sessão expirada');
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida do servidor (HTTP ${response.status})`);
  }
}