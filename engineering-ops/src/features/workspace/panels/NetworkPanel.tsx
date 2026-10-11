import { useMemo, useState } from 'react';
import { flowEdges, nodeById, roleOf } from '@/engine/arch';
import { explainFlow, type FlowResult } from '@/engine/net';
import { Chip, Empty } from '@/shared/ui/common';
import { useLive } from '@/game/hooks';

function Steps({ r }: { r: FlowResult }) {
  return (
    <ol className="steps">
      {r.steps.map((s, i) => (
        <li key={i} className={s.ok ? 'ok' : 'bad'}>
          <span className="mark">{s.ok ? '✓' : '✕'}</span>
          <div>
            <b>{s.label}</b>
            <p>{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function NetworkPanel() {
  const { session } = useLive();
  const [pick, setPick] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [port, setPort] = useState(443);
  const arch = session?.live;
  const flows = useMemo(() => {
    if (!arch) return [];
    const out: { label: string; res: FlowResult; port: number }[] = [];
    for (const e of flowEdges(arch)) {
      const s = nodeById(arch, e.source)!;
      const t = nodeById(arch, e.target)!;
      if (!s || !t) continue;
      const sr = roleOf(s);
      const tr = roleOf(t);
      let p = 0;
      let res: FlowResult | undefined;
      if (sr === 'source' && t.config.subnet) {
        p = 443;
        res = explainFlow(arch, s.id, t.id, 443);
      } else if (tr === 'external') {
        p = 443;
        res = explainFlow(arch, s.id, t.id, 443);
      } else if (tr === 'storage' && sr === 'compute' && s.config.subnet) {
        p = 443;
        res = t.config.vpcEndpoint
          ? {
              ok: true,
              steps: [
                {
                  label: 'Gateway VPC endpoint',
                  ok: true,
                  detail: `${t.label} is reached through a gateway endpoint: no NAT gateway or internet path is needed (and no per-GB NAT charge).`,
                },
              ],
            }
          : explainFlow(arch, s.id, t.id, 443);
      } else if (sr === 'lb' && tr === 'compute' && (s.config.sg || t.config.sg)) {
        p = 8080;
        res = explainFlow(arch, s.id, t.id, 8080);
      } else if (tr === 'db' && t.config.sg) {
        p = 5432;
        res = explainFlow(arch, s.id, t.id, 5432);
      }
      if (res) out.push({ label: `${s.label} → ${t.label} (tcp/${p})`, res, port: p });
    }
    return out;
  }, [arch]);
  if (!session || !arch) return null;
  const custom = from && to ? explainFlow(arch, from, to, port) : undefined;
  const cur = flows[Math.min(pick, flows.length - 1)];
  const nodes = arch.nodes.filter((n) => roleOf(n) !== 'network' && roleOf(n) !== 'identity' && roleOf(n) !== 'delivery');
  if (!flows.length && !arch.nodes.some((n) => roleOf(n) === 'network'))
    return (
      <Empty title="No VPC network modelled">
        Add a VPC, subnets, security groups and an internet/NAT gateway, then place components in subnets from the inspector to inspect
        reachability here.
      </Empty>
    );
  return (
    <div className="panel-body netpanel">
      <div className="net-list">
        <h5>Paths in this architecture</h5>
        <ul>
          {flows.map((f, i) => (
            <li key={i}>
              <button className={i === pick ? 'on' : ''} onClick={() => setPick(i)}>
                <span className={f.res.ok ? 'ok' : 'bad'}>{f.res.ok ? '✓' : '✕'}</span>
                {f.label}
              </button>
            </li>
          ))}
          {flows.length === 0 && <li className="muted">No placed components yet.</li>}
        </ul>
        <h5>Custom check</h5>
        <div className="custom-check">
          <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">From…</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">To…</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <input aria-label="Port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
        </div>
      </div>
      <div className="net-detail">
        {cur && (
          <>
            <h5>
              {cur.label} <Chip kind={cur.res.ok ? 'ok' : 'crit'}>{cur.res.ok ? 'reachable' : `blocked at ${cur.res.blockedAt}`}</Chip>
            </h5>
            <Steps r={cur.res} />
          </>
        )}
        {custom && (
          <>
            <h5>
              Custom: {nodeById(arch, from)?.label} → {nodeById(arch, to)?.label}:{port}{' '}
              <Chip kind={custom.ok ? 'ok' : 'crit'}>{custom.ok ? 'reachable' : 'blocked'}</Chip>
            </h5>
            <Steps r={custom} />
          </>
        )}
        <p className="muted tiny">
          Each layer must allow the traffic: route table → gateway placement → security group (stateful) → network ACL (stateless, incl.
          return traffic) → IAM. Fixing one layer often reveals the next.
        </p>
      </div>
    </div>
  );
}
