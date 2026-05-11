import type { GameState, DayAheadBid, Trade, DayAheadState, BmDirection, BmOffer, BmState } from './types';
import { OrderSide, MarketType, GameMode } from './types';
import { createClock, tick, getGateClosureTime, getNextDeliveryDay, getSettlementPeriod } from './clock';
import { createPriceGenerator, generateNextHour } from './priceGenerator';
import type { PriceGeneratorState } from './priceGenerator';
import { createBattery, chargeBattery, dischargeBattery } from './battery';
import { generateGBDayAhead, generateSIPOutturn, generateNIV, generateFullAnalysis } from './ukMarket';
import type { TradePosition } from './ukMarket';
import { clearDayAheadAuction } from './market';
import { maybeGenerateEvent } from './events';
import { modeTickEffects } from './modes';
import type { BatteryConfig } from './battery';
import { getIntradayPrice } from './intradayPricing';

interface InternalState extends GameState {
  _priceGenState: PriceGeneratorState;
}

function createDayAheadState(currentTime: number, seed: number): DayAheadState {
  const isWeekday = new Date(currentTime).getUTCDay() > 0 && new Date(currentTime).getUTCDay() < 6;
  const windPct = 0.2 + Math.sin(seed * 0.1) * 0.15;
  const forecastPrices = generateGBDayAhead(seed, isWeekday, windPct);
  const sipOutturn = generateSIPOutturn(forecastPrices, seed + 1000);
  const niv = generateNIV(forecastPrices, sipOutturn, seed + 2000);

  return {
    bids: [],
    results: [],
    gateClosureTime: getGateClosureTime(currentTime),
    isAuctionOpen: true,
    nextDeliveryDay: getNextDeliveryDay(currentTime),
    forecastPrices,
    sipOutturn,
    niv,
    demandForecast: [],
    windForecast: [],
    solarForecast: [],
    demandOutturn: [],
    windOutturn: [],
    solarOutturn: [],
    revealedPeriods: 0,
    playerSchedule: [],
  };
}

function createBmState(): BmState {
  return { offers: [], accepted: [] };
}

export function createGameState(): GameState {
  const clock = createClock();
  const priceGen = createPriceGenerator();
  const { price: initialPrice, newState: newPriceGen } = generateNextHour(priceGen, clock.currentTime);

  const state: InternalState = {
    clock: { ...clock, speed: 'slow' },
    priceHistory: [initialPrice],
    currentPrice: initialPrice,
    battery: createBattery(),
    trades: [],
    events: [],
    mode: GameMode.ARBITRAGE,
    tutorial: { currentStep: 0, isActive: true, completed: false },
    dayAhead: createDayAheadState(clock.currentTime, priceGen.seed),
    bm: createBmState(),
    analysis: null,
    triadAlert: false,
    _priceGenState: newPriceGen,
  };

  return state;
}

