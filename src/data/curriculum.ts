export type TrainingLevel = 'beginner' | 'trader' | 'quant';

export interface CurriculumModule {
  id: number;
  title: string;
  objective: string;
  beginnerSummary: string;
  traderSkill: string;
  futureFeatures: string[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

export const CURRICULUM: CurriculumModule[] = [
  {
    id: 1,
    title: 'Power Market Basics',
    objective: 'Understand MW, MWh, settlement periods, and why batteries earn from flexibility.',
    beginnerSummary: 'Learn the language before trading.',
    traderSkill: 'Translate a market screen into physical and financial exposure.',
    futureFeatures: ['Plain-English term mode', 'Concept cards', 'Beginner checks after each concept'],
  },
  {
    id: 2,
    title: 'Battery Physics',
    objective: 'Understand SoC, power, duration, efficiency, degradation, and headroom.',
    beginnerSummary: 'Know what the battery can and cannot do.',
    traderSkill: 'Avoid impossible schedules and preserve optionality.',
    futureFeatures: ['SoC forecast path', 'Degradation model', 'Constraint warnings'],
  },
  {
    id: 3,
    title: 'Arbitrage Training',
    objective: 'Charge relative lows and discharge relative highs after costs.',
    beginnerSummary: 'Buy low, sell high, but only when the spread is worth it.',
    traderSkill: 'Judge spread quality after efficiency and degradation.',
    futureFeatures: ['Mission scoring', 'Optimiser comparison', 'Wait-is-correct objectives'],
  },
  {
    id: 4,
    title: 'Day-Ahead Scheduling',
    objective: 'Build a 48-settlement-period plan before delivery.',
    beginnerSummary: 'Make a plan for tomorrow.',
    traderSkill: 'Commit a feasible schedule while managing forecast uncertainty.',
    futureFeatures: ['Drag-to-schedule', 'Schedule feasibility checks', 'Expected SoC chart'],
  },
  {
    id: 5,
    title: 'Intraday Re-Optimisation',
    objective: 'Revise the plan when new information changes price expectations.',
    beginnerSummary: 'Improve the plan as the day changes.',
    traderSkill: 'Adjust positions without overtrading.',
    futureFeatures: ['Forecast update cards', 'Bid-ask spread', 'Gate closure countdown'],
  },
  {
    id: 6,
    title: 'Imbalance, SIP, and NIV',
    objective: 'Understand promised vs delivered volume and settlement at SIP.',
    beginnerSummary: 'Learn what happens when reality differs from the plan.',
    traderSkill: 'Explain DA-to-SIP divergence and imbalance risk.',
    futureFeatures: ['Long/short system indicator', 'NIV chasing scenarios', 'Imbalance replay'],
  },
  {
    id: 7,
    title: 'Balancing Mechanism',
    objective: 'Learn bids, offers, BOAs, dispatch probability, and skip risk.',
    beginnerSummary: 'National Grid may pay you to move in real time.',
    traderSkill: 'Price BM optionality against wholesale opportunity cost.',
    futureFeatures: ['Bid/offer stack', 'BOA acceptance', 'Constraint/location scenarios'],
  },
  {
    id: 8,
    title: 'Ancillary Services',
    objective: 'Understand frequency response, reserve, availability, and obligations.',
    beginnerSummary: 'Sometimes you are paid to be ready, not to trade energy.',
    traderSkill: 'Compare availability revenue against lost arbitrage optionality.',
    futureFeatures: ['DC/DM/DR modules', 'Quick Reserve', 'Penalty model'],
  },
  {
    id: 9,
    title: 'Market Context',
    objective: 'Understand the different revenue streams available to a BESS asset.',
    beginnerSummary: 'Overview of BM, frequency response, and triad management.',
    traderSkill: 'Understand how capacity allocation works across competing services.',
    futureFeatures: ['Capacity allocation board', 'Revenue mix chart', 'Conflict warnings'],
  },
  {
    id: 10,
    title: 'Scenario Training',
    objective: 'Practise high wind, scarcity, flat days, outages, and forecast errors.',
    beginnerSummary: 'Learn what different trading days feel like.',
    traderSkill: 'Recognise market regimes quickly.',
    futureFeatures: ['Scenario exams', 'Bad-trader trap days', 'Replay timeline'],
  },
  {
    id: 11,
    title: 'Assessment Mode',
    objective: 'Trade without hints and receive a professional scorecard.',
    beginnerSummary: 'Test yourself after learning.',
    traderSkill: 'Perform under uncertainty with limited information.',
    futureFeatures: ['Timed exams', 'No-hint mode', 'Strength/weakness report'],
  },
  {
    id: 12,
    title: 'Real Market Data',
    objective: 'Load Elexon data and compare decisions against real outturn.',
    beginnerSummary: 'Practise on real historical days.',
    traderSkill: 'Connect simulator logic to GB market evidence.',
    futureFeatures: ['Weather overlays', 'Interconnector assumptions', 'BM volume examples'],
  },
  {
    id: 13,
    title: 'User Experience',
    objective: 'Keep training simple while allowing advanced sandbox exploration.',
    beginnerSummary: 'Show only what the learner needs now.',
    traderSkill: 'Move from guided learning to independent trading.',
    futureFeatures: ['Explain this screen', 'I am confused mode', 'Keyboard shortcuts'],
  },
  {
    id: 14,
    title: 'Quant Layer',
    objective: 'Compare forecasts, optimise dispatch, and backtest strategies.',
    beginnerSummary: 'Use data to improve decisions.',
    traderSkill: 'Evaluate models and strategy performance.',
    futureFeatures: ['Backtester', 'Monte Carlo paths', 'Forecast model comparison'],
  },
  {
    id: 15,
    title: 'Professional Workflow',
    objective: 'Bring everything together into a daily trader workflow.',
    beginnerSummary: 'Think like a desk analyst/trader.',
    traderSkill: 'Prepare, trade, monitor, explain, and review each day.',
    futureFeatures: ['Daily briefing', 'Blotter', 'End-of-day report'],
  },
];

export const LESSON_QUIZZES: Record<number, QuizQuestion[]> = {
  1: [
    {
      id: 'mw-mwh',
      prompt: 'If a 50 MW battery discharges for one half-hour settlement period, how much energy is delivered?',
      options: ['25 MWh', '50 MWh', '100 MWh'],
      answer: 0,
      explanation: 'MW is power. Energy is MW multiplied by time: 50 MW * 0.5 hours = 25 MWh.',
    },
    {
      id: 'headroom',
      prompt: 'Why might a cheap price still not be a valid charge opportunity?',
      options: ['The battery may be full', 'Cheap prices always mean discharge', 'SoC does not matter'],
      answer: 0,
      explanation: 'You need headroom to charge. A full battery cannot absorb more energy.',
    },
  ],
  2: [
    {
      id: 'da-delivery',
      prompt: 'When does a day-ahead schedule physically change the battery?',
      options: ['At delivery time', 'Immediately at auction submission', 'Only after the analysis tab opens'],
      answer: 0,
      explanation: 'Day-ahead creates a schedule. Physical delivery happens later in the relevant settlement period.',
    },
  ],
  4: [
    {
      id: 'imbalance',
      prompt: 'What is imbalance volume in this simulator?',
      options: ['Physical volume minus contracted volume', 'DA price minus ID price', 'Battery capacity minus power rating'],
      answer: 0,
      explanation: 'Imbalance is the difference between what happened physically and what was contracted financially.',
    },
  ],
};
