import { useEffect, useRef } from 'react';
import ApexCharts from 'apexcharts';

export default function Chart({ id, options, series, type = 'bar', height }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const host = containerRef.current;
    host.innerHTML = '';
    const h = height || host.clientHeight || host.parentElement?.clientHeight || 260;
    const chart = new ApexCharts(host, {
      ...options,
      chart: { height: h, width: '100%', type, ...options.chart },
      series: options.series || series || []
    });
    chart.render();
    chartRef.current = chart;
    return () => { try { chart.destroy(); } catch {}; };
  }, [options, series, type, height]);

  return <div id={id} ref={containerRef} className="chart" style={{ height }} />;
}