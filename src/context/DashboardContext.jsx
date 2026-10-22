import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getSchema, getAggregate, getSubmissions, createSSEConnection, logout as logoutApi } from '../api/dashboard.js';
import { SECOES_PADRAO, LABEL_SECOES } from '../lib/constants.js';

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const [schema, setSchema] = useState(null);
  const [fields, setFields] = useState([]);
  const [choices, setChoices] = useState({});
  const [aggregate, setAggregate] = useState(null);
  const [submissions, setSubmissions] = useState({ rows: [], total: 0, page: 1, pages: 1, size: 15 });
  const [filters, setFilters] = useState({ city: null, days: 'todos' });
  const [tableState, setTableState] = useState({ sort: { key: 'submitted_at', dir: 'desc' }, search: '', reveal: false });
  const [theme, setThemeState] = useState('light');
  const [sections, setSections] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('dashSecoesVisiveis') || 'null');
      return v && Array.isArray(v) ? v : [...SECOES_PADRAO];
    } catch { return [...SECOES_PADRAO]; }
  });
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [sectionsModalOpen, setSectionsModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState({ status: 'offline', text: 'Conectando…' });
  const tableStateRef = useRef(tableState);
  const lastVersionRef = useRef(-1);
  const sseRef = useRef(null);
  const debounceRef = useRef(null);

  const loadSchema = useCallback(async () => {
    try {
      const json = await getSchema();
      setSchema(json.schema);
      setFields(json.schema?.fields || []);
      setChoices(json.schema?.choices || {});
      if (json.schema?.title) {
        document.title = `${json.schema.title} — Dashboard`;
      }
    } catch (err) {
      setError(`Falha ao carregar o schema: ${err.message}`);
    }
  }, []);

  const loadAggregate = useCallback(async () => {
    try {
      const json = await getAggregate({ city: filters.city, days: filters.days });
      setAggregate(json);
      setError(null);
    } catch (err) {
      setError(`Falha ao carregar agregados: ${err.message}`);
    }
  }, [filters]);

  const loadSubmissions = useCallback(async (page = 1, state = tableStateRef.current) => {
    try {
      const json = await getSubmissions({
        page,
        size: 15,
        city: filters.city,
        q: state.search,
        days: filters.days,
        sort: state.sort.key,
        dir: state.sort.dir
      });
      setSubmissions({ rows: json.rows || [], total: json.total || 0, page: json.page || 1, pages: json.pages || 1, size: 15 });
    } catch (err) {
      setError(`Falha ao carregar registros: ${err.message}`);
    }
  }, [filters]);

  const refreshAll = useCallback(() => {
    loadAggregate();
    loadSubmissions();
  }, [loadAggregate, loadSubmissions]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5200);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const setCityFilter = useCallback((city) => {
    setFilters(prev => ({ ...prev, city }));
  }, []);

  const setDaysFilter = useCallback((days) => {
    setFilters(prev => ({ ...prev, days }));
  }, []);

  const setSearch = useCallback((search) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = { ...tableStateRef.current, search, page: 1 };
      tableStateRef.current = next;
      setTableState(next);
      loadSubmissions(1, next);
    }, 300);
  }, [loadSubmissions]);

  const setSort = useCallback((key) => {
    const prev = tableStateRef.current;
    const next = prev.sort.key === key
      ? { ...prev, sort: { ...prev.sort, dir: prev.sort.dir === 'asc' ? 'desc' : 'asc' }, page: 1 }
      : { ...prev, sort: { key, dir: 'asc' }, page: 1 };
    tableStateRef.current = next;
    setTableState(next);
    loadSubmissions(1, next);
  }, [loadSubmissions]);

  const setReveal = useCallback((reveal) => {
    setTableState(prev => ({ ...prev, reveal }));
  }, []);

  const setPage = useCallback((page) => {
    if (page >= 1 && page <= submissions.pages) {
      const next = { ...tableStateRef.current, page };
      tableStateRef.current = next;
      setTableState(next);
      loadSubmissions(page, next);
    }
  }, [submissions.pages, loadSubmissions]);

  const toggleSection = useCallback((id) => {
    setSections(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('dashSecoesVisiveis', JSON.stringify(next));
      return next;
    });
  }, []);

  const resetSections = useCallback(() => {
    const next = [...SECOES_PADRAO];
    localStorage.setItem('dashSecoesVisiveis', JSON.stringify(next));
    setSections(next);
  }, []);

  const openSectionsModal = useCallback(() => setSectionsModalOpen(true), []);
  const closeSectionsModal = useCallback(() => setSectionsModalOpen(false), []);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen(open => !open), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // segue para o login mesmo se a sessão já tiver expirado
    }
    window.location.assign('/login');
  }, []);

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('dashboard:theme', newTheme);
    loadAggregate();
  }, [loadAggregate]);

  const initTheme = useCallback(() => {
    const saved = localStorage.getItem('dashboard:theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = initial;
    setThemeState(initial);
  }, []);

  useEffect(() => { tableStateRef.current = tableState; }, [tableState]);

  useEffect(() => {
    initTheme();
    if (!isLoginPage) loadSchema();
  }, [initTheme, loadSchema, isLoginPage]);

  useEffect(() => {
    if (isLoginPage) return;
    loadAggregate();
    loadSubmissions(1);
  }, [isLoginPage, loadAggregate, loadSubmissions]);

  useEffect(() => {
    if (isLoginPage) return;
    const sse = createSSEConnection(
      (event, data) => {
        if (event === 'stats' && data.version != null && data.version !== lastVersionRef.current) {
          lastVersionRef.current = data.version;
          loadAggregate();
          loadSubmissions(1);
        }
        if (event === 'sync-error' && data.message) {
          setError(`Falha na sincronização com o Kobo: ${data.message}`);
        }
        if (event === 'stats') {
          setLiveStatus({ status: 'online', text: 'Tempo real' });
          setError(null);
        }
      },
      (err) => {
        if (err) setLiveStatus({ status: 'offline', text: 'Reconectando…' });
      }
    );
    sse.start();
    sseRef.current = sse;
    return () => { if (sseRef.current) sseRef.current.stop(); };
  }, [isLoginPage, loadAggregate, loadSubmissions]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const value = {
    schema, fields, choices,
    aggregate,
    submissions,
    filters,
    tableState,
    theme,
    sections,
    sectionLabels: LABEL_SECOES,
    sectionsModalOpen,
    mobileMenuOpen,
    error,
    toast,
    liveStatus,
    actions: {
      loadAggregate,
      loadSubmissions,
      refreshAll,
      showToast,
      clearError,
      setCityFilter,
      setDaysFilter,
      setSearch,
      setSort,
      setReveal,
      setPage,
      toggleSection,
      resetSections,
      openSectionsModal,
      closeSectionsModal,
      toggleMobileMenu,
      closeMobileMenu,
      logout,
      setTheme
    }
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard deve ser usado dentro de DashboardProvider');
  return ctx;
}