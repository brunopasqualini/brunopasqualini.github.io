import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** Modal dialog on Base UI: focus trap, Escape to close, scroll lock and return-focus come from the primitive. */
export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <BaseDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="modal-backdrop" />
        <div className="modal-layer">
          <BaseDialog.Popup className={`modal ${wide ? 'modal-wide' : ''}`}>
            <header className="modal-head">
              <BaseDialog.Title render={<h2 />}>{title}</BaseDialog.Title>
              <BaseDialog.Close className="icon-btn" aria-label="Close">
                <X size={18} />
              </BaseDialog.Close>
            </header>
            <div className="modal-body">{children}</div>
            {footer && <footer className="modal-foot">{footer}</footer>}
          </BaseDialog.Popup>
        </div>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
