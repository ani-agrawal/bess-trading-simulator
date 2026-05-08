import { useState } from 'react';
import type { AppView } from './engine/types';
import { getSettlementPeriod } from './engine/clock';
import { useGameState } from './hooks/useGameState';
import MarketClock from './components/MarketClock';
import NewsFeed from './components/NewsFeed';
import DayAheadAuction from './components/DayAheadAuction';
import IntradayTrading from './components/IntradayTrading';
import PostTradeAnalysis from './components/PostTradeAnalysis';
import Glossary from './components/Glossary';
import StrategyGuide from './components/StrategyGuide';
import ScenarioSelector from './components/ScenarioSelector';
import SaveManager from './components/SaveManager';
import ThemeToggle from './components/ThemeToggle';
import Tutorial from './components/Tutorial';
import { Battery, AlertTriangle } from 'lucide-react';
import TrainingLesson from './components/TrainingLesson';
import type { LessonId } from './components/TrainingLesson';
import PositionBook from './components/PositionBook';
import ReplayTimeline from './components/ReplayTimeline';
import PostTradeExplainer from './components/PostTradeExplainer';
import DailyBriefing from './components/DailyBriefing';
import CommitmentWarnings from './components/CommitmentWarnings';
import EndOfDayReport from './components/EndOfDayReport';
import ForecastReview from './components/ForecastReview';
import ScenarioObjective from './components/ScenarioObjective';
import WorkflowChecklist from './components/WorkflowChecklist';
import RiskLimits from './components/RiskLimits';
import DecisionCoach from './components/DecisionCoach';
import RegimeComparison from './components/RegimeComparison';
import SupportPanels from './components/SupportPanels';
import TradingCockpit from './components/TradingCockpit';
import StartScreen from './components/StartScreen';
import AboutProject from './components/AboutProject';
import TradeExplainer from './components/TradeExplainer';

