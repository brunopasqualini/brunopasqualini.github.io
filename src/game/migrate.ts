import { SIM_VERSION } from '@/game/simVersion';

/** Version of the persisted envelope (shape of progress/settings/saved), independent of SIM_VERSION. */
export const SAVE_SCHEMA_VERSION = 2;

interface PersistedShape {
  progress?: unknown;
  settings?: unknown;
  saved?: Record<string, { simVersion?: number } & Record<string, unknown>>;
}

/**
 * Upgrade a persisted save from an older schema.
 *  v1 -> v2: saved sessions gain `simVersion`; sessions written before versioning were produced by SIM_VERSION 1.
 * Always returns a fresh object and never throws on malformed input (a broken save must not brick the app).
 */
export function migrateSave(persisted: unknown, fromVersion: number): PersistedShape {
  const p: PersistedShape = persisted && typeof persisted === 'object' ? { ...(persisted as PersistedShape) } : {};
  if (fromVersion < 2 && p.saved && typeof p.saved === 'object') {
    p.saved = Object.fromEntries(
      Object.entries(p.saved).map(([id, s]) => [id, s && typeof s === 'object' ? { ...s, simVersion: s.simVersion ?? 1 } : s]),
    ) as PersistedShape['saved'];
  }
  void SIM_VERSION;
  return p;
}