export function tickGameState(state: GameState): GameState {
  const gs = state as InternalState;
  const newClock = tick(gs.clock);
  if (newClock.currentTime === gs.clock.currentTime) return gs;

  const priceGenState = gs._priceGenState ?? createPriceGenerator();
  const { price: syntheticPrice, newState: newPriceGen } = generateNextHour(priceGenState, newClock.currentTime);

  // Use real SIP outturn price when live data is available for this period
  const currentPeriod_ = getSettlementPeriod(newClock.currentTime) - 1;
  const liveSip = gs.dayAhead.sipOutturn[currentPeriod_];
  const hasLivePrice = liveSip !== undefined && liveSip !== 0;
  const newPrice = hasLivePrice
    ? { ...syntheticPrice, price: liveSip, basePrice: gs.dayAhead.forecastPrices[currentPeriod_] ?? syntheticPrice.basePrice }
    : syntheticPrice;

  const event = maybeGenerateEvent(newClock.currentTime, newPrice, newPriceGen.tickCount);
  const newEvents = event ? [event, ...gs.events].slice(0, 50) : gs.events;

  // Day-ahead transition logic
  const gateTime = getGateClosureTime(newClock.currentTime);
  let dayAhead = { ...gs.dayAhead };
  let bm = gs.bm ?? createBmState();
  const newTrades = [...gs.trades];
  let battery = gs.battery;
  let analysis = gs.analysis;

  // Reveal SIP outturn gradually (1 SP per tick for realism)
  if (dayAhead.revealedPeriods < 48) {
    dayAhead = { ...dayAhead, revealedPeriods: dayAhead.revealedPeriods + 1 };
  }

  // Clear DA auction at gate closure
  if (gs.dayAhead.isAuctionOpen && gs.dayAhead.gateClosureTime && newClock.currentTime >= gs.dayAhead.gateClosureTime) {
    if (gs.dayAhead.bids.length > 0) {
      const results = clearDayAheadAuction(gs.dayAhead.bids, gs.dayAhead.forecastPrices, newPriceGen.tickCount);

      dayAhead = { ...dayAhead, results, isAuctionOpen: false };
    } else {
      dayAhead = { ...dayAhead, isAuctionOpen: false };
    }
  }

  // Start new DA period: when gate closure changes OR when we cross midnight into a new day
  const currentDay = new Date(newClock.currentTime).getUTCDate();
  const prevDay = new Date(gs.clock.currentTime).getUTCDate();
  const dayChanged = currentDay !== prevDay;

  if (dayChanged || (newClock.currentTime >= gateTime && gateTime !== gs.dayAhead.gateClosureTime)) {
    dayAhead = {
      ...createDayAheadState(newClock.currentTime, priceGenState.seed + newPriceGen.tickCount),
      revealedPeriods: 0,
    };
    bm = createBmState();
  }

  const currentPeriod = getSettlementPeriod(newClock.currentTime) - 1;
  const deliveredSchedule = dayAhead.playerSchedule.map(position => {
    if (position.delivered || position.period !== currentPeriod) return position;

    const result = position.action === 'charge'
      ? chargeBattery(battery, position.mw, position.price, newClock.currentTime)
      : dischargeBattery(battery, position.mw, position.price, newClock.currentTime);

    if ('error' in result) return { ...position, delivered: true };

    battery = result.newState;
    newTrades.push({
      orderId: `${position.market}-${position.action}-${position.period}-${position.lockedAt}`,
      side: position.action === 'charge' ? OrderSide.BUY : OrderSide.SELL,
      volumeMw: result.entry.mw,
      price: position.price,
      timestamp: newClock.currentTime,
      marketType: position.market === 'da'
        ? MarketType.DAY_AHEAD
        : position.market === 'id'
          ? MarketType.INTRADAY
          : position.market === 'bm'
            ? MarketType.BM
            : MarketType.SPOT,
    });

    return { ...position, delivered: true };
  });
  dayAhead = { ...dayAhead, playerSchedule: deliveredSchedule };

  // Triad alert (Nov-Feb, 4-7pm weekday, cold/low wind)
  const d = new Date(newClock.currentTime);
  const month = d.getUTCMonth();
  const dow = d.getUTCDay();
  const hr = d.getUTCHours();
  const isTriadWindow = (month >= 10 || month <= 1) && dow > 0 && dow < 6 && hr >= 16 && hr <= 19;
  const triadAlert = isTriadWindow && newPrice.renewablePct < 0.2;

  // Mode-specific effects (frequency events, BOAs, triad warnings)
  const modeEffects = modeTickEffects(
    { ...gs, currentPrice: newPrice, battery },
    newPriceGen.tickCount,
  );

  // Apply mode events
  const allEvents = [...newEvents, ...modeEffects.events].slice(0, 60);

  // Apply frequency response availability payment to battery revenue
  if (modeEffects.availabilityPayment > 0) {
    battery = {
      ...battery,
      totalDischargeRevenue: battery.totalDischargeRevenue + modeEffects.availabilityPayment,
    };
  }

  // Regenerate analysis whenever we have revealed SPs
  if (dayAhead.revealedPeriods >= 4) {
    // Collect ALL player trades as TradePosition format for analysis
    const allPlayerTrades: TradePosition[] = [
      ...dayAhead.playerSchedule,
    ];

    // Add spot and intraday trades (map from Trade to TradePosition)
    for (const t of newTrades) {
      const sp = Math.floor((new Date(t.timestamp).getUTCHours() * 2) + (new Date(t.timestamp).getUTCMinutes() >= 30 ? 1 : 0));
      const marketMap: Record<string, 'spot' | 'da' | 'id' | 'bm'> = {
        [MarketType.SPOT]: 'spot',
        [MarketType.DAY_AHEAD]: 'da',
        [MarketType.INTRADAY]: 'id',
        [MarketType.BM]: 'bm',
      };
      allPlayerTrades.push({
        period: sp,
        market: marketMap[t.marketType] ?? 'spot',
        action: t.side === OrderSide.BUY ? 'charge' : 'discharge',
        mw: t.volumeMw,
        price: t.price,
        lockedAt: t.timestamp,
      });
    }

    analysis = generateFullAnalysis(
      allPlayerTrades,
      dayAhead.forecastPrices,
      dayAhead.sipOutturn,
      dayAhead.niv,
      battery.config.capacityMwh,
      battery.config.powerRatingMw,
      battery.config.efficiencyPct / 100,
      dayAhead.revealedPeriods,
    );
  }

  const priceHistory = [...gs.priceHistory, newPrice].slice(-168);

  return {
    clock: newClock,
    priceHistory,
    currentPrice: newPrice,
    battery,
    trades: newTrades,
    events: allEvents,
    mode: gs.mode,
    tutorial: gs.tutorial,
    dayAhead,
    bm,
    analysis,
    triadAlert: triadAlert || !!modeEffects.triadWarning,
    _priceGenState: newPriceGen,
  } as unknown as InternalState;
}