export default function App() {
  const {
    state, dataSource, togglePause, setSpeed, stepForward,
    chargeBattery, dischargeBattery, placeDayAheadBids, configureBattery,
    intradayCharge, intradayDischarge, submitBmOffer, playScenario,
    advanceTutorial, skipTutorial, setMode, loadSavedState, reset,
  } = useGameState();
  const [view, setView] = useState<AppView>('spot');
  const [appMode, setAppMode] = useState<'start' | 'training' | 'sandbox'>('start');
  const [lessonId, setLessonId] = useState<LessonId>(1);

  const currentSp = getSettlementPeriod(state.clock.currentTime);
  const currentHour = new Date(state.clock.currentTime).getUTCHours();

  if (appMode === 'start') {
    return (
      <StartScreen
        onStartTraining={() => setAppMode('training')}
        onOpenSandbox={() => setAppMode('sandbox')}
      />
    );
  }

  if (appMode === 'training') {
    return (
      <TrainingLesson
        lessonId={lessonId}
        state={state}
        dataSource={dataSource}
        onSelectLesson={setLessonId}
        onOpenSandbox={() => setAppMode('sandbox')}
        onTogglePause={togglePause}
        onSetSpeed={setSpeed}
        onStepForward={stepForward}
        onReset={reset}
        onCharge={chargeBattery}
        onDischarge={dischargeBattery}
        onSubmitBids={placeDayAheadBids}
        onConfigureBattery={configureBattery}
        onIntradayCharge={intradayCharge}
        onIntradayDischarge={intradayDischarge}
        onSubmitBmOffer={submitBmOffer}
        onSetMode={setMode}
        onPlayScenario={playScenario}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <Battery size={24} className="logo-icon" />
          <h1>BESS Trading Simulator</h1>
          <span className="mode-badge">{state.mode.replace(/_/g, ' ')}</span>
          <span className="sp-badge">SP{currentSp}</span>
          <span className={`data-badge ${dataSource}`}>
            {dataSource === 'live' ? 'LIVE DATA' : dataSource === 'loading' ? 'LOADING...' : 'SYNTHETIC'}
          </span>
          {state.triadAlert && (
            <span className="triad-alert"><AlertTriangle size={14} /> TRIAD WARNING</span>
          )}
        </div>
        <div className="header-center">
          <MarketClock
            currentTime={state.clock.currentTime}
            isPaused={state.clock.isPaused}
            speed={state.clock.speed}
            onTogglePause={togglePause}
            onSetSpeed={setSpeed}
            onStepForward={stepForward}
            onReset={reset}
          />
        </div>
        <div className="header-right">
          <button className="btn" onClick={() => setAppMode('start')}>
            Start
          </button>
          <button className="btn btn-buy" onClick={() => setAppMode('training')}>
            Training
          </button>
          <SaveManager state={state} dataSource={dataSource} onLoad={loadSavedState} />
          <ScenarioSelector onSelectScenario={playScenario} />
          <StrategyGuide currentMode={state.mode} onSelectMode={setMode} />
          <Glossary />
          <AboutProject />
          <ThemeToggle />
        </div>
      </header>

      <nav className="tab-bar" data-tutorial="dayahead-tab">
        <button className={`tab ${view === 'spot' ? 'active' : ''}`} onClick={() => setView('spot')}>
          Spot Trading
        </button>
        <button className={`tab ${view === 'dayahead' ? 'active' : ''}`} onClick={() => setView('dayahead')} id="dayahead-tab">
          Day-Ahead
        </button>
        <button className={`tab ${view === 'intraday' ? 'active' : ''}`} onClick={() => setView('intraday' as AppView)}>
          Intraday
        </button>
        <button className={`tab ${view === 'analysis' ? 'active' : ''}`} onClick={() => setView('analysis')} id="analysis-tab" data-tutorial="analysis-tab">
          Analysis
          {state.analysis && <span className="tab-badge">{state.analysis.grade}</span>}
        </button>
      </nav>

      <main className="dashboard-bess">
        {view === 'spot' && (
          <>
            <div className="grid-price">
              <TradingCockpit
                state={state}
                onCharge={chargeBattery}
                onDischarge={dischargeBattery}
                onConfigureBattery={configureBattery}
              />
              <TradeExplainer battery={state.battery} currentPrice={state.currentPrice} priceHistory={state.priceHistory} />
              <SupportPanels state={state} lessonId={1} showExplain compact />
            </div>
            <div className="grid-revenue">
              <DecisionCoach state={state} />
              <NewsFeed events={state.events} />
              <DailyBriefing state={state} />
              <RiskLimits state={state} />
              <ScenarioObjective state={state} />
            </div>
            <div className="grid-log">
              <div className="panel">
                <div className="panel-header"><h3>Activity Log</h3></div>
                {state.battery.cycleLog.length === 0 ? (
                  <div className="empty-state">No activity yet. Charge or discharge to see history.</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr><th>Action</th><th>MW</th><th>Price</th><th>Energy</th><th>Cost/Rev</th></tr>
                    </thead>
                    <tbody>
                      {state.battery.cycleLog.slice(0, 12).map((e, i) => (
                        <tr key={i}>
                          <td className={e.action === 'charge' ? 'buy-text' : 'sell-text'}>
                            {e.action === 'charge' ? 'CHARGE' : 'DISCHARGE'}
                          </td>
                          <td>{e.mw.toFixed(0)} MW</td>
                          <td>£{e.price.toFixed(2)}</td>
                          <td>{e.energyMwh.toFixed(1)} MWh</td>
                          <td className={e.cost >= 0 ? 'positive' : 'negative'}>
                            {e.cost >= 0 ? '+' : ''}£{e.cost.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {view === 'dayahead' && (
          <>
            <div className="grid-da-main">
              <DayAheadAuction
                dayAhead={state.dayAhead}
                currentTime={state.clock.currentTime}
                battery={state.battery}
                onSubmitBids={placeDayAheadBids}
              />
              <SupportPanels state={state} lessonId={2} showExplain compact />
            </div>
            <div className="grid-da-side">
              <DecisionCoach state={state} />
              <NewsFeed events={state.events} />
              <DailyBriefing state={state} />
              <RegimeComparison state={state} />
              <WorkflowChecklist state={state} />
              <RiskLimits state={state} />
              <ScenarioObjective state={state} />
            </div>
          </>
        )}

        {view === ('intraday' as AppView) && (
          <>
            <div className="grid-da-main">
              <IntradayTrading
                dayAhead={state.dayAhead}
                battery={state.battery}
                currentPrice={state.currentPrice?.price ?? 0}
                currentHour={currentHour}
                onIntradayCharge={intradayCharge}
                onIntradayDischarge={intradayDischarge}
              />
              <SupportPanels state={state} lessonId={3} showExplain compact />
            </div>
            <div className="grid-da-side">
              <DecisionCoach state={state} />
              <NewsFeed events={state.events} />
              <DailyBriefing state={state} />
              <RegimeComparison state={state} />
              <WorkflowChecklist state={state} />
              <RiskLimits state={state} />
              <ScenarioObjective state={state} />
            </div>
          </>
        )}

        {view === 'analysis' && (
          <>
            <div className="grid-analysis-main">
              <PostTradeExplainer state={state} />
              <ForecastReview state={state} />
              <EndOfDayReport state={state} />
              <PositionBook state={state} />
              <ReplayTimeline state={state} />
              <PostTradeAnalysis
                dayAhead={state.dayAhead}
                analysis={state.analysis}
              />
              <SupportPanels state={state} lessonId={4} showExplain compact />
            </div>
            <div className="grid-analysis-side">
              <DecisionCoach state={state} />
              <NewsFeed events={state.events} />
              <DailyBriefing state={state} />
              <RegimeComparison state={state} />
              <WorkflowChecklist state={state} />
              <CommitmentWarnings state={state} />
              <RiskLimits state={state} />
              <ScenarioObjective state={state} />
            </div>
          </>
        )}
      </main>

      <Tutorial
        currentStep={state.tutorial.currentStep}
        isActive={state.tutorial.isActive}
        onNext={advanceTutorial}
        onSkip={skipTutorial}
      />
    </div>
  );
}
