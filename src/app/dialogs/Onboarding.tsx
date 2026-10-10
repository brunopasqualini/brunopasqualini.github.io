import { useState } from 'react';
import { Modal } from '@/shared/ui/common';
import { TAGLINE, VISION } from '@/content/positioning';
import { FIRST_MISSION } from '@/content/journey';
import { go } from '@/shared/lib/nav';

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const steps = [
    {
      t: 'Welcome to Engineering Ops',
      b: `${VISION} ${TAGLINE} You will start with a live incident: something is failing, you gather evidence, form a hypothesis, make one change, deploy it and read why the system reacted as it did. A guide in the mission panel walks you through the first one.`,
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
                go('/play/' + FIRST_MISSION);
              }}
            >
              Start the first incident
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
