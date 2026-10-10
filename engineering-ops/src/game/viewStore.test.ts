import { beforeEach, describe, expect, it } from 'vitest';
import { useGame } from '@/game/store';

const g = () => useGame.getState();
const viewing = () => (g().view.owner === g().session ? g().view.minute : null);

beforeEach(() => {
  g().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
  g().openMission('lab', { template: 'three-tier', fresh: true });
  g().step(8); // minutes of history to look back through
});

describe('looking back through a run', () => {
  const minutes = () => g().session!.history.map((h) => h.minute);

  it('starts live', () => expect(viewing()).toBeNull());

  it('viewAt shows a past minute and pauses the simulation', () => {
    g().setRunning(true);
    const target = minutes()[2];
    g().viewAt(target);
    expect(viewing()).toBe(target);
    expect(g().running).toBe(false);
  });

  it('viewing the newest minute, or null, is simply live', () => {
    g().viewAt(minutes()[2]);
    g().viewAt(minutes()[minutes().length - 1]);
    expect(viewing()).toBeNull();
    g().viewAt(minutes()[2]);
    g().viewAt(null);
    expect(viewing()).toBeNull();
  });

  it('scrub steps back and forward, and stepping past the newest returns to live', () => {
    const last = minutes()[minutes().length - 1];
    g().scrub(-1);
    expect(viewing()).toBe(last - 1);
    g().scrub(-2);
    expect(viewing()).toBe(last - 3);
    g().scrub(3);
    expect(viewing()).toBeNull();
  });

  it('stops at the oldest minute', () => {
    g().scrub(-999);
    expect(viewing()).toBe(minutes()[0]);
  });

  it('never changes the run itself', () => {
    const before = JSON.stringify({ m: g().session!.minute, live: g().session!.live, h: g().session!.history.length });
    g().viewAt(minutes()[1]);
    g().scrub(1);
    expect(JSON.stringify({ m: g().session!.minute, live: g().session!.live, h: g().session!.history.length })).toBe(before);
  });

  it('returns to live when time moves on (step, run, deploy)', () => {
    g().viewAt(minutes()[1]);
    g().step(1);
    expect(viewing()).toBeNull();

    g().viewAt(minutes()[1]);
    g().setRunning(true);
    expect(viewing()).toBeNull();

    g().setRunning(false);
    g().viewAt(minutes()[1]);
    g().deploy();
    expect(viewing()).toBeNull();
  });

  it('starts live again in another session', () => {
    g().viewAt(minutes()[1]);
    g().openMission('lab', { template: 'serverless', fresh: true });
    expect(viewing()).toBeNull();
  });

  it('does nothing without history', () => {
    g().openMission('lab', { template: 'serverless', fresh: true });
    g().scrub(-1);
    g().viewAt(3);
    expect(viewing()).toBeNull();
  });
});
