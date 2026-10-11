import { buildReport } from '@/engine/analysis';
import { emptyState, solve } from '@/engine/engine';
import type { Arch, Workload } from '@/engine/types';

export function evaluateDesign(arch: Arch, workload: Workload) {
  let st = emptyState();
  const win = [];
  for (let i = 0; i < 12; i++) {
    const r = solve(arch, workload, i, st);
    st = r.next;
    win.push(r.snapshot);
  }
  return buildReport(arch, win.slice(-5), workload).metrics;
}
