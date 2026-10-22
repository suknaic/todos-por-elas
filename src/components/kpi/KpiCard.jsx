import { useEffect, useRef } from 'react';

function animNum(el, to, decimals = 0) {
  if (!el) return;
  const from = Number(el.dataset.v || 0);
  if (from === to) {
    el.textContent = decimals ? to.toFixed(decimals) : String(to).toLocaleString('pt-BR');
    el.dataset.v = to;
    return;
  }
  const t0 = performance.now();
  const dur = 620;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * e;
    el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('pt-BR');
    if (p < 1) requestAnimationFrame(step);
    else el.dataset.v = to;
  };
  requestAnimationFrame(step);
}

export default function KpiCard({ id, label, value, sub, decimals = 0, className = '' }) {
  const elRef = useRef(null);
  useEffect(() => {
    animNum(elRef.current, value, decimals);
  }, [value, decimals]);

  return (
    <article className={`kpi ${className}`}>
      <div className="kpi-icone"><svg className="kpi-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></div>
      <div className="kpi-dados">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-valor" id={id} ref={elRef} data-v={value}>{decimals ? value.toFixed(decimals) : String(value).toLocaleString('pt-BR')}</strong>
        <span className="kpi-sub">{sub}</span>
      </div>
    </article>
  );
}