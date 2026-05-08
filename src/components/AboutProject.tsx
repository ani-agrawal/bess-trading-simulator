import { Info, X } from 'lucide-react';
import { useState } from 'react';

export default function AboutProject() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Info size={16} /> About
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal about-modal" onClick={event => event.stopPropagation()}>
            <div className="modal-header">
              <h2>About This Simulator</h2>
              <button className="btn btn-icon" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <p>
              This is a public educational simulator for learning GB battery energy storage trading concepts.
              It is not trading advice, dispatch software, or a full market replica.
            </p>
            <div className="about-grid">
              <div>
                <strong>Good for</strong>
                <span>Learning BESS dispatch, scheduling, intraday revisions, SIP/NIV review, and market context.</span>
              </div>
              <div>
                <strong>Simplified</strong>
                <span>Order books, fees, collateral, full BM dispatch, ancillary service obligations, and degradation economics.</span>
              </div>
              <div>
                <strong>Data</strong>
                <span>Uses public Elexon BMRS data where available and synthetic fallback scenarios for training.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

