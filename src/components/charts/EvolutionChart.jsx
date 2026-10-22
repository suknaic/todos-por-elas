import { useMemo } from 'react';
import Chart from './Chart.jsx';
import { useDashboard } from '@/context/DashboardContext.jsx';
import { evolucaoChartOptions } from '../../lib/chartOptions.js';

export default function EvolutionChart() {
  const { aggregate } = useDashboard();
  const serie = aggregate?.serieTemporal || [];
  const options = useMemo(() => evolucaoChartOptions(serie), [serie]);

  return <Chart id="chartEvolucao" options={options} series={options.series} type="line" />;
}