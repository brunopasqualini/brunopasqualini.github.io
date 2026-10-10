import { useState } from 'react';
import { Modal } from '@/shared/ui/common';
import { TAGLINE, VISION } from '@/content/positioning';
import { go } from '@/shared/lib/nav';

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const steps = [
    {
      t: 'Welcome to Engineering Ops',
      b: `${VISION} ${TAGLINE}`,
    },
    {
      t: 'The loop',
      b: 'Read the scenario, investigate the evidence (metrics, logs, traces, changes, cost), form a hypothesis, change the design, deploy, observe, handle side effects, verify, then read the debrief. Every change has a causal, explainable effect, and a fix for one problem can create another.',
    },
    {
      t: 'Your workspace',
      b: 'Left: the mission, its objectives and recent events. Centre: the architecture canvas, with evidence panels underneath. Right: the component library and the inspector. Drag components onto the canvas and connect them; edits are a draft until you open Plan and press Deploy. Use the panel icons in the canvas header to hide either side column, Run or Space to move simulated time.',
    },
    {
      t: 'Choose your mode',
      b: 'Beginner explains concepts and points you to the right evidence. Intermediate gives less guidance. Advanced adds noisy logs, missing telemetry and competing requirements. You can switch at any time from the Home page.',
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
