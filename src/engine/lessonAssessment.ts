import type { GameState } from './types';
import { getRevenueSummary } from './battery';

export type AssessmentLessonId = 1 | 2 | 3 | 4 | 5;

export interface AssessmentItem {
  label: string;
  passed: boolean;
  evidence: string;
}

export interface LessonAssessment {
  readiness: 'not-started' | 'practising' | 'ready';
  passed: number;
  total: number;
  items: AssessmentItem[];
  nextAction: string;
}

function hasPhysicalTrade(state: GameState, action?: 'charge' | 'discharge'): boolean {
  return state.battery.cycleLog.some(entry => !action || entry.action === action);
}

export function assessLesson(state: GameState, lessonId: AssessmentLessonId): LessonAssessment {
  const summary = getRevenueSummary(state.battery);
  const da = state.dayAhead.playerSchedule.filter(position => position.market === 'da');
  const id = state.dayAhead.playerSchedule.filter(position => position.market === 'id');
  const bm = state.dayAhead.playerSchedule.filter(position => position.market === 'bm');
  const spread = summary.avgDischargePrice - summary.avgChargePrice;

  const common: AssessmentItem[] = [
    {
      label: 'Battery constraints understood',
      passed: state.battery.socPct >= 5 && state.battery.socPct <= 95,
      evidence: `SoC is ${state.battery.socPct.toFixed(0)}%.`,
    },
  ];

  const byLesson: Record<AssessmentLessonId, AssessmentItem[]> = {
    1: [
      {
        label: 'Made a deliberate dispatch decision',
        passed: state.battery.cycleLog.length > 0,
        evidence: `${state.battery.cycleLog.length} physical action(s).`,
      },
      {
        label: 'Can explain charge vs discharge',
        passed: hasPhysicalTrade(state, 'charge') || hasPhysicalTrade(state, 'discharge'),
        evidence: hasPhysicalTrade(state, 'charge') ? 'Used charge.' : hasPhysicalTrade(state, 'discharge') ? 'Used discharge.' : 'No action yet.',
      },
      {
        label: 'Knows spread matters',
        passed: hasPhysicalTrade(state, 'charge') && hasPhysicalTrade(state, 'discharge') && spread > 0,
        evidence: !hasPhysicalTrade(state, 'charge') || !hasPhysicalTrade(state, 'discharge') ? 'Need both charge and discharge to calculate spread.' : `Realised spread is £${spread.toFixed(2)}/MWh.`,
      },
      ...common,
    ],
    2: [
      {
        label: 'Submitted a 48-period day-ahead plan',
        passed: da.length > 0,
        evidence: `${da.length} DA position(s).`,
      },
      {
        label: 'Included charge and discharge legs',
        passed: da.some(position => position.action === 'charge') && da.some(position => position.action === 'discharge'),
        evidence: `${da.filter(position => position.action === 'charge').length} charge, ${da.filter(position => position.action === 'discharge').length} discharge.`,
      },
      {
        label: 'Understands delivery timing',
        passed: da.some(position => position.delivered) || state.battery.cycleLog.length > 0,
        evidence: da.some(position => position.delivered) ? 'At least one scheduled SP delivered.' : 'No scheduled delivery yet.',
      },
      ...common,
    ],
    3: [
      {
        label: 'Used intraday to revise the book',
        passed: id.length > 0,
        evidence: `${id.length} ID position(s).`,
      },
      {
        label: 'Traded a future settlement period',
        passed: id.some(position => position.period >= state.dayAhead.revealedPeriods),
        evidence: id.length > 0 ? 'ID position is in the schedule.' : 'No ID revision yet.',
      },
      {
        label: 'Checked the position book',
        passed: state.dayAhead.playerSchedule.length > 0,
        evidence: `${state.dayAhead.playerSchedule.length} total scheduled position(s).`,
      },
      ...common,
    ],
    4: [
      {
        label: 'Opened post-trade analysis',
        passed: Boolean(state.analysis),
        evidence: state.analysis ? `Analysis grade ${state.analysis.grade}.` : 'No analysis yet.',
      },
      {
        label: 'Can read SIP/NIV outturn',
        passed: Boolean(state.analysis?.periods.some(period => Math.abs(period.nivValue) > 100)),
        evidence: state.analysis ? `${state.analysis.periods.length} settled period(s) analysed.` : 'Step forward to reveal outturn.',
      },
      {
        label: 'Identified missed value',
        passed: Boolean(state.analysis?.worstTrade || state.analysis?.bestTrade),
        evidence: state.analysis?.worstTrade ? `Worst period: SP${state.analysis.worstTrade.period + 1}.` : 'No best/worst trade yet.',
      },
      ...common,
    ],
    5: [
      {
        label: 'Explored a different strategy mode',
        passed: state.mode !== 'arbitrage',
        evidence: `Current mode: ${state.mode.replace(/_/g, ' ')}.`,
      },
      {
        label: 'Submitted BM bid/offer',
        passed: (state.bm?.offers.length ?? 0) > 0,
        evidence: `${state.bm?.offers.length ?? 0} BM price(s) submitted.`,
      },
      {
        label: 'Understands accepted instructions become positions',
        passed: bm.length > 0 || (state.bm?.offers.length ?? 0) > 0,
        evidence: bm.length > 0 ? `${bm.length} accepted BM position(s).` : 'No accepted BM instruction yet.',
      },
      ...common,
    ],
  };

  const items = byLesson[lessonId];
  const passed = items.filter(item => item.passed).length;
  const total = items.length;
  const readiness = passed === 0 ? 'not-started' : passed === total ? 'ready' : 'practising';
  const nextFailed = items.find(item => !item.passed);

  return {
    readiness,
    passed,
    total,
    items,
    nextAction: nextFailed ? nextFailed.label : 'Move to the next lesson or practise the same scenario without hints.',
  };
}
