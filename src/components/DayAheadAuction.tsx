import { useState } from 'react';
import type { DayAheadBid, DayAheadState } from '../engine/types';
import { OrderSide } from '../engine/types';
import type { BatteryState } from '../engine/battery';
import { hoursUntilGateClosure, getGateClosureTime, formatHour } from '../engine/clock';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import HelpIcon from './HelpIcon';
import { CheckCircle } from 'lucide-react';

interface Props {
  dayAhead: DayAheadState;
  currentTime: number;
  battery: BatteryState;
  onSubmitBids: (bids: DayAheadBid[]) => void;
}

export default function DayAheadAuction({ dayAhead, currentTime, battery, onSubmitBids }: Props) {
  const { isAuctionOpen, results, forecastPrices, sipOutturn, revealedPeriods, playerSchedule } = dayAhead;
  const [bids, setBids] = useState<{ [period: number]: { side: string; volume: string; price: string } }>({});
  const [submitted, setSubmitted] = useState(false);
  const gateHours = hoursUntilGateClosure(currentTime);
  const gateTimeUtc = formatHour(getGateClosureTime(currentTime));

  // Calculate price thresholds to determine charge vs discharge hints
  const sortedPrices = [...forecastPrices].filter(p => p !== 0).sort((a, b) => a - b);
  const lowThreshold = sortedPrices.length > 0 ? sortedPrices[Math.floor(sortedPrices.length * 0.25)] : 35;
  const highThreshold = sortedPrices.length > 0 ? sortedPrices[Math.floor(sortedPrices.length * 0.75)] : 65;

  const handleBidChange = (period: number, field: 'side' | 'volume' | 'price', value: string) => {
    setSubmitted(false);
    const fPrice = forecastPrices[period] ?? 0;
    const existing = bids[period] ?? { side: isHighPeriod(period) ? OrderSide.SELL : OrderSide.BUY, volume: '', price: '' };

    const updated = { ...existing, [field]: value };

    // Auto-fill price with forecast when user enters volume but hasn't set a price
    if (field === 'volume' && value && !existing.price && fPrice > 0) {
      updated.price = fPrice.toFixed(1);
    }

    setBids(prev => ({ ...prev, [period]: updated }));
  };

  const isHighPeriod = (period: number) => {
    const p = forecastPrices[period] ?? 0;
    return p >= highThreshold;
  };

  const handleSubmit = () => {
    const allBids = Object.entries(bids);
    const validBids: DayAheadBid[] = [];
    for (const [periodStr, bid] of allBids) {
      if (!bid.volume || !bid.price) continue;
      const vol = parseFloat(bid.volume);
      const price = parseFloat(bid.price);
      if (isNaN(vol) || isNaN(price) || vol <= 0) continue;
      validBids.push({
        period: Number(periodStr),
        side: bid.side === 'sell' ? OrderSide.SELL : OrderSide.BUY,
        volumeMw: vol,
        price,
      });
    }
    if (validBids.length > 0) {
      onSubmitBids(validBids);
      setSubmitted(true);
      setBids({});
      setTimeout(() => setSubmitted(false), 4000);
    }
  };

  const bidCount = Object.values(bids).filter(b => {
    const v = parseFloat(b.volume);
    const p = parseFloat(b.price);
    return !isNaN(v) && !isNaN(p) && v > 0 && p > 0;
  }).length;
  const hasSipData = revealedPeriods > 0;

  const chartData = forecastPrices.map((price, sp) => ({
    sp: `${String(Math.floor(sp / 2)).padStart(2, '0')}:${sp % 2 === 0 ? '00' : '30'}`,
    price,
    sip: sp < revealedPeriods ? sipOutturn[sp] : null,
    isLow: price > 0 && price <= lowThreshold,
    isHigh: price >= highThreshold,
  }));

  return (
    <div className="panel day-ahead-full" id="dayahead-tab">
      <div className="panel-header">
        <h3>Day-Ahead Market (EPEX SPOT)</h3>
        <HelpIcon text="Submit bids for each half-hour settlement period of the delivery day. Green = cheap (charge). Red = expensive (discharge). Hints are based on where each period sits relative to the day's price distribution." />
      </div>

      <div className="da-status-bar">
        <div className="da-gate">
          {isAuctionOpen ? (
            <span className="gate-open">Auction OPEN — Gate closes at {gateTimeUtc} UTC ({gateHours}h)</span>
          ) : (
            <span className="gate-closed">Auction CLOSED — Reviewing results</span>
          )}
        </div>
        <div className="da-status-right">
          {playerSchedule.length > 0 && (
            <div className="da-schedule-count">
              {playerSchedule.length} periods scheduled
            </div>
          )}
          {submitted && (
            <div className="da-submitted">
              <CheckCircle size={14} /> Bids submitted!
            </div>
          )}
        </div>
      </div>

      {/* Forecast price chart */}
      <div className="da-forecast-chart">
        <h4>
          Price Forecast (48 Settlement Periods)
          <HelpIcon text="Green bars = below 25th percentile (charge). Red bars = above 75th percentile (discharge). Blue = mid-range." />
        </h4>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="sp" stroke="#888" fontSize={9} interval={5} />
            <YAxis stroke="#888" fontSize={11} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', color: '#e5e7eb' }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#e5e7eb' }}
              formatter={(value: unknown, name: unknown) => {
                if (value == null) return ['—', String(name)];
                const label = name === 'price' ? 'DA Forecast' : name === 'sip' ? 'SIP Outturn (Actual)' : name;
                return [`£${Number(value).toFixed(2)}`, String(label)];
              }}
            />
            <Bar dataKey="price" name="DA Forecast" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isLow ? '#22c55e' : entry.isHigh ? '#ef4444' : '#3b82f6'} fillOpacity={0.5} />
              ))}
            </Bar>
            {hasSipData && (
              <Line type="monotone" dataKey="sip" stroke="#ef4444" strokeWidth={2} dot={false} name="SIP Outturn (Actual)" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {hasSipData && (
          <div className="da-chart-legend">
            <span className="legend-item"><span className="legend-bar da-bar" /> DA Forecast</span>
            <span className="legend-item"><span className="legend-line sip-line" /> SIP Outturn (Actual)</span>
          </div>
        )}
      </div>

      {/* Auction results */}
      {results.length > 0 && (
        <div className="da-results">
          <h4>Auction Results</h4>
          <div className="da-results-scroll">
            <table className="data-table">
              <thead>
                <tr><th>Hour</th><th>Clearing</th><th>Your Action</th><th>Status</th></tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.period} className={r.accepted ? 'row-accepted' : ''}>
                    <td>{String(Math.floor(r.period / 2)).padStart(2, '0')}:{r.period % 2 === 0 ? '00' : '30'}</td>
                    <td>£{r.clearingPrice.toFixed(2)}</td>
                    <td>
                      {r.playerVolume > 0 ? `Charge ${r.playerVolume} MW` :
                       r.playerVolume < 0 ? `Discharge ${Math.abs(r.playerVolume)} MW` : '—'}
                    </td>
                    <td className={r.accepted ? 'positive' : 'muted'}>
                      {r.accepted ? 'Accepted' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bid entry — always visible so user can enter bids */}
      <div className="da-bid-section">
        {!isAuctionOpen && (
          <div className="da-gate-warning">
            Gate has closed for this delivery day. Bids submitted now will apply to the next auction.
          </div>
        )}
          <h4>
            Submit Battery Schedule
            <HelpIcon text="Fill in MW and price for settlement periods you want to trade. Use Quick Fill for a standard arbitrage schedule, or customise each period." />
          </h4>
          <div className="da-quick-fill">
            <span className="da-quick-label">Quick Fill:</span>
            <button className="btn btn-preset" onClick={() => {
              const pw = battery.config.powerRatingMw;
              const eff = battery.config.efficiencyPct / 100;
              const cap = battery.config.capacityMwh;
              const currentSoc = battery.currentSocMwh;
              const headroom = cap - currentSoc; // MWh we can charge

              const periodPrices = Array.from({ length: 48 }, (_, period) => ({
                period, price: forecastPrices[period] ?? 0,
              })).filter(x => Number.isFinite(x.price));
              const sorted = [...periodPrices].sort((a, b) => a.price - b.price);

              const newBids: typeof bids = {};
              // Charge cheapest settlement periods until battery full
              let chargeRemaining = headroom / (eff * 0.5); // grid MW needed across half-hour periods
              for (const { period, price } of sorted) {
                if (chargeRemaining <= 0) break;
                const mw = Math.min(pw, chargeRemaining);
                newBids[period] = { side: OrderSide.BUY, volume: String(Math.round(mw)), price: price.toFixed(1) };
                chargeRemaining -= mw;
              }
              // Discharge most expensive settlement periods until battery empty (after charging it's full)
              let dischargeRemaining = cap / 0.5; // after full charge, can discharge full capacity across half-hours
              for (const { period, price } of [...periodPrices].sort((a, b) => b.price - a.price)) {
                if (dischargeRemaining <= 0) break;
                if (newBids[period]) continue; // don't overwrite charge periods
                const mw = Math.min(pw, dischargeRemaining);
                newBids[period] = { side: OrderSide.SELL, volume: String(Math.round(mw)), price: price.toFixed(1) };
                dischargeRemaining -= mw;
              }
              setBids(newBids);
            }}>
              Arbitrage
            </button>
            <button className="btn btn-preset" onClick={() => {
              const pw = battery.config.powerRatingMw;
              const eff = battery.config.efficiencyPct / 100;
              const cap = battery.config.capacityMwh;
              const headroom = (cap - battery.currentSocMwh) / (eff * 0.5);
              const sorted = Array.from({ length: 48 }, (_, period) => ({
                period, price: forecastPrices[period] ?? 0,
              })).filter(x => Number.isFinite(x.price)).sort((a, b) => a.price - b.price);
              const newBids: typeof bids = {};
              let remaining = headroom;
              for (const { period, price } of sorted) {
                if (remaining <= 0) break;
                const mw = Math.min(pw, remaining);
                newBids[period] = { side: OrderSide.BUY, volume: String(Math.round(mw)), price: price.toFixed(1) };
                remaining -= mw;
              }
              setBids(newBids);
            }}>
              Charge only
            </button>
            <button className="btn btn-preset" onClick={() => {
              const pw = battery.config.powerRatingMw;
              const available = battery.currentSocMwh / 0.5;
              const sorted = Array.from({ length: 48 }, (_, period) => ({
                period, price: forecastPrices[period] ?? 0,
              })).filter(x => Number.isFinite(x.price)).sort((a, b) => b.price - a.price);
              const newBids: typeof bids = {};
              let remaining = available;
              for (const { period, price } of sorted) {
                if (remaining <= 0) break;
                const mw = Math.min(pw, remaining);
                newBids[period] = { side: OrderSide.SELL, volume: String(Math.round(mw)), price: price.toFixed(1) };
                remaining -= mw;
              }
              setBids(newBids);
            }}>
              Discharge only
            </button>
            <button className="btn btn-preset" onClick={() => setBids({})}>
              Clear
            </button>
          </div>
          <div className="da-bid-scroll">
            <table className="data-table bid-table">
              <thead>
                <tr><th>SP</th><th>Forecast</th><th>Hint</th><th>Action</th><th>MW</th><th>Price £</th></tr>
              </thead>
              <tbody>
                {Array.from({ length: 48 }, (_, sp) => {
                  const fPrice = forecastPrices[sp] ?? 0;
                  const bid = bids[sp];
                  const isLow = fPrice > 0 && fPrice <= lowThreshold;
                  const isHigh = fPrice >= highThreshold;
                  const isMid = fPrice > 0 && !isLow && !isHigh;
                  const defaultSide = isHigh ? OrderSide.SELL : OrderSide.BUY;
                  return (
                    <tr key={sp} className={isLow ? 'row-charge-hint' : isHigh ? 'row-discharge-hint' : ''}>
                      <td>{String(Math.floor(sp / 2)).padStart(2, '0')}:{sp % 2 === 0 ? '00' : '30'}</td>
                      <td className="muted">£{fPrice.toFixed(1)}</td>
                      <td className="da-hint">
                        {isLow && <span className="hint-charge">Charge</span>}
                        {isHigh && <span className="hint-discharge">Discharge</span>}
                        {isMid && <span className="hint-mid">—</span>}
                        {fPrice === 0 && <span className="hint-mid">N/A</span>}
                      </td>
                      <td>
                        <select
                          value={bid?.side ?? defaultSide}
                          onChange={e => handleBidChange(sp, 'side', e.target.value)}
                          className="input input-sm"
                        >
                          <option value={OrderSide.BUY}>Charge</option>
                          <option value={OrderSide.SELL}>Discharge</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={bid?.volume ?? ''}
                          onChange={e => handleBidChange(sp, 'volume', e.target.value)}
                          placeholder="0"
                          min="1" max="50"
                          className="input input-sm"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={bid?.price ?? ''}
                          onChange={e => handleBidChange(sp, 'price', e.target.value)}
                          placeholder={fPrice > 0 ? fPrice.toFixed(0) : ''}
                          step="0.5"
                          className="input input-sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="da-submit-row">
            <button
              className={`btn btn-submit ${bidCount > 0 ? 'btn-buy' : ''}`}
              onClick={handleSubmit}
            >
              {submitted
                ? '✓ Bids Submitted!'
                : bidCount > 0
                  ? `Submit ${bidCount} Bid${bidCount > 1 ? 's' : ''}`
                  : 'Enter MW to submit (price auto-fills from forecast)'}
            </button>
          </div>
        </div>
    </div>
  );
}
