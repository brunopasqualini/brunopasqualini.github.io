import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
}

/**
 * Controlled tab strip built on Base UI (roving tabindex, arrow-key navigation, ARIA roles).
 * Content is rendered by the caller, so only the list is provided here.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (t: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <BaseTabs.Root className="tabs-root" value={value} onValueChange={(v) => onChange(v as T)}>
      <BaseTabs.List className={`tabs ${className}`} aria-label={label}>
        {tabs.map((t) => (
          <BaseTabs.Tab key={t.id} value={t.id} className="tab">
            {t.label}
            {t.badge}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}
