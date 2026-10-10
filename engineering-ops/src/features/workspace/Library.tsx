import { Lock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES } from '@/engine/catalog';
import type { CategoryId } from '@/engine/types';
import { levelFromXp } from '@/game/progression';
import { missionOf, LAB_ID } from '@/game/session';
import { unlockedTier, useGame } from '@/game/store';
import { NodeIcon } from '@/shared/ui/icons';
import { toneOfKind } from '@/shared/ui/roleTone';
import { serviceName } from '@/shared/ui/serviceName';

export function Library() {
  const session = useGame((s) => s.session);
  const xp = useGame((s) => s.progress.xp);
  const showAll = useGame((s) => s.settings.showAllComponents);
  const mode = useGame((s) => s.settings.mode);
  const [cat, setCat] = useState<CategoryId>('app');
  const [q, setQ] = useState('');
  const level = levelFromXp(xp);
  const tier = unlockedTier(level, showAll);
  const mission = session ? missionOf(session.missionId) : undefined;
  const isLab = session?.missionId === LAB_ID;

  const items = useMemo(() => {
    const allowed = (kind: string, t: number) => (isLab ? t <= tier : mission?.components.includes(kind));
    return CATALOG.filter((e) => e.category === cat && (!q || `${e.name} ${e.desc} ${e.kind}`.toLowerCase().includes(q.toLowerCase())))
      .filter((e) => (isLab ? true : !!allowed(e.kind, e.tier)))
      .map((e) => ({ e, locked: isLab && e.tier > tier }));
  }, [cat, q, isLab, tier, mission]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((c) => [c.id, CATALOG.filter((e) => e.category === c.id && (isLab || mission?.components.includes(e.kind))).length]),
      ),
    [isLab, mission],
  );

  const groups = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const arr = m.get(it.e.group) ?? [];
      arr.push(it);
      m.set(it.e.group, arr);
    }
    return Array.from(m.entries());
  }, [items]);

  return (
    <section className="card-panel library" aria-label="Component library">
      <h3 className="cp-title">Components</h3>
      <div className="lib-search">
        <Search size={14} aria-hidden="true" />
        <input placeholder="Search components…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search components" />
      </div>
      <div className="lib-cats" role="tablist" aria-label="Component categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            className={`lib-cat ${cat === c.id ? 'on' : ''}`}
            onClick={() => setCat(c.id)}
            title={c.blurb}
            disabled={!counts[c.id]}
          >
            {c.label.split(' & ')[0]}
            <span className="muted"> {counts[c.id]}</span>
          </button>
        ))}
      </div>
      <div className="lib-list">
        {mode === 'beginner' && (
          <p className="lib-tip">Drag a component onto the canvas — or click it. Select it to see what it does and configure it.</p>
        )}
        {groups.map(([g, list]) => (
          <section key={g}>
            <h4>{g}</h4>
            <div className="lib-grid">
              {list.map(({ e, locked }) => (
                <button
                  key={e.kind}
                  className={`lib-item ${locked ? 'locked' : ''}`}
                  draggable={!locked}
                  title={locked ? `Unlocks at level ${e.tier === 2 ? 2 : 4}` : e.desc}
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData('application/x-eo-kind', e.kind);
                    ev.dataTransfer.effectAllowed = 'copy';
                    const ico = (ev.currentTarget as HTMLElement).querySelector('.lib-ico');
                    if (ico) ev.dataTransfer.setDragImage(ico, 18, 18);
                  }}
                  onClick={() => {
                    if (!locked) {
                      window.dispatchEvent(new CustomEvent('eo-add', { detail: { kind: e.kind } }));
                      useGame.getState().setMobilePane('canvas');
                    }
                  }}
                  disabled={locked}
                  aria-label={`${e.name}${locked ? ' (locked)' : ''}`}
                >
                  <span className={`lib-ico tone-${toneOfKind(e.kind, e.role)}`}>
                    <NodeIcon name={e.icon} size={17} />
                  </span>
                  <span className="lib-text">
                    <span className="lib-name">{e.aws ? serviceName(e.kind) : e.name}</span>
                    <span className="lib-cap">{e.group}</span>
                  </span>
                  {e.aws && <span className="lib-aws">AWS</span>}
                  {locked && <Lock size={12} className="lib-lock" />}
                </button>
              ))}
            </div>
          </section>
        ))}
        {items.length === 0 && <p className="muted pad">No components match.</p>}
        {!isLab && (
          <p className="lib-tip">
            Components are limited to those relevant to this mission. Unlock the full catalog in the Architecture Lab.
          </p>
        )}
        {isLab && tier < 3 && (
          <p className="lib-tip">
            Level {level}: more components unlock as you progress (level 2: caching & queues; level 4: platform tooling). Advanced players
            can unlock everything in Settings.
          </p>
        )}
      </div>
    </section>
  );
}
