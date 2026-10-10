import { useCallback, useState, type ReactNode } from 'react';
import { Modal } from '@/shared/ui/Dialog';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
}

/**
 * An in-app replacement for window.confirm(). The native dialog is blocked without any feedback inside sandboxed
 * iframes (an embedded preview, an artifact viewer), where confirm() returns false at once and the action it guards
 * silently never runs. This one is ordinary React UI, so it works everywhere, and it traps focus and closes on Escape.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

/**
 * `ask(options, onYes)` opens the dialog; `onYes` runs only if the person confirms.
 * Render the returned `dialog` somewhere in the component's output.
 */
export function useConfirm(): { ask: (options: ConfirmOptions, onYes: () => void) => void; dialog: ReactNode } {
  const [req, setReq] = useState<{ options: ConfirmOptions; onYes: () => void } | null>(null);
  const ask = useCallback((options: ConfirmOptions, onYes: () => void) => setReq({ options, onYes }), []);
  const dialog = req ? (
    <ConfirmDialog
      {...req.options}
      onCancel={() => setReq(null)}
      onConfirm={() => {
        const yes = req.onYes;
        setReq(null);
        yes();
      }}
    />
  ) : null;
  return { ask, dialog };
}