export function stepForwardAction(state: GameState): GameState {
  const gs = state as InternalState;
  // Use tickGameState but temporarily unpause
  const unpaused = { ...gs, clock: { ...gs.clock, isPaused: false } } as InternalState;
  const result = tickGameState(unpaused);
  // Re-apply the original pause state
  return { ...result, clock: { ...result.clock, isPaused: gs.clock.isPaused } };
}

export function chargeBatteryAction(state: GameState, mw: number): GameState {
  if (!state.currentPrice) return state;
  const result = chargeBattery(state.battery, mw, state.currentPrice.price, state.clock.currentTime);
  if ('error' in result) return state;

  const trade: Trade = {
    orderId: `spot-charge-${Date.now()}`,
    side: OrderSide.BUY,
    volumeMw: result.entry.mw,
    price: result.entry.price,
    timestamp: state.clock.currentTime,
    marketType: MarketType.SPOT,
  };

  return { ...state, battery: result.newState, trades: [...state.trades, trade] };
}

export function dischargeBatteryAction(state: GameState, mw: number): GameState {
  if (!state.currentPrice) return state;
  const result = dischargeBattery(state.battery, mw, state.currentPrice.price, state.clock.currentTime);
  if ('error' in result) return state;

  const trade: Trade = {
    orderId: `spot-discharge-${Date.now()}`,
    side: OrderSide.SELL,
    volumeMw: result.entry.mw,
    price: result.entry.price,
    timestamp: state.clock.currentTime,
    marketType: MarketType.SPOT,
  };

  return { ...state, battery: result.newState, trades: [...state.trades, trade] };
}

export function submitDayAheadBids(state: GameState, bids: DayAheadBid[]): GameState {
  const schedule: TradePosition[] = bids.map(b => ({
    period: b.period,
    market: 'da' as const,
    action: b.side === OrderSide.BUY ? 'charge' as const : 'discharge' as const,
    mw: b.volumeMw,
    price: b.price,
    lockedAt: state.clock.currentTime,
  }));

  return {
    ...state,
    dayAhead: {
      ...state.dayAhead,
      bids: [...state.dayAhead.bids, ...bids],
      playerSchedule: [...state.dayAhead.playerSchedule, ...schedule],
    },
  };
}

