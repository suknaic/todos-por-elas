import { useDashboard } from '@/context/DashboardContext.jsx';

export default function Toast() {
  const { toast } = useDashboard();
  if (!toast) return null;
  return <div className="toast" id="toast">{toast}</div>;
}