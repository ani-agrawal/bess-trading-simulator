import type { GameState } from './types';
import { getSettlementPeriod } from './clock';
import { getMaxChargeableMw, getMaxDischargeableMw } from './battery';

export interface DecisionCoach {
  action: 'charge' | 'discharge' | 'wait';
  confidence: 'low' | 'medium' | 'high';
  headline: string;
  why: string[];
  opportunityCost: string;
  suggestedMw: number;
}

export function getDecisionCoach(state: GameState): DecisionCoach {
  const currentPrice = state.currentPrice?.price ?? 0;
  const currentSp = Math.max(0, getSettlementPeriod(state.clock.currentTime) - 1);
  const prices = state.dayAhead.forecastPrices.filter(Number.isFinite);
  const observed = state.priceHistory.map(p => p.price);
  const zonePrices = prices.length >= 10 ? prices : observed.length >= 4 ? observed : [currentPrice];
  const eff = state.battery.config.efficiencyPct / 100;
  const mean = zonePrices.reduce((s, p) => s + p, 0) / zonePrices.length;
  const rtLoss = mean * (1 - eff);
  const CHARGE_ZONE = Math.round((mean - rtLoss / 2) * 100) / 100;
  const DISCHARGE_ZONE = Math.round((mean + rtLoss / 2) * 100) / 100;
  const dayMin = prices.length ? Math.min(...prices) : currentPrice;
  const dayMax = prices.length ? Math.max(...prices) : currentPrice;
  const dayMid = (dayMin + dayMax) / 2;
  const future = state.dayAhead.forecastPrices.slice(currentSp + 1).filter(Number.isFinite);
  const futureHigh = future.length ? Math.max(...future) : currentPrice;
  const futureLow = future.length ? Math.min(...future) : currentPrice;
  const efficiency = state.battery.config.efficiencyPct / 100;
  const maxCharge = getMaxChargeableMw(state.battery);
  const maxDischarge = getMaxDischargeableMw(state.battery);
  const socPct = state.battery.socPct;
  const rating = state.battery.config.powerRatingMw;
  const mwAggressive = rating;
  const mwModerate = Math.round(rating * 0.5);
  const mwConservative = Math.round(rating * 0.3);
  const recent = state.priceHistory.slice(-6).map(p => p.price);
  const recentAvg = recent.length ? recent.reduce((s, p) => s + p, 0) / recent.length : currentPrice;
  const trend = currentPrice - recentAvg;
  const spread = futureHigh - futureLow;

  const inChargeZone = currentPrice <= CHARGE_ZONE;
  const inDischargeZone = currentPrice >= DISCHARGE_ZONE;
  const belowMid = currentPrice < dayMid;
  const aboveMid = currentPrice > dayMid;
  const nearDayLow = prices.length > 0 && currentPrice <= dayMin + (dayMax - dayMin) * 0.2;
  const nearDayHigh = prices.length > 0 && currentPrice >= dayMax - (dayMax - dayMin) * 0.2;

  // Strong charge signal: in the green zone on the chart
  if (inChargeZone && maxCharge > 0.1) {
    const mw = socPct < 30 ? Math.min(mwAggressive, maxCharge) : Math.min(mwModerate, maxCharge);
    return {
      action: 'charge',
      confidence: currentPrice <= 15 || nearDayLow ? 'high' : 'medium',
      headline: currentPrice < 0
        ? 'Negative price — charge aggressively, you get paid to buy.'
        : nearDayLow
          ? 'Price is near the day\'s low. Strong charge opportunity.'
          : 'Price is in the charge zone. Good time to fill the battery.',
      why: [
        `Current price: £${currentPrice.toFixed(2)}/MWh (charge zone is below £${CHARGE_ZONE}).`,
        `SoC is ${socPct.toFixed(0)}% — ${socPct < 30 ? 'low, charge more aggressively' : socPct > 70 ? 'already high, consider a smaller charge' : 'room to charge'}.`,
        future.length > 0 ? `Future high is £${futureHigh.toFixed(2)}, potential spread of £${(futureHigh - currentPrice).toFixed(2)}/MWh.` : 'No future prices visible yet.',
        trend < -3 ? 'Price is falling — could get even cheaper, but this level is already good.' : '',
      ].filter(Boolean),
      opportunityCost: socPct > 80
        ? 'Battery is nearly full. Charging uses remaining headroom — make sure this is the cheapest window.'
        : 'Filling now may block a cheaper period later, but waiting risks missing this price.',
      suggestedMw: mw,
    };
  }

  // Strong discharge signal: in the red zone on the chart
  if (inDischargeZone && maxDischarge > 0.1) {
    const mw = socPct > 70 ? Math.min(mwAggressive, maxDischarge) : Math.min(mwModerate, maxDischarge);
    return {
      action: 'discharge',
      confidence: currentPrice >= 120 || nearDayHigh ? 'high' : 'medium',
      headline: currentPrice >= 120
        ? 'Price spike — sell stored energy at a premium.'
        : nearDayHigh
          ? 'Price is near the day\'s high. Strong discharge opportunity.'
          : 'Price is in the discharge zone. Good time to sell.',
      why: [
        `Current price: £${currentPrice.toFixed(2)}/MWh (discharge zone is above £${DISCHARGE_ZONE}).`,
        `SoC is ${socPct.toFixed(0)}% — ${socPct > 70 ? 'plenty of stored energy' : socPct < 30 ? 'low on energy, discharge conservatively' : 'moderate energy available'}.`,
        future.length > 0 ? `Future low is £${futureLow.toFixed(2)}, so you could refill for £${(currentPrice - futureLow).toFixed(2)}/MWh less later.` : 'No future prices visible yet.',
        trend > 3 ? 'Price is rising — could go higher, but this level is already profitable.' : '',
      ].filter(Boolean),
      opportunityCost: socPct < 20
        ? 'Battery is nearly empty. Selling now leaves very little for a bigger spike.'
        : 'Selling now means less energy if an even higher spike comes later.',
      suggestedMw: mw,
    };
  }

  // Battery is full and price is high-ish — nudge toward discharge
  if (maxCharge < 0.1 && currentPrice >= CHARGE_ZONE) {
    if (maxDischarge > 0.1 && aboveMid) {
      return {
        action: 'discharge',
        confidence: 'low',
        headline: 'Battery is full. Consider selling into this above-average price.',
        why: [
          `Current price: £${currentPrice.toFixed(2)}/MWh, above the day midpoint of £${dayMid.toFixed(2)}.`,
          'Battery is at maximum SoC — you cannot charge, so waiting has limited upside.',
          'Discharging now frees headroom for a cheaper charge later.',
        ],
        opportunityCost: 'Price is not in the discharge zone yet. Selling here captures a smaller spread.',
        suggestedMw: Math.min(mwModerate, maxDischarge),
      };
    }
    return {
      action: 'wait',
      confidence: 'medium',
      headline: 'Battery is full but price is not high enough to sell.',
      why: [
        `Current price: £${currentPrice.toFixed(2)}/MWh — below the discharge zone (£${DISCHARGE_ZONE}).`,
        'No charging headroom. Wait for a higher price to discharge.',
      ],
      opportunityCost: 'You are stuck until the price rises or you discharge at a weaker level.',
      suggestedMw: 0,
    };
  }

  // Battery is empty and price is low-ish — nudge toward charge
  if (maxDischarge < 0.1 && currentPrice <= DISCHARGE_ZONE) {
    if (maxCharge > 0.1 && belowMid) {
      return {
        action: 'charge',
        confidence: 'low',
        headline: 'Battery is empty. Consider charging at this below-average price.',
        why: [
          `Current price: £${currentPrice.toFixed(2)}/MWh, below the day midpoint of £${dayMid.toFixed(2)}.`,
          'Battery is at minimum SoC — you cannot discharge, so waiting has limited upside.',
          'Charging now builds inventory for a more expensive period.',
        ],
        opportunityCost: 'Price is not in the charge zone yet. Buying here means a higher input cost.',
        suggestedMw: Math.min(mwModerate, maxCharge),
      };
    }
    return {
      action: 'wait',
      confidence: 'medium',
      headline: 'Battery is empty but price is not cheap enough to buy.',
      why: [
        `Current price: £${currentPrice.toFixed(2)}/MWh — above the charge zone (£${CHARGE_ZONE}).`,
        'No stored energy to sell. Wait for a cheaper price to charge.',
      ],
      opportunityCost: 'You are stuck until the price drops or you charge at a weaker level.',
      suggestedMw: 0,
    };
  }

  // Mid-range: lean toward charge if below midpoint, discharge if above
  if (belowMid && maxCharge > 0.1 && spread > 15) {
    return {
      action: 'charge',
      confidence: 'low',
      headline: 'Price is below average. A small charge could be worthwhile.',
      why: [
        `Current price: £${currentPrice.toFixed(2)}/MWh, below the day midpoint of £${dayMid.toFixed(2)}.`,
        `Day-ahead spread is £${spread.toFixed(2)}/MWh — ${spread > 40 ? 'wide enough for good arbitrage' : 'moderate'}.`,
        `SoC is ${socPct.toFixed(0)}% — ${socPct > 60 ? 'already fairly charged, so keep it small' : 'room to add energy'}.`,
        trend < -2 ? 'Price is trending down — a cheaper entry may come soon.' : '',
      ].filter(Boolean),
      opportunityCost: 'Not in the charge zone, so the entry cost is higher. Consider waiting for a cleaner signal.',
      suggestedMw: Math.min(mwConservative, maxCharge),
    };
  }

  if (aboveMid && maxDischarge > 0.1 && spread > 15) {
    return {
      action: 'discharge',
      confidence: 'low',
      headline: 'Price is above average. A small discharge could be worthwhile.',
      why: [
        `Current price: £${currentPrice.toFixed(2)}/MWh, above the day midpoint of £${dayMid.toFixed(2)}.`,
        `Day-ahead spread is £${spread.toFixed(2)}/MWh — ${spread > 40 ? 'wide enough for good arbitrage' : 'moderate'}.`,
        `SoC is ${socPct.toFixed(0)}% — ${socPct < 40 ? 'fairly low, keep it small' : 'enough to sell some'}.`,
        trend > 2 ? 'Price is trending up — it may go higher.' : '',
      ].filter(Boolean),
      opportunityCost: 'Not in the discharge zone, so the revenue is weaker. Consider waiting for a stronger spike.',
      suggestedMw: Math.min(mwConservative, maxDischarge),
    };
  }

  // True wait: price is mid-range, spread is narrow, or no clear direction
  return {
    action: 'wait',
    confidence: spread < 10 ? 'medium' : 'low',
    headline: spread < 10
      ? 'Narrow spread today. Patience is key — forced trades will lose money to efficiency.'
      : 'Price is mid-range. Wait for a clearer signal before acting.',
    why: [
      `Current price: £${currentPrice.toFixed(2)}/MWh (charge zone: <£${CHARGE_ZONE}, discharge zone: >£${DISCHARGE_ZONE}).`,
      `SoC is ${socPct.toFixed(0)}%.`,
      spread < 10
        ? `Day-ahead spread is only £${spread.toFixed(2)}/MWh — too thin for a confident arbitrage cycle.`
        : `Day-ahead spread is £${spread.toFixed(2)}/MWh. Better entry points likely exist.`,
      future.length === 0 ? 'No future forecast data yet — step forward to build a price picture.' : '',
    ].filter(Boolean),
    opportunityCost: 'Waiting preserves optionality. Trading a weak signal costs efficiency and degradation for little spread.',
    suggestedMw: 0,
  };
}
