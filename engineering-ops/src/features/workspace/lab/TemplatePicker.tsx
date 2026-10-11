import { TEMPLATES } from '@/content/templates';
import { useGame } from '@/game/store';
import { useConfirm } from '@/shared/ui/common';

/** Replace the sandbox with a starter design, after confirming. */
export function TemplatePicker() {
  const openMission = useGame((s) => s.openMission);
  const { ask, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <section>
        <h4>Template</h4>
        <select
          aria-label="Template"
          onChange={(e) => {
            const id = e.target.value;
            const tpl = TEMPLATES.find((x) => x.id === id);
            e.target.value = '';
            if (!tpl) return;
            ask(
              {
                title: `Load “${tpl.name}”?`,
                message: 'This replaces the sandbox. Your current sandbox is kept only if you saved it as a design.',
                confirmLabel: 'Replace sandbox',
              },
              () => openMission('lab', { template: tpl.id, fresh: true }),
            );
          }}
          defaultValue=""
        >
          <option value="">Load a template…</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </section>
    </>
  );
}
