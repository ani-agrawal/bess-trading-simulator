import { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';
import { GLOSSARY } from '../engine/types';
import type { LessonId } from './TrainingLesson';

interface Props {
  lessonId: LessonId;
  compact?: boolean;
}

const TERMS_BY_LESSON: Record<LessonId, string[]> = {
  1: ['BESS', 'SoC', 'Power Rating (MW)', 'Capacity (MWh)', 'Arbitrage', 'Spread'],
  2: ['Day-Ahead (DA)', 'Settlement Period (SP)', 'Gate Closure', 'Forecast vs Outturn', 'EPEX SPOT'],
  3: ['Intraday (ID)', 'Within-Day Optimisation', 'Forecast vs Outturn', 'Gate Closure', 'Spread'],
  4: ['SIP', 'NIV', 'System Price', 'NIV Chasing', 'Forecast vs Outturn'],
  5: ['Balancing Mechanism (BM)', 'BOA', 'Frequency Response', 'DC/DM/DR', 'Revenue Stacking'],
};

export default function ExplainThisScreen({ lessonId }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const terms = TERMS_BY_LESSON[lessonId];

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

  return (
    <>
      <button
        ref={btnRef}
        className={`btn btn-icon-badge ${open ? 'active' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title="Key Terms"
      >
        <HelpCircle size={16} />
      </button>
      {open && (
        <div className="header-popover" ref={popRef} style={{ top: pos.top, left: pos.left }}>
          <div className="panel-header">
            <h3><HelpCircle size={15} /> Key Terms</h3>
          </div>
          <div className="explain-list">
            {terms.map(term => (
              <div key={term} className="explain-term">
                <strong>{term}</strong>
                <span>{GLOSSARY[term]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
