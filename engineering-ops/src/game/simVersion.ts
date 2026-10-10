/**
 * Saved sessions are stored as an operation log and rebuilt by replaying it through the simulation.
 * That is only faithful while the simulation (engine + mission content) behaves exactly as it did when the
 * log was written. SIM_VERSION names that behaviour. `simVersion.test.ts` fingerprints the simulation, so
 * changing behaviour without bumping this number fails CI instead of silently altering players' saves.
 */
export const SIM_VERSION = 1;

/** Saves written before versioning existed carry no number; they were produced by version 1 behaviour. */
export const isReplayCompatible = (saved: number | undefined): boolean => (saved ?? 1) === SIM_VERSION;
