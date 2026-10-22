import { fetchJson } from './client.js';
import { API_AGGREGATE, API_SUBMISSIONS, API_SCHEMA, API_STREAM } from '../lib/constants.js';

export async function getSchema() {
  return fetchJson(API_SCHEMA, { cache: 'no-store' });
}

export async function getAggregate({ city, days } = {}) {
  const url = new URL(API_AGGREGATE, window.location.origin);
  if (city) url.searchParams.set('city', city);
  if (days && days !== 'todos') url.searchParams.set('days', days);
  return fetchJson(url, { cache: 'no-store' });
}

export async function getSubmissions({ page = 1, size = 15, city, q, days, sort = 'submitted_at', dir = 'desc' } = {}) {
  const url = new URL(API_SUBMISSIONS, window.location.origin);
  url.searchParams.set('page', page);
  url.searchParams.set('size', size);
  if (city) url.searchParams.set('city', city);
  if (q) url.searchParams.set('q', q);
  if (days && days !== 'todos') url.searchParams.set('days', days);
  url.searchParams.set('sort', sort);
  url.searchParams.set('dir', dir);
  return fetchJson(url, { cache: 'no-store' });
}

export async function login(username, password) {
  return fetchJson('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}

export async function logout() {
  return fetchJson('/api/logout', { method: 'POST' });
}

export function createSSEConnection(onMessage, onError) {
  let retry = 1000;
  let abortController = null;

  async function connect() {
    while (true) {
      try {
        abortController = new AbortController();
        const response = await fetch(API_STREAM, {
          cache: 'no-store',
          signal: abortController.signal
        });
        if (response.status === 401 || response.status === 403) {
          const next = window.location.pathname + window.location.search;
          window.location.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        retry = 1000;
        onMessage('stats', { count: 0, version: 0 });
        onError(null);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) throw new Error('Conexão encerrada');
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const event = frame.match(/^event:\s*(.+)$/m)?.[1];
            const data = frame.match(/^data:\s*(.+)$/m)?.[1];
            if (event && data) {
              try {
                onMessage(event, JSON.parse(data));
              } catch {
                console.warn('[stream] falha ao parsear:', frame);
              }
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn('[stream] conexão encerrada:', error.message);
        onError(error.message);
        await new Promise((resolve) => setTimeout(resolve, retry));
        retry = Math.min(retry * 2, 30000);
      }
    }
  }

  return {
    start: () => connect(),
    stop: () => {
      if (abortController) abortController.abort();
    }
  };
}