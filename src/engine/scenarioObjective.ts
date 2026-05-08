import type { GameState } from './types';
import { getRevenueSummary } from './battery';

export interface ScenarioObjective {
  regime: string;
  target: string;
  successCriteria: string[];
  trap: string;
  progress: string;
  passed: boolean;
}

export function getScenarioObjective(state: GameState): ScenarioObjective {
  const prices = state.dayAhead.forecastPrices.filter(Number.isFinite);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max - min;
  const negativePeriods = prices.filter(price => price < 0).length;
  const spikePeriods = prices.filter(price => price > 150).length;
  const largestNiv = Math.max(...state.dayAhead.niv.map(value => Math.abs(value)), 0);
  const summary = getRevenueSummary(state.battery);
  const schedule = state.dayAhead.playerSchedule;
  const charges = schedule.filter(position => position.action === 'charge');
  const discharges = schedule.filter(position => position.action === 'discharge');
  const bm = schedule.filter(position => position.market === 'bm');

  let regime = 'Classic arbitrage';
  let target = 'Build a balanced charge/discharge plan and capture a positive spread.';
  let trap = 'Do not trade just because a period is morning or evening. Use relative value.';
  let successCriteria = [
    'Schedule or execute at least one charge and one discharge.',
    'Keep final SoC between 20% and 85%.',
    'End with positive realised or scheduled spread.',
  ];

  if (negativePeriods >= 2) {
    regime = 'Negative-price charging';
    target = 'Preserve headroom and charge during the negative-price window.';
    trap = 'Starting too full means you cannot capture the best charging periods.';
    successCriteria = [
      'Charge at least once below £0/MWh or near the cheapest forecast periods.',
      'Avoid filling the battery before the negative-price window.',
      'Discharge later into the strongest relative price period.',
    ];
  } else if (spikePeriods >= 2 || max > 250) {
    regime = 'Scarcity spike';
    target = 'Enter the spike window with enough SoC and monetise the highest-price SPs.';
    trap = 'Selling too early can leave you empty for the real scarcity period.';
    successCriteria = [
      'Maintain usable SoC before the spike.',
      'Discharge into at least one high-price period.',
      'Avoid overcommitting the same MW across markets.',
    ];
  } else if (largestNiv > 500 || spread > 180) {
    regime = 'Imbalance shock';
    target = 'Keep optionality for SIP/BM upside when outturn diverges from DA.';
    trap = 'A neat DA plan may underperform if it leaves no room for ID or BM after the shock.';
    successCriteria = [
      'Use ID or BM at least once after the market moves.',
      'Keep enough SoC/headroom for the shock window.',
      'Review forecast error in the analysis panel.',
    ];
  } else if (spread < 30) {
    regime = 'Flat-spread patience test';
    target = 'Avoid overtrading a low-value day; prefer reserve/idle unless spread is clear.';
    trap = 'Forcing cycles on thin spreads can lose money after efficiency and degradation.';
    successCriteria = [
      'Do not force multiple low-spread cycles.',
      'Keep SoC flexible around 50%.',
      'Use frequency or market context mode rather than pure arbitrage.',
    ];
  }

  const hasBothSides = charges.length > 0 && discharges.length > 0;
  const usedAdvancedMarket = schedule.some(position => position.market === 'id') || bm.length > 0;
  const positiveSpread = summary.avgDischargePrice >= summary.avgChargePrice || state.battery.cycleLog.length < 2;
  const socFlexible = state.battery.socPct >= 20 && state.battery.socPct <= 85;

  let passed = hasBothSides && positiveSpread && socFlexible;
  if (regime === 'Flat-spread patience test') passed = state.battery.cycleLog.length <= 2 && socFlexible;
  if (regime === 'Imbalance shock') passed = usedAdvancedMarket && socFlexible;
  if (regime === 'Scarcity spike') passed = discharges.length > 0 && state.battery.socPct >= 5;

  const progress = `${charges.length} charge, ${discharges.length} discharge, ${bm.length} BM, SoC ${state.battery.socPct.toFixed(0)}%.`;

  return { regime, target, successCriteria, trap, progress, passed };
}