function getIntradayExecutionPrice(state: GameState, sp: number): number {
  return getIntradayPrice({
    forecastPrices: state.dayAhead.forecastPrices,
    sipOutturn: state.dayAhead.sipOutturn,
    revealedPeriods: state.dayAhead.revealedPeriods,
    currentPrice: state.currentPrice?.price ?? 50,
    period: sp,
  });
}

// Intraday trading: schedule charge/discharge at a specific SP's intraday price
export function intradayChargeAction(state: GameState, sp: number, mw: number): GameState {
  const price = getIntradayExecutionPrice(state, sp);
  const position: TradePosition = {
    period: sp,
    market: 'id',
    action: 'charge',
    mw,
    price,
    lockedAt: state.clock.currentTime,
  };

  return {
    ...state,
    dayAhead: {
      ...state.dayAhead,
      playerSchedule: [...state.dayAhead.playerSchedule, position],
    },
  };
}

export function intradayDischargeAction(state: GameState, sp: number, mw: number): GameState {
  const price = getIntradayExecutionPrice(state, sp);
  const position: TradePosition = {
    period: sp,
    market: 'id',
    action: 'discharge',
    mw,
    price,
    lockedAt: state.clock.currentTime,
  };

  return {
    ...state,
    dayAhead: {
      ...state.dayAhead,
      playerSchedule: [...state.dayAhead.playerSchedule, position],
    },
  };
}

