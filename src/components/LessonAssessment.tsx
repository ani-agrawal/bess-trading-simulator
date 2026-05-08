import { useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle, Circle, ClipboardCheck } from 'lucide-react';
import type { GameState } from '../engine/types';
import { assessLesson } from '../engine/lessonAssessment';
import type { AssessmentLessonId } from '../engine/lessonAssessment';

interface Props {
  state: GameState;
  lessonId: AssessmentLessonId;
}

const READINESS_LABEL = {
  'not-started': 'Not started',
  practising: 'Practising',
  ready: 'Ready',
};

export default function LessonAssessment({ state, lessonId }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const assessment = assessLesson(state, lessonId);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const popWidth = 340;
    let left = rect.right - popWidth;
    if (left < 8) left = 8;
    if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - popWidth - 8;
    setPos({ top: rect.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handleClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', updatePos);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  const color = assessment.readiness === 'ready' ? 'var(--green)' : assessment.readiness === 'practising' ? 'var(--yellow)' : undefined;

  return (
    <>
      <button
        ref={btnRef}
        className={`btn btn-icon-badge ${open ? 'active' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title="Lesson Check"
      >
        <ClipboardCheck size={16} style={color ? { color } : undefined} />
        <span className="icon-badge-count">{assessment.passed}/{assessment.total}</span>
      </button>
      {open && (
        <div className="header-popover" ref={popRef} style={{ top: pos.top, left: pos.left }}>
          <div className="panel-header">
            <h3><ClipboardCheck size={15} /> Lesson Check</h3>
            <span>{READINESS_LABEL[assessment.readiness]}</span>
          </div>
          <div className="assessment-readiness">
            <strong>{READINESS_LABEL[assessment.readiness]}</strong>
            <small>{assessment.nextAction}</small>
          </div>
          <div className="assessment-list">
            {assessment.items.map(item => (
              <div key={item.label} className={`assessment-item ${item.passed ? 'passed' : ''}`}>
                {item.passed ? <CheckCircle size={14} /> : <Circle size={14} />}
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.evidence}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
