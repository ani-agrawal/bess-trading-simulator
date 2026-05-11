import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GameState } from '../engine/types';

function label(period: number): string {
  return `${String(Math.floor(period / 2)).padStart(2, '0')}:${period % 2 === 0 ? '00' : '30'}`;
}

export default function CockpitContextCharts({ state }: { state: GameState }) {
  const revealed = state.dayAhead.revealedPeriods;
  const niv = state.dayAhead.niv.map((value, period) => ({
    sp: label(period),
    niv: period < revealed ? value : null,
  }));

  const hasForecast = state.dayAhead.demandForecast.some(v => v > 0);
  const demandRenewables = hasForecast
    ? state.dayAhead.demandForecast.map((demand, sp) => {
        const wind = state.dayAhead.windForecast[sp] ?? 0;
        const solar = state.dayAhead.solarForecast[sp] ?? 0;
        const renewablesPct = demand > 0 ? Math.round(((wind + solar) / demand) * 100) : 0;
        return { sp: label(sp), demandGw: demand / 1000, renewablesPct };
      })
    : state.priceHistory.slice(-48).map(point => ({
        sp: label(new Date(point.timestamp).getUTCHours() * 2 + (new Date(point.timestamp).getUTCMinutes() >= 30 ? 1 : 0)),
        demandGw: point.demandMw / 1000,
        renewablesPct: Math.round(point.renewablePct * 100),
      }));

  return (
    <div className="cockpit-context-charts">
      <div className="context-chart-panel context-chart-panel-large">
        <h4>Demand & Renewables Forecast</h4>
        <ResponsiveContainer width="100%" height={245}>
          <LineChart data={demandRenewables} margin={{ top: 6, right: 18, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="sp" stroke="#888" fontSize={10} interval={5} />
            <YAxis yAxisId="demand" stroke="#888" fontSize={10} tickFormatter={(value) => `${value}GW`} />
            <YAxis yAxisId="ren" orientation="right" stroke="#888" fontSize={10} tickFormatter={(value) => `${value}%`} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                name === 'demandGw' ? `${Number(value).toFixed(1)} GW` : `${Number(value).toFixed(0)}%`,
                name === 'demandGw' ? 'Demand' : 'Renewables',
              ]}
            />
            <Line yAxisId="demand" type="monotone" dataKey="demandGw" stroke="#f97316" strokeWidth={1.6} dot={false} />
            <Line yAxisId="ren" type="monotone" dataKey="renewablesPct" stroke="#22c55e" strokeWidth={1.6} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="context-chart-panel">
        <h4>NIV / System Length</h4>
        <ResponsiveContainer width="100%" height={245}>
          <BarChart data={niv} margin={{ top: 6, right: 18, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="sp" stroke="#888" fontSize={10} interval={5} />
            <YAxis stroke="#888" fontSize={10} tickFormatter={(value) => `${value}`} />
            <Tooltip formatter={(value: unknown) => [`${Number(value).toFixed(0)} MWh`, 'NIV']} />
            <ReferenceLine y={0} stroke="#888" />
            <Bar dataKey="niv" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
