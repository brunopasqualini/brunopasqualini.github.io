import { Plus, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { Arch, Field } from '@/engine/types';
import type { SgRule } from '@/engine/net';

interface Props {
  field: Field;
  value: any;
  arch: Arch;
  onChange: (v: any) => void;
  changed?: boolean;
}

export function FieldEditor({ field, value, arch, onChange, changed }: Props) {
  const id = `f-${field.key}`;
  let control: ReactElement;
  switch (field.type) {
    case 'number':
      control = (
        <div className="num-wrap">
          <input
            id={id}
            type="number"
            value={Number.isNaN(value) ? '' : (value ?? '')}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          />
          {field.unit && <span className="unit">{field.unit}</span>}
        </div>
      );
      break;
    case 'select':
      control = (
        <select
          id={id}
          value={String(value)}
          onChange={(e) => {
            const o = field.options!.find((x) => String(x.value) === e.target.value);
            onChange(o ? o.value : e.target.value);
          }}
        >
          {field.options!.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'bool':
      control = (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={!!value}
          className={`switch ${value ? 'on' : ''}`}
          onClick={() => onChange(!value)}
        >
          <span />
        </button>
      );
      break;
    case 'text':
      control = <input id={id} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'ref': {
      const opts = arch.nodes.filter((n) => field.refKinds?.includes(n.kind));
      control = (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— none —</option>
          {opts.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'rules': {
      const rules: SgRule[] = value ?? [];
      const sgs = arch.nodes.filter((n) => n.kind === 'sg');
      control = (
        <div className="rules">
          {rules.map((r, i) => (
            <div className="rule" key={i}>
              <input
                aria-label="Port (0 = any)"
                type="number"
                min={0}
                max={65535}
                value={r.port}
                onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, port: Number(e.target.value) } : x)))}
              />
              <select
                aria-label="Source"
                value={r.source}
                onChange={(e) => onChange(rules.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}
              >
                <option value="world">0.0.0.0/0 (internet)</option>
                <option value="vpc">VPC CIDR</option>
                {sgs.map((s) => (
                  <option key={s.id} value={s.id}>
                    SG: {s.label}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn" aria-label="Remove rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rules, { port: 443, source: 'vpc' }])}>
            <Plus size={14} /> Add inbound rule
          </button>
          {rules.length === 0 && <p className="muted tiny">No inbound rules: all inbound traffic is denied.</p>}
        </div>
      );
      break;
    }
  }
  return (
    <div className={`field ${field.type === 'bool' ? 'field-row' : ''} ${changed ? 'field-changed' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {changed && <span className="dot" title="Pending change" />}
      </label>
      {control}
      {field.help && <p className="help">{field.help}</p>}
    </div>
  );
}
