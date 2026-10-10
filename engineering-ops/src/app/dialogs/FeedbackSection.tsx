import { Copy, Download, ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MISSION_BY_ID } from '@/content/missions';
import { exportJson, issueUrl, summarize, toText } from '@/game/feedback';
import { useFeedback } from '@/game/feedbackStore';

/**
 * Settings → feedback you have given. Everything stays on this device; the buttons below are the only ways it leaves,
 * and each one is something the person does on purpose.
 */
export function FeedbackSection() {
  const entries = useFeedback((s) => s.entries);
  const clear = useFeedback((s) => s.clear);
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState<'done' | 'manual' | null>(null);
  const rows = summarize(entries);
  const text = toText(entries);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      setCopied('manual'); // clipboard blocked (a sandboxed frame): show the text to select instead
    }
  };

  return (
    <div className="form-field">
      <span>Your feedback</span>
      {entries.length === 0 ? (
        <p className="muted tiny">
          Nothing yet. After you submit a mission you can say how hard it was and whether the brief was clear. It is saved on this device
          only.
        </p>
      ) : (
        <>
          <p className="muted tiny">
            {entries.length} response{entries.length === 1 ? '' : 's'} saved on this device. Nothing is sent anywhere unless you use one of
            the buttons below.
          </p>
          <ul className="fb-summary">
            {rows.map((r) => (
              <li key={r.missionId}>
                <b>{MISSION_BY_ID[r.missionId]?.title ?? r.missionId}</b>: {r.responses} response{r.responses === 1 ? '' : 's'}
                {r.tooHard > 0 && `, ${r.tooHard} too hard`}
                {r.tooEasy > 0 && `, ${r.tooEasy} too easy`}
                {r.unclear > 0 && `, ${r.unclear} confusing`}
              </li>
            ))}
          </ul>
          <div className="row-gap">
            <a className="btn btn-ghost" href={issueUrl(entries)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> Open a GitHub issue
            </a>
            <button className="btn btn-ghost" onClick={copy}>
              <Copy size={14} /> Copy as text
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const blob = new Blob([exportJson(entries)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'engineering-ops-feedback.json';
                a.click();
              }}
            >
              <Download size={14} /> Export
            </button>
            <button
              className={`btn ${armed ? 'btn-danger' : 'btn-ghost'}`}
              onClick={() => {
                if (!armed) return setArmed(true);
                clear();
                setArmed(false);
              }}
              onBlur={() => setArmed(false)}
            >
              <Trash2 size={14} /> {armed ? 'Click again to delete' : 'Clear'}
            </button>
          </div>
          {copied === 'done' && (
            <p className="tiny" role="status">
              Copied.
            </p>
          )}
          {copied === 'manual' && (
            <textarea
              className="fb-manual"
              readOnly
              rows={5}
              value={text}
              aria-label="Feedback text to copy"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </>
      )}
    </div>
  );
}
