// Elexon BMRS API integration for real GB market data
// Public API, no key required. Data has ~1-2 day lag for system prices.

const BASE = 'https://data.elexon.co.uk/bmrs/api/v1';

export interface ElexonSystemPrice {
  settlementDate: string;
  settlementPeriod: number;
  systemSellPrice: number;
  systemBuyPrice: number;
  netImbalanceVolume: number;
}

export interface ElexonMID {
  settlementDate: string;
  settlementPeriod: number;
  price: number;
  volume: number;
  dataProvider: string;
}

export interface ElexonDayData {
  date: string;
  daPrices: number[];      // 48 SPs, £/MWh (from MID/APXMIDP)
  sipPrices: number[];     // 48 SPs, system price
  niv: number[];           // 48 SPs, net imbalance volume
  demandForecast: number[];  // 48 SPs, MW (national demand forecast)
  windForecast: number[];    // 48 SPs, MW (wind generation forecast)
  solarForecast: number[];   // 48 SPs, MW (solar generation forecast)
  demandOutturn: number[];   // 48 SPs, MW (actual demand outturn)
  windOutturn: number[];     // 48 SPs, MW (actual wind generation)
  solarOutturn: number[];    // 48 SPs, MW (actual solar generation)
  isComplete: boolean;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function fetchJson(url: string): Promise<{ data?: unknown[] }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Elexon API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

// Fetch system prices (SIP + NIV) for a given date
// Uses the path-style endpoint: /balancing/settlement/system-prices/{date}
async function fetchSystemPrices(date: string): Promise<ElexonSystemPrice[]> {
  const url = `${BASE}/balancing/settlement/system-prices/${date}?format=json`;
  const data = await fetchJson(url);
  return (data.data ?? []) as ElexonSystemPrice[];
}

// Fetch Market Index Data (day-ahead reference prices) for a given date
async function fetchMID(date: string): Promise<ElexonMID[]> {
  const nextDay = new Date(date + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const url = `${BASE}/datasets/MID?from=${date}T00:00:00Z&to=${formatDate(nextDay)}T00:00:00Z&format=json`;
  const data = await fetchJson(url);
  return (data.data ?? []) as ElexonMID[];
}

async function fetchDemandForecast(date: string): Promise<{ settlementPeriod: number; nationalDemand: number }[]> {
  const nextDay = new Date(date + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const url = `${BASE}/forecast/demand/day-ahead/latest?from=${date}T00:00:00Z&to=${formatDate(nextDay)}T00:00:00Z&format=json`;
  const data = await fetchJson(url);
  return (data.data ?? []) as { settlementPeriod: number; nationalDemand: number }[];
}

async function fetchWindSolarForecast(date: string): Promise<{ settlementPeriod: number; businessType: string; quantity: number }[]> {
  const nextDay = new Date(date + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const url = `${BASE}/forecast/generation/wind-and-solar/day-ahead?from=${date}&to=${formatDate(nextDay)}&processType=day%20ahead&format=json`;
  const data = await fetchJson(url);
  return (data.data ?? []) as { settlementPeriod: number; businessType: string; quantity: number }[];
}

async function fetchDemandOutturn(date: string): Promise<{ settlementPeriod: number; initialDemandOutturn: number }[]> {
  const url = `${BASE}/demand/outturn?settlementDateFrom=${date}&settlementDateTo=${date}&format=json`;
  const data = await fetchJson(url);
  const all = (data.data ?? []) as { settlementDate: string; settlementPeriod: number; initialDemandOutturn: number }[];
  return all.filter(d => d.settlementDate === date);
}

interface GenActualRecord {
  settlementPeriod: number;
  data: { psrType: string; quantity: number }[];
}

async function fetchActualGeneration(date: string): Promise<GenActualRecord[]> {
  const nextDay = new Date(date + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const url = `${BASE}/generation/actual/per-type?from=${date}T00:00:00Z&to=${formatDate(nextDay)}T00:00:00Z&format=json`;
  const data = await fetchJson(url);
  return (data.data ?? []) as GenActualRecord[];
}

// Build a complete day's data from Elexon APIs
export async function fetchDayData(date: string): Promise<ElexonDayData> {
  const [sysPrices, midData, demandData, genData, demandActual, genActual] = await Promise.all([
    fetchSystemPrices(date).catch(() => []),
    fetchMID(date).catch(() => []),
    fetchDemandForecast(date).catch(() => []),
    fetchWindSolarForecast(date).catch(() => []),
    fetchDemandOutturn(date).catch(() => []),
    fetchActualGeneration(date).catch(() => []),
  ]);

  // Extract DA prices from APXMIDP provider
  const apxPrices = midData.filter(d => d.dataProvider === 'APXMIDP');
  const daPrices = new Array(48).fill(0);
  for (const d of apxPrices) {
    const sp = d.settlementPeriod - 1; // 0-indexed
    if (sp >= 0 && sp < 48) daPrices[sp] = d.price;
  }

  // Extract system prices and NIV
  const sipPrices = new Array(48).fill(0);
  const niv = new Array(48).fill(0);
  for (const d of sysPrices) {
    const sp = d.settlementPeriod - 1;
    if (sp >= 0 && sp < 48) {
      // Use systemBuyPrice as the imbalance price (SBP ≈ SIP for short system)
      sipPrices[sp] = d.systemBuyPrice ?? d.systemSellPrice ?? 0;
      niv[sp] = Math.round(d.netImbalanceVolume ?? 0);
    }
  }

  // If DA prices are missing, use system prices as fallback
  const hasDa = daPrices.some(p => p !== 0);
  if (!hasDa) {
    for (let i = 0; i < 48; i++) {
      daPrices[i] = sipPrices[i];
    }
  }

  // Extract demand forecast
  const demandForecast = new Array(48).fill(0);
  for (const d of demandData) {
    const sp = d.settlementPeriod - 1;
    if (sp >= 0 && sp < 48) demandForecast[sp] = Math.round(d.nationalDemand ?? 0);
  }

  // Extract wind and solar forecasts
  const windForecast = new Array(48).fill(0);
  const solarForecast = new Array(48).fill(0);
  for (const d of genData) {
    const sp = d.settlementPeriod - 1;
    if (sp >= 0 && sp < 48) {
      const bt = (d.businessType ?? '').toLowerCase();
      if (bt.includes('wind')) {
        windForecast[sp] += Math.round(d.quantity ?? 0);
      } else if (bt.includes('solar')) {
        solarForecast[sp] = Math.round(d.quantity ?? 0);
      }
    }
  }

  // Extract actual demand outturn
  const demandOutturn = new Array(48).fill(0);
  for (const d of demandActual) {
    const sp = d.settlementPeriod - 1;
    if (sp >= 0 && sp < 48) demandOutturn[sp] = Math.round(d.initialDemandOutturn ?? 0);
  }

  // Extract actual wind and solar generation (nested data structure)
  const windOutturn = new Array(48).fill(0);
  const solarOutturn = new Array(48).fill(0);
  for (const record of genActual) {
    const sp = record.settlementPeriod - 1;
    if (sp >= 0 && sp < 48 && record.data) {
      for (const item of record.data) {
        const psr = (item.psrType ?? '').toLowerCase();
        if (psr.includes('wind')) {
          windOutturn[sp] += Math.round(item.quantity ?? 0);
        } else if (psr.includes('solar')) {
          solarOutturn[sp] = Math.round(item.quantity ?? 0);
        }
      }
    }
  }

  const isComplete = sysPrices.length >= 46; // allow for DST days

  return { date, daPrices, sipPrices, niv, demandForecast, windForecast, solarForecast, demandOutturn, windOutturn, solarOutturn, isComplete };
}

// Fetch the most recent complete settlement day (typically D-2 for safety)
export async function fetchLatestDay(): Promise<ElexonDayData> {
  const today = new Date();
  // Try D-2 first (most reliable for complete data), then D-3 as fallback
  for (const lag of [2, 3, 4, 5]) {
    const target = new Date(today);
    target.setUTCDate(target.getUTCDate() - lag);
    const dateStr = formatDate(target);

    try {
      const data = await fetchDayData(dateStr);
      if (data.isComplete) return data;
    } catch {
      continue;
    }
  }

  throw new Error('Could not fetch recent Elexon data');
}

// Fetch a specific historical date
export async function fetchHistoricalDay(date: string): Promise<ElexonDayData> {
  return fetchDayData(date);
}
