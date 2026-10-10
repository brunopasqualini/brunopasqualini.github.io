import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { advance, applyAction, createSession, deployDraft } from '@/game/session';
import { CompareTab } from './CompareTab';

describe('CompareTab', () => {
  it('shows the improvement the player made, row by row', () => {
    const s = createSession('m2-db-meltdown', 'beginner');
    applyAction(s, 'add-index');
    s.draft.nodes.find((n) => n.id === 'db')!.config.connectionPooler = true;
    deployDraft(s);
    advance(s, 5);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<CompareTab session={s} />));
    expect(host.querySelector('table')).toBeTruthy();
    expect(host.textContent).toContain('Mission peak: success');
    expect(host.textContent).toContain('better');
    act(() => root.unmount());
    host.remove();
  });
});
