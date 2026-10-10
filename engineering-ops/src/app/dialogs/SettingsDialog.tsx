import { Download, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { useGame } from '@/game/store';
import { Modal } from '@/shared/ui/common';
import { FeedbackSection } from '@/app/dialogs/FeedbackSection';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const mode = useGame((s) => s.settings.mode);
  const showAll = useGame((s) => s.settings.showAllComponents);
  const setMode = useGame((s) => s.setMode);
  const setShowAll = useGame((s) => s.setShowAll);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const resetAll = useGame((s) => s.resetAll);
  const toast = useGame((s) => s.toast);
  const file = useRef<HTMLInputElement>(null);
  return (
    <Modal title="Settings & save data" onClose={onClose}>
      <div className="form">
        <div className="form-field">
          <span>Difficulty mode</span>
          <div className="mode-pick" role="radiogroup" aria-label="Difficulty mode">
            {(['beginner', 'intermediate', 'advanced'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <label className="form-field row">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>Unlock the entire component catalog in the Architecture Lab (skip progressive disclosure)</span>
        </label>
        <div className="form-field">
          <span>Save data</span>
          <p className="muted tiny">
            Progress is stored in this browser (localStorage). Export a file to back it up or move it to another browser.
          </p>
          <div className="row-gap">
            <button
              className="btn btn-ghost"
              onClick={() => {
                const blob = new Blob([exportSave()], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'engineering-ops-save.json';
                a.click();
              }}
            >
              <Download size={14} /> Export
            </button>
            <button className="btn btn-ghost" onClick={() => file.current?.click()}>
              <Upload size={14} /> Import
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                toast(importSave(await f.text()) ? 'Save imported.' : 'That file is not a valid save.', 'info');
              }}
            />
            <button
              className="btn btn-danger"
              onClick={() => {
                if (confirm('Erase all progress, journal entries and saved sessions?')) {
                  resetAll();
                  toast('Progress reset.', 'info');
                  onClose();
                }
              }}
            >
              <Trash2 size={14} /> Reset all progress
            </button>
          </div>
        </div>
        <FeedbackSection />
      </div>
    </Modal>
  );
}