function seededAcceptance(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function assessBmOffer(state: GameState, direction: BmDirection, period: number, price: number): { accepted: boolean; reason: string; acceptanceProbability: number; stackRank: number } {
  const forecast = state.dayAhead.forecastPrices[period] ?? state.currentPrice?.price ?? 50;
  const sip = period < state.dayAhead.revealedPeriods ? state.dayAhead.sipOutturn[period] : forecast;
  const reference = (forecast + sip) / 2;
  const premium = price - reference;
  const niv = state.dayAhead.niv[period] ?? 0;
  const systemNeedsDischarge = niv < -100;
  const systemNeedsCharge = niv > 100;
  const tightnessBoost = direction === 'offer' && systemNeedsDischarge ? 0.25 : direction === 'bid' && systemNeedsCharge ? 0.25 : 0;

  if (direction === 'offer') {
    if (state.battery.socPct < 20) {
      return { accepted: false, reason: 'Rejected: not enough stored energy for a discharge instruction.', acceptanceProbability: 0, stackRank: 99 };
    }
    const competitiveness = Math.max(0, Math.min(1, 1 - ((premium - 5) / 90)));
    const acceptanceProbability = Math.max(0.05, Math.min(0.95, competitiveness + tightnessBoost));
    const stackRank = Math.max(1, Math.min(40, Math.round((1 - acceptanceProbability) * 40)));
    const accepted = seededAcceptance(state.clock.currentTime + period + price) < acceptanceProbability;
    return {
      accepted,
      reason: accepted
        ? `Accepted: ranked ${stackRank}/40 in the simulated BM offer stack.`
        : `Skipped: ranked ${stackRank}/40. Price was not competitive enough for this system need.`,
      acceptanceProbability,
      stackRank,
    };
  }

  if (state.battery.socPct > 85) {
    return { accepted: false, reason: 'Rejected: not enough headroom to charge.', acceptanceProbability: 0, stackRank: 99 };
  }
  const discount = reference - price;
  const competitiveness = Math.max(0, Math.min(1, (discount + 10) / 80));
  const acceptanceProbability = Math.max(0.05, Math.min(0.95, competitiveness + tightnessBoost));
  const stackRank = Math.max(1, Math.min(40, Math.round((1 - acceptanceProbability) * 40)));
  const accepted = seededAcceptance(state.clock.currentTime + period + price + 17) < acceptanceProbability;
  return {
    accepted,
    reason: accepted
      ? `Accepted: ranked ${stackRank}/40 in the simulated BM bid stack.`
      : `Skipped: ranked ${stackRank}/40. Charge bid was not competitive enough.`,
    acceptanceProbability,
    stackRank,
  };
}

export function submitBmOfferAction(
  state: GameState,
  input: { period: number; direction: BmDirection; mw: number; price: number },
): GameState {
  const period = Math.max(0, Math.min(47, input.period));
  const mw = Math.max(0, Math.min(state.battery.config.powerRatingMw, input.mw));
  if (mw <= 0) return state;

  const assessment = assessBmOffer(state, input.direction, period, input.price);
  const offer: BmOffer = {
    id: `bm-${state.clock.currentTime}-${period}-${state.bm?.offers.length ?? 0}`,
    period,
    direction: input.direction,
    mw,
    price: input.price,
    accepted: assessment.accepted,
    submittedAt: state.clock.currentTime,
    reason: assessment.reason,
    acceptanceProbability: assessment.acceptanceProbability,
    stackRank: assessment.stackRank,
  };

  const acceptedPosition: TradePosition | null = assessment.accepted ? {
    period,
    market: 'bm',
    action: input.direction === 'bid' ? 'charge' : 'discharge',
    mw,
    price: input.price,
    lockedAt: state.clock.currentTime,
  } : null;

  return {
    ...state,
    bm: {
      offers: [offer, ...(state.bm?.offers ?? [])].slice(0, 30),
      accepted: assessment.accepted ? [offer, ...(state.bm?.accepted ?? [])].slice(0, 20) : (state.bm?.accepted ?? []),
    },
    dayAhead: {
      ...state.dayAhead,
      playerSchedule: acceptedPosition
        ? [...state.dayAhead.playerSchedule, acceptedPosition]
        : state.dayAhead.playerSchedule,
    },
  };
}

// Load a historical scenario
export function loadScenario(state: GameState, scenario: { daPrices: number[]; sipPrices: number[]; niv: number[]; date: string }): GameState {
  const startDate = new Date(scenario.date + 'T00:00:00Z');
  const clock = createClock(startDate);
  const firstSip = scenario.sipPrices[0] ?? 0;
  const initialPrice = firstSip !== 0 ? {
    timestamp: clock.currentTime,
    price: firstSip,
    demandMw: 30000,
    renewablePct: 0.25,
    basePrice: scenario.daPrices[0] ?? firstSip,
    eventImpact: 0,
  } : null;

  return {
    ...state,
    clock: { ...clock, speed: 'slow' },
    priceHistory: initialPrice ? [initialPrice] : [],
    currentPrice: initialPrice,
    battery: createBattery(state.battery.config),
    trades: [],
    events: [],
    bm: createBmState(),
    analysis: null,
    triadAlert: false,
    dayAhead: {
      ...state.dayAhead,
      bids: [],
      results: [],
      gateClosureTime: getGateClosureTime(clock.currentTime),
      isAuctionOpen: true,
      nextDeliveryDay: getNextDeliveryDay(clock.currentTime),
      forecastPrices: scenario.daPrices,
      sipOutturn: scenario.sipPrices,
      niv: scenario.niv,
      demandForecast: [],
      windForecast: [],
      solarForecast: [],
      demandOutturn: [],
      windOutturn: [],
      solarOutturn: [],
      revealedPeriods: 0,
      playerSchedule: [],
    },
  };
}

export function reconfigureBattery(state: GameState, config: Partial<BatteryConfig>): GameState {
  const newConfig = { ...state.battery.config, ...config };
  const capacityRatio = newConfig.capacityMwh / state.battery.config.capacityMwh;
  const newSocMwh = Math.min(state.battery.currentSocMwh * capacityRatio, newConfig.capacityMwh);

  return {
    ...state,
    battery: {
      ...state.battery,
      config: newConfig,
      currentSocMwh: newSocMwh,
      socPct: Math.round((newSocMwh / newConfig.capacityMwh) * 10000) / 100,
    },
  };
}
