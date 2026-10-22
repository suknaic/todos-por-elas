import { useDashboard } from '@/context/DashboardContext.jsx';

export default function ErrorBanner() {
  const { error, actions: { clearError } } = useDashboard();
  if (!error) return null;
  return (
    <div className="error-banner" id="errorBanner">
      <span id="errorText">{error}</span>
      <button id="errorClose" aria-label="Fechar" onClick={clearError}>×</button>
    </div>
  );
}