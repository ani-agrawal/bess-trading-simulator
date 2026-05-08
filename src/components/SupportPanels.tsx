import { useState } from 'react';
import type { GameState } from '../engine/types';
import type { LessonId } from './TrainingLesson';
import RegimeComparison from './RegimeComparison';
import WorkflowChecklist from './WorkflowChecklist';
import PeriodHeatmap from './PeriodHeatmap';
import ForwardExposure from './ForwardExposure';
import CommitmentWarnings from './CommitmentWarnings';
import CapacityAllocationBoard from './CapacityAllocationBoard';
import BenchmarkComparison from './BenchmarkComparison';
import RevenueAttribution from './RevenueAttribution';
import MistakePatterns from './MistakePatterns';
import Gradebook from './Gradebook';
import TradeJournal from './TradeJournal';
import BacktestSummary from './BacktestSummary';
import ModelComparison from './ModelComparison';
import FrequencyResponsePanel from './FrequencyResponsePanel';
import ProgressPersistence from './ProgressPersistence';
import ScenarioExamSelector from './ScenarioExamSelector';
import ProductStatus from './ProductStatus';

type SupportTab = 'coach' | 'risk' | 'review' | 'advanced';
type TrainingLevel = 'beginner' | 'trader' | 'quant';

interface Props {
  state: GameState;
  lessonId: LessonId;
  assessmentMode?: boolean;
  level?: TrainingLevel;
  compact?: boolean;
}

const TABS: { id: SupportTab; label: string }[] = [
  { id: 'coach', label: 'Coach' },
  { id: 'risk', label: 'Risk' },
  { id: 'review', label: 'Review' },
  { id: 'advanced', label: 'Advanced' },
];

export default function SupportPanels({
  state,
  lessonId,
  assessmentMode = false,
  level = 'trader',
  compact = false,
}: Props) {
  const [active, setActive] = useState<SupportTab>(level === 'quant' ? 'advanced' : 'coach');
  const beginner = level === 'beginner';
  const quant = level === 'quant';
  const showAdvanced = quant || !beginner || lessonId >= 4;

  return (
    <div className={`support-tabs-wrap ${compact ? 'compact' : ''}`}>
      <div className="support-tabs">
        {TABS.map(tab => {
          const locked = tab.id === 'advanced' && !showAdvanced;
          return (
            <button
              key={tab.id}
              className={`support-tab ${active === tab.id ? 'active' : ''}`}
              onClick={() => !locked && setActive(tab.id)}
              disabled={locked}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="support-panel-grid">
        {active === 'coach' && (
          <>
            <RegimeComparison state={state} />
            <WorkflowChecklist state={state} />
          </>
        )}

        {active === 'risk' && (
          <>
            {lessonId >= 2 && <PeriodHeatmap state={state} />}
            {lessonId >= 2 && <ForwardExposure state={state} />}
            {lessonId >= 2 && <CommitmentWarnings state={state} />}
            {(lessonId === 5 || quant) && <CapacityAllocationBoard state={state} />}
          </>
        )}

        {active === 'review' && (
          <>
            <BenchmarkComparison state={state} />
            <MistakePatterns state={state} />
            <Gradebook state={state} />
            <ProgressPersistence state={state} />
            <ScenarioExamSelector />
            {!assessmentMode && <TradeJournal state={state} />}
          </>
        )}

        {active === 'advanced' && showAdvanced && (
          <>
            <RevenueAttribution state={state} />
            <FrequencyResponsePanel state={state} />
            {lessonId >= 2 && <CapacityAllocationBoard state={state} />}
            {lessonId >= 2 && <ForwardExposure state={state} />}
            <BenchmarkComparison state={state} />
            <ModelComparison state={state} />
            <BacktestSummary />
            <ProductStatus />
          </>
        )}
      </div>
    </div>
  );
}
