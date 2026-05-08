import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { HourlyPrice } from '../engine/types';
import HelpIcon from './HelpIcon';
import TermTooltip from './TermTooltip';

interface Props {
  priceHistory: HourlyPrice[];
  currentPrice: HourlyPrice | null;
}

export default function PriceChart({ priceHistory, currentPrice }: Props) {
  // Show current day's data plus last hour of previous day for line continuity
  const lastTs = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].timestamp : 0;
  const dayStart = new Date(lastTs);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const cutoff = dayStartMs - 3600_000;
  const visible = priceHistory.filter(p => p.timestamp >= cutoff);

  const data = visible.map((p) => {
    const d = new Date(p.timestamp);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return {
      time: `${hh}:${mm}`,
      price: p.price,
      renewable: Math.round(p.renewablePct * 100),
    };
  });

  const lastPrice = currentPrice?.price ?? 0;
  const prevPrice = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2].price : lastPrice;
  const change = lastPrice - prevPrice;
  const changeStr = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);

  const prices = visible.map(p => p.price);
  const minPrice = Math.min(...prices, 0);
  const maxPrice = Math.max(...prices, 100);

  const tickInterval = data.length <= 6 ? 0
    : data.length <= 12 ? 1
    : data.length <= 24 ? 2
    : Math.floor(data.length / 10);

  return (
    <div className="panel price-chart-panel" id="price-chart">
      <div className="panel-header">
        <h3>Electricity Price <TermTooltip term="Spread" /></h3>
        <HelpIcon text="The spot electricity price by settlement period. Use fixed zones as rough context, but make decisions from relative moves, recent volatility, SoC, and the Market Signal panel." />
        <div className="price-display">
          <span className="current-price" style={{ color: change > 0 ? '#ef4444' : change < 0 ? '#22c55e' : '#eab308' }}>
            £{lastPrice.toFixed(2)}
          </span>
          <span className="price-unit">/MWh</span>
          <span className={`price-change ${change >= 0 ? 'positive' : 'negative'}`}>
            {changeStr}
          </span>
        </div>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 15 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="time"
              stroke="#888"
              fontSize={11}
              interval={tickInterval}
              height={45}
              label={{ value: 'Half-hourly Settlement Period', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 11 }}
            />
            <YAxis
              stroke="#888"
              fontSize={11}
              domain={[Math.floor(minPrice - 5), Math.ceil(maxPrice + 5)]}
              label={{ value: '£/MWh', angle: -90, position: 'insideLeft', offset: 5, fill: '#888', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }}
              labelStyle={{ color: '#ccc' }}
              formatter={(value: unknown) => [`£${Number(value).toFixed(2)}/MWh`, 'Price']}
            />
            <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {currentPrice && (
        <div className="price-context">
          <span>Demand: {(currentPrice.demandMw / 1000).toFixed(1)} GW</span>
          <span>Renewables: {Math.round(currentPrice.renewablePct * 100)}%</span>
          <span>Base: £{currentPrice.basePrice.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
