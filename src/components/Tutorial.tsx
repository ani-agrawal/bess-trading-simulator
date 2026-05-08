import { useEffect, useState } from 'react';
import { TUTORIAL_STEPS } from '../engine/types';
import { ChevronRight, Zap } from 'lucide-react';

export interface TutorialStep {
  title: string;
  content: string;
  target: string | null;
}

interface Props {
  currentStep: number;
  isActive: boolean;
  onNext: () => void;
  onSkip: () => void;
  steps?: TutorialStep[];
}

export default function Tutorial({ currentStep, isActive, onNext, onSkip, steps = TUTORIAL_STEPS }: Props) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Lock body scroll while tutorial is active; scroll to top when it ends
  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive || currentStep >= steps.length) return;
    const step = steps[currentStep];
    if (!step.target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetRect(null);
      return;
    }

    const recalcRect = () => {
      const el = document.getElementById(step.target!) ?? document.querySelector(`[data-tutorial="${step.target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    };

    // Scroll element into center of viewport before highlighting
    const el = document.getElementById(step.target) ?? document.querySelector(`[data-tutorial="${step.target}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Recalculate after scroll settles
    setTimeout(recalcRect, 400);
    recalcRect();

    window.addEventListener('scroll', recalcRect, true);
    window.addEventListener('resize', recalcRect);
    return () => {
      window.removeEventListener('scroll', recalcRect, true);
      window.removeEventListener('resize', recalcRect);
    };
  }, [currentStep, isActive, steps]);

  if (!isActive || currentStep >= steps.length) return null;

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const total = steps.length;

  // Position card near the target element
  let cardStyle: React.CSSProperties = {};
  if (targetRect) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const cardWidth = 420;

    // Place card to the side of the target with most space
    if (targetRect.right + cardWidth + 20 < screenW) {
      // Right of target
      cardStyle = {
        position: 'fixed',
        top: Math.max(20, Math.min(targetRect.top, screenH - 350)),
        left: targetRect.right + 16,
        maxWidth: cardWidth,
      };
    } else if (targetRect.left - cardWidth - 20 > 0) {
      // Left of target
      cardStyle = {
        position: 'fixed',
        top: Math.max(20, Math.min(targetRect.top, screenH - 350)),
        left: targetRect.left - cardWidth - 16,
        maxWidth: cardWidth,
      };
    } else {
      // Below target
      cardStyle = {
        position: 'fixed',
        top: Math.min(targetRect.bottom + 16, screenH - 300),
        left: Math.max(20, (screenW - cardWidth) / 2),
        maxWidth: cardWidth,
      };
    }
  }

  return (
    <div className="tutorial-overlay">
      {/* Spotlight cutout */}
      {targetRect && (
        <div
          className="tutorial-spotlight-mask"
          style={{
            '--spot-top': `${targetRect.top - 8}px`,
            '--spot-left': `${targetRect.left - 8}px`,
            '--spot-width': `${targetRect.width + 16}px`,
            '--spot-height': `${targetRect.height + 16}px`,
          } as React.CSSProperties}
        />
      )}

      {/* Highlight border around target */}
      {targetRect && (
        <div
          className="tutorial-highlight"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      <div className={`tutorial-card ${targetRect ? '' : 'tutorial-center'}`} style={cardStyle}>
        {isFirst && (
          <div className="tutorial-logo">
            <Zap size={32} className="logo-icon" />
          </div>
        )}

        <div className="tutorial-progress">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className={`progress-dot ${i <= currentStep ? 'active' : ''}`} />
          ))}
        </div>

        <h2 className="tutorial-title">{step.title}</h2>
        <p className="tutorial-content">{step.content}</p>

        <div className="tutorial-actions">
          <button className="btn tutorial-skip" onClick={onSkip}>
            Skip Tutorial
          </button>
          <button className="btn btn-submit btn-buy tutorial-next" onClick={onNext}>
            {isLast ? 'Start Trading!' : 'Next'}
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="tutorial-step-counter">
          {currentStep + 1} of {total}
        </div>
      </div>
    </div>
  );
}
