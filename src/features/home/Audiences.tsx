import { ArrowRight } from 'lucide-react';
import { AUDIENCES } from '@/content/positioning';
import { go } from '@/shared/lib/nav';

export function Audiences() {
  return (
    <section aria-labelledby="aud-h">
      <h2 id="aud-h" className="section-title">
        Who it is for
      </h2>
      <div className="audiences">
        {AUDIENCES.map((a) => (
          <article key={a.id} className="audience">
            <h3>{a.who}</h3>
            <p className="aud-need">{a.need}</p>
            <h4>You will practise</h4>
            <ul className="list">
              {a.practise.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <button className="btn btn-ghost" onClick={() => go(a.to)}>
              {a.cta} <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
