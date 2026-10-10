import { useState } from 'react';
import { Modal } from '@/shared/ui/common';
import { go } from '@/shared/lib/nav';

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const steps = [
    {
      t: 'Welcome to Engineering Ops',
      b: 'Build. Break. Learn. This is a simulator for engineering judgment: you design systems, deploy them, watch what happens, and learn from the consequences. Everything is simulated — no cloud account, no real charges.',
    },
    {
      t: 'The loop',
      b: 'Read the scenario → investigate the evidence (logs, metrics, traces, changes, cost) → form a hypothesis → change the design → deploy → observe → handle side effects → verify → read the debrief. Every change has causal, explainable effects.',
    },
    {
      t: 'The workspace',
      b: 'Drag components from the library onto the canvas and connect them. Select anything to inspect and configure it. Edits are a draft: open the Plan tab and press Deploy. Use Run / +1m to move simulated time; Space toggles the clock.',
    },
    {
      t: 'Choose your mode',
      b: 'Beginner explains concepts and points you to the right evidence. Intermediate gives less guidance. Advanced adds noisy logs, missing telemetry and competing requirements. You can switch any time in the Command Center.',
    },
  ];
  const s = steps[i];
  return (
    <Modal
      title={s.t}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Skip
          </button>
          {i > 0 && (
            <button className="btn btn-ghost" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          {i < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setI(i + 1)}>
              Next
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => {
                onClose();
                go('/play/m1-monolith');
              }}
            >
              Start Mission 1
            </button>
          )}
        </>
      }
    >
      <p className="story">{s.b}</p>
      <div className="dots" aria-hidden="true">
        {steps.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
    </Modal>
  );
}
