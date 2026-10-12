// The generated pages. Each builder returns { path, title, description, ld, body } for layout().
import { loadExams, loadMissions, sampleQuestions } from './data.mjs';
import { CONTRIBUTE, breadcrumbs, esc, faq, notice, slug, url } from './site.mjs';

const HUB = '/aws-practice-exams/';
const SIM = '/software-architecture-simulator/';
const APP_OPS = '/engineering-ops/';

const trunc = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const letter = (i) => String.fromCharCode(65 + i);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Things only true of the exams as bundled, so the copy stays honest. */
const EXAM_PAGES = {
  'aws-saa-c03': {
    slug: 'solutions-architect-associate-saa-c03',
    short: 'Solutions Architect Associate (SAA-C03)',
    full: 'AWS Certified Solutions Architect – Associate (SAA-C03)',
    about:
      'The Solutions Architect Associate exam is about choosing AWS services to design architectures that are secure, resilient, high-performing and cost-optimised. The questions here are scenario based: a company has a requirement and a constraint, and you pick the design that fits.',
    topics: 'VPC networking, IAM, S3, RDS and Aurora, DynamoDB, ELB and Auto Scaling, CloudFront, SQS and SNS, KMS, multi-AZ and multi-Region design, and cost optimisation',
  },
  'aws-dva-c02': {
    slug: 'developer-associate-dva-c02',
    short: 'Developer Associate (DVA-C02)',
    full: 'AWS Certified Developer – Associate (DVA-C02)',
    about:
      'The Developer Associate exam is about building, deploying and debugging applications on AWS. The questions here are scenario based and lean on code, configuration and service behaviour: what happens when a Lambda function times out, how to authorise a request, or why a deployment failed.',
    topics: 'Lambda, API Gateway, DynamoDB, S3, SQS and SNS, Cognito, IAM and KMS, CloudFormation and SAM, CodePipeline and CodeDeploy, CloudWatch and X-Ray',
  },
};

const SKILL = {
  se: 'Software engineering',
  sa: 'Solution architecture',
  sd: 'System design',
  aws: 'AWS services',
  net: 'Cloud networking',
  devops: 'DevOps and CI/CD',
  plat: 'Platform engineering',
  sre: 'Site reliability and observability',
  data: 'Data and messaging',
  finops: 'FinOps and cost control',
};

const examPath = (e) => `${HUB}${EXAM_PAGES[e.id].slug}/`;
const missionPath = (m) => `${SIM}missions/${slug(m.title)}/`;

// ---------------------------------------------------------------------------------------------------------------------
function questionHtml(q, i) {
  const multi = q.type === 'multi' ? ` <em>(Choose ${q.correctAnswers.length}.)</em>` : '';
  const correct = q.correctAnswers.map(letter).join(' and ');
  return `<article class="q">
        <h3>Sample question ${i + 1} <span class="tag">${esc(q.domain)}</span></h3>
        <p>${esc(q.question)}${multi}</p>
        <ol class="opts" type="A">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>
        <details><summary>Show the answer and explanation</summary>
          <p><b>Correct answer: ${correct}.</b></p>
          <p>${esc(q.explanation)}</p>
          ${q.reference ? `<p><a href="${esc(q.reference)}" rel="noopener">Read the AWS documentation</a></p>` : ''}
        </details>
      </article>`;
}

function quizLd(page, exam, questions) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Quiz',
    name: `${page.full} sample practice questions`,
    url: url(examPath(exam)),
    about: { '@type': 'Thing', name: page.full },
    educationalLevel: 'Associate',
    isAccessibleForFree: true,
    inLanguage: 'en',
    hasPart: questions.map((q) => ({
      '@type': 'Question',
      eduQuestionType: 'Multiple choice',
      name: q.question,
      text: q.question,
      suggestedAnswer: q.options.filter((_, i) => !q.correctAnswers.includes(i)).map((o) => ({ '@type': 'Answer', text: o })),
      acceptedAnswer: q.correctAnswers.map((i) => ({ '@type': 'Answer', text: q.options[i] })),
      answerExplanation: { '@type': 'Comment', text: q.explanation },
    })),
  };
}

export async function buildPages() {
  // Pages exist for the exams described in EXAM_PAGES. A bank for another exam works in the simulator without one.
  const exams = loadExams().filter((e) => EXAM_PAGES[e.id]);
  const { missions, journey } = await loadMissions();
  const pages = [];

  // ------------------------------------------------------------------------------------------- AWS practice exams hub
  {
    const total = exams.reduce((n, e) => n + e.total, 0);
    const crumbs = breadcrumbs([['My tools', '/tools/'], ['AWS practice exams', HUB]]);
    const f = faq([
      ['Is this really free?', 'Yes. The practice exams are free, there is no account, no paywall and no email capture. They run in your browser.'],
      ['Are these real AWS exam questions?', 'No. They are AI-generated from official AWS documentation, with an explanation for every answer. They are not official AWS questions and not "exam dumps", and this website is not affiliated with, endorsed by or sponsored by AWS or any other cloud provider.'],
      ['Which AWS certifications can I practise?', `Right now the AWS Certified Solutions Architect – Associate (SAA-C03) with ${exams.find((e) => e.id === 'aws-saa-c03').total} questions and the AWS Certified Developer – Associate (DVA-C02) with ${exams.find((e) => e.id === 'aws-dva-c02').total} questions.`],
      ['Do the practice exams work offline?', 'Yes. After the first visit the simulator is cached by your browser, so you can keep practising without a connection, and you can install it to your home screen.'],
      ['Is my progress saved?', 'Your history and any exam in progress are stored in your own browser only, so you can resume later on the same device. Nothing is sent to a server.'],
      ['Can I add my own questions or another exam?', 'Yes. Question banks are plain JSON files, so anyone can contribute a bank for another AWS exam or for another cloud provider through a pull request on GitHub. The contributing guide explains the format and the rules.'],
      ['How is this different from a video course or a paid question bank?', 'It does not teach from scratch. It is for testing yourself: timed exams, explanations that say why each wrong option is wrong, a score breakdown by exam domain, and a retest of the questions you missed.'],
    ]);
    pages.push({
      path: HUB,
      title: 'Free AWS Practice Exams (SAA-C03, DVA-C02): No Signup',
      description: `Free AWS practice exams for Solutions Architect Associate (SAA-C03) and Developer Associate (DVA-C02): ${total} questions, explanations, timed mode, no signup.`,
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Free AWS practice exams',
          url: url(HUB),
          description: 'Free AWS certification practice exams that run in your browser.',
          inLanguage: 'en',
          isAccessibleForFree: true,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: exams.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: EXAM_PAGES[e.id].full, url: url(examPath(e)) })),
          },
        },
        crumbs.ld,
        f.ld,
      ],
      body: `${crumbs.html}
      <h1>Free AWS practice exams, no signup</h1>
      <p class="lead">Practise for your AWS certification in the browser. Take timed ${exams[0].perBank}-question mock exams, see an explanation for every answer, get a score breakdown by exam domain and retest only the questions you missed. It is free, needs no account and works offline once loaded.</p>
      <p><a class="btn" href="/exam-simulator/">Open the practice exam simulator</a></p>
      ${notice()}

      <h2>Choose your AWS exam</h2>
      <div class="grid2">
        ${exams
          .map(
            (e) => `<a class="card tile" href="${examPath(e)}">
          <span class="eyebrow">${plural(e.banks, 'practice exam')}</span>
          <h3>${esc(EXAM_PAGES[e.id].full)}</h3>
          <p>${e.total} questions across ${e.domains.length} exam domains, each with an explanation.</p>
          <span class="cta">Practise ${esc(EXAM_PAGES[e.id].short)} <span aria-hidden="true">&rarr;</span></span>
        </a>`,
          )
          .join('\n        ')}
      </div>

      <h2>How the practice exams work</h2>
      <ul class="bullets">
        <li><b>Timed or untimed.</b> Run a full exam against the clock, or take your time and read as you go.</li>
        <li><b>Explanations that teach.</b> Every question says why the right answer is right, why each wrong option is wrong, and links to the AWS documentation.</li>
        <li><b>Score by domain.</b> See which exam domains are strong and which need work, instead of one overall percentage.</li>
        <li><b>Retest your weak areas.</b> Re-run just the questions you got wrong or flagged.</li>
        <li><b>Resume anywhere you left off.</b> An exam in progress is saved in your browser.</li>
        <li><b>Private and offline.</b> Your history stays on your device, and the simulator works without a connection.</li>
      </ul>

      <h2>What these questions are, and are not</h2>
      <p>The questions are generated with AI from AWS's official documentation and written in the style of each exam, so that you can test the concepts the exam covers: choosing the right service, spotting the constraint that rules out an option, and trading cost against resilience. Each links back to the documentation it is based on. They are <b>not</b> official AWS exam content and not leaked questions, and this website is not affiliated with AWS. If you want to know how the real exam is structured, read the official exam guide on the AWS Certification site, and use these questions to find out what you do not yet know.</p>

      <h2>How to get the most out of a practice exam</h2>
      <ol class="bullets">
        <li>Take one exam cold to find your baseline, without looking anything up.</li>
        <li>Read every explanation, including for questions you got right, because the reasoning is the point.</li>
        <li>Use the domain breakdown to decide what to study, then retest your weak areas rather than the whole exam.</li>
        <li>Build the services in a free-tier account or a simulator so the trade-offs are concrete. The <a href="${SIM}">software architecture simulator</a> on this site lets you design and break cloud systems without an account.</li>
      </ol>

      <h2>Contribute a question bank</h2>
      <p>The question banks are plain JSON files in the project's GitHub repository. If you write practice questions for another AWS exam, or for Google Cloud, Azure or another provider, you can add them with a pull request. The <a href="${CONTRIBUTE}" rel="noopener">contributing guide</a> covers the format, the rules (original questions only, based on official documentation, with explanations) and a validator to check your bank before you submit it.</p>

      ${f.html}`,
    });
  }

  // ------------------------------------------------------------------------------------------------ one page per exam
  for (const exam of exams) {
    const meta = EXAM_PAGES[exam.id];
    const path = examPath(exam);
    const samples = sampleQuestions(exam, 8);
    const crumbs = breadcrumbs([['My tools', '/tools/'], ['AWS practice exams', HUB], [meta.short, path]]);
    const f = faq([
      [`How many ${meta.short} practice questions are there?`, `${exam.total} questions in ${plural(exam.banks, 'practice exam')} of ${exam.perBank} questions each.`],
      ['Are these the real exam questions?', 'No. They are AI-generated from official AWS documentation, in the style of the exam. They are not official AWS questions and not exam dumps, and this website is not affiliated with AWS.'],
      ['Do I need to create an account?', 'No. There is no signup. Your progress is saved in your own browser.'],
      ['Can I practise offline?', 'Yes. The simulator caches itself after the first visit and can be installed to your home screen.'],
    ]);
    pages.push({
      path,
      title: `Free AWS ${meta.short.replace(' (', ' ').replace(')', '')} Practice Exam`,
      description: `Free AWS ${meta.short} practice exam: ${exam.total} questions in ${exam.banks} timed ${exam.perBank}-question exams, with explanations and domain scores. No signup.`,
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: `Free ${meta.full} practice exam`,
          url: url(path),
          inLanguage: 'en',
          isAccessibleForFree: true,
          about: meta.full,
          isPartOf: { '@type': 'WebSite', name: 'Bruno Pasqualini: free learning tools', url: url('/') },
        },
        crumbs.ld,
        quizLd(meta, exam, samples),
        f.ld,
      ],
      body: `${crumbs.html}
      <h1>Free ${esc(meta.full)} practice exam</h1>
      <p class="lead">${exam.total} practice questions in ${plural(exam.banks, 'timed exam')} of ${exam.perBank}, each with an explanation of the right answer and why the other options are wrong. Free, no signup, and it works offline.</p>
      <p><a class="btn" href="/exam-simulator/?cert=${exam.id}">Start the ${esc(meta.short)} practice exam</a></p>
      ${notice()}

      <h2>About the exam</h2>
      <p>${esc(meta.about)}</p>
      <p>Topics that come up include ${esc(meta.topics)}.</p>

      <h2>What is in the question bank</h2>
      <p>Questions are grouped by exam domain, so your score report shows where you are strong and where to study next.</p>
      <table class="tbl">
        <thead><tr><th scope="col">Exam domain</th><th scope="col">Questions</th></tr></thead>
        <tbody>
          ${exam.domains.map((d) => `<tr><th scope="row">${esc(d.name)}</th><td>${d.count}</td></tr>`).join('\n          ')}
          <tr class="total"><th scope="row">Total</th><td>${exam.total}</td></tr>
        </tbody>
      </table>
      <p class="muted">Check the official AWS exam guide for the current domains and their weightings. These questions are AI-generated practice material based on AWS documentation, not official exam content.</p>

      <h2>Try ${samples.length} sample questions</h2>
      <p>Read the question, pick an answer in your head, then open the explanation. The simulator adds timing, scoring and retests.</p>
      ${samples.map(questionHtml).join('\n      ')}
      <p><a class="btn" href="/exam-simulator/?cert=${exam.id}">Take the full ${esc(meta.short)} practice exam</a></p>

      <h2>More practice</h2>
      <ul class="bullets">
        ${exams
          .filter((e) => e.id !== exam.id)
          .map((e) => `<li><a href="${examPath(e)}">Free ${esc(EXAM_PAGES[e.id].full)} practice exam</a></li>`)
          .join('\n        ')}
        <li><a href="${SIM}">Software architecture simulator</a>: design, break and fix cloud systems to see the trade-offs the exam asks about.</li>
        <li><a href="${CONTRIBUTE}" rel="noopener">Contribute a question bank</a>: add questions for another exam or cloud provider on GitHub.</li>
      </ul>

      ${f.html}`,
    });
  }

  // ------------------------------------------------------------------------------- software architecture simulator
  const byId = new Map(missions.map((m) => [m.id, m]));
  const ordered = journey.flatMap((s) => s.missionIds.map((id) => byId.get(id)).filter(Boolean));
  {
    const crumbs = breadcrumbs([['My tools', '/tools/'], ['Software architecture simulator', SIM]]);
    const f = faq([
      ['What is the software architecture simulator?', 'Engineering Ops is a hands-on simulator for system design and site reliability. You get a running cloud architecture, investigate an incident from metrics, logs and traces, change the design, deploy it and watch how the system reacts.'],
      ['Is it free, and do I need an AWS account?', 'It is free and needs no account, no install and no cloud access. Everything is simulated in your browser, and costs are estimates, not AWS prices.'],
      ['Is it a real cloud?', 'No. It is a deterministic, rule-based simulation that models how load, failures, queues, caches and databases behave, so you can practise decisions safely and see the consequences.'],
      ['Who is it for?', 'Software engineers moving into system design, cloud and DevOps engineers who want practice beyond tutorials, and people preparing for architecture interviews or AWS certifications who want to make and defend design decisions.'],
      ['Is my progress saved?', 'Yes, in your browser (localStorage). You can export it from Settings and import it elsewhere.'],
    ]);
    const levels = journey
      .map((s) => {
        const list = s.missionIds.map((id) => byId.get(id)).filter(Boolean);
        if (!list.length) return '';
        return `<h3>Level ${s.level}: ${esc(s.title)}</h3>
      <p class="muted">${esc(s.tagline)}</p>
      <ul class="cards">${list
        .map(
          (m) => `<li><a class="card tile" href="${missionPath(m)}"><span class="eyebrow">${esc(m.kind === 'incident' ? 'Incident' : 'Design project')} · ${esc(m.difficulty)} · ~${m.estMinutes} min</span><h4>${esc(m.title)}</h4><p>${esc(m.tagline)}</p></a></li>`,
        )
        .join('')}</ul>`;
      })
      .join('\n      ');
    pages.push({
      path: SIM,
      title: 'Software Architecture & System Design Simulator, Free',
      description: 'Practise software architecture and system design in your browser: 14 cloud incident and design missions on a live architecture canvas. Free, no signup.',
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Engineering Ops: software architecture and system design simulator',
          url: url(SIM),
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'Any (runs in a web browser)',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          description: 'A hands-on simulator for system design, cloud architecture and site reliability engineering.',
          inLanguage: 'en',
          featureList: ['14 incident and design missions', 'Live architecture canvas', 'Chaos and traffic experiments', 'Architecture design review', 'Security attack simulation', 'Game days', 'Role-based learning paths'],
        },
        crumbs.ld,
        f.ld,
      ],
      body: `${crumbs.html}
      <h1>Software architecture and system design simulator</h1>
      <p class="lead">Learn system design by running it. Take over a live cloud architecture in a browser, find out why it is failing from metrics, logs and traces, redesign it, deploy the change and see what each decision costs. Fourteen missions, no signup, nothing to install.</p>
      <p><a class="btn" href="${APP_OPS}">Start the first incident</a></p>

      <h2>How a mission works</h2>
      <ol class="bullets">
        <li><b>Investigate.</b> Open metrics, logs, traces, dependencies, cost and security panels to gather evidence.</li>
        <li><b>Form a hypothesis.</b> Say what you think the root cause is. Diagnosis quality is scored.</li>
        <li><b>Design a change.</b> Drag components onto the canvas, connect them and configure them. Edits are a draft.</li>
        <li><b>Deploy and read the consequences.</b> The simulator explains what changed and why, for example that scaling the app tier raised database connections past the limit.</li>
        <li><b>Verify and debrief.</b> A verification load test scores ten dimensions and gives a structured debrief, with an architecture decision record and a postmortem.</li>
      </ol>

      <h2>What you will practise</h2>
      <ul class="bullets">
        <li>Capacity analysis, bottlenecks, indexes, connection pooling and caching trade-offs</li>
        <li>Timeouts, retries, circuit breakers, queues, dead-letter queues and idempotency</li>
        <li>Availability zones versus Regions, RTO and RPO, and disaster recovery strategies</li>
        <li>VPC networking, IAM least privilege and security groups, with a network inspector</li>
        <li>Cost trade-offs: right-sizing, data transfer, logging and cost against reliability</li>
        <li>Rate limiting, backpressure, hot keys and replication lag</li>
      </ul>

      <h2>The missions</h2>
      <p>Fourteen missions in five levels, from fixing one slow endpoint to designing a platform from a blank page. Each page below describes the scenario and what it teaches; the simulator itself runs the mission.</p>
      ${levels}

      <h2>Also in the simulator</h2>
      <ul class="bullets">
        <li><b>Architecture Lab.</b> A sandbox with starter templates, chaos experiments, traffic shapes such as a flash sale or a thundering herd, and side-by-side design comparison.</li>
        <li><b>Design review.</b> An architecture linter that flags anti-patterns in your draft with the reason and a lesson link.</li>
        <li><b>Attack simulation, game days and multi-Region analysis.</b> See what a leaked credential, a bad deploy or the loss of a Region would do to your design.</li>
        <li><b>Learning paths.</b> Role-based routes for backend developers, cloud architects, SREs and FinOps engineers.</li>
      </ul>
      <p>Studying for an AWS certification? Pair this with the <a href="${HUB}">free AWS practice exams</a>.</p>

      ${f.html}`,
    });
  }

  // ------------------------------------------------------------------------------------------- one page per mission
  ordered.forEach((m, i) => {
    const path = missionPath(m);
    const prev = ordered[i - 1];
    const next = ordered[i + 1];
    const crumbs = breadcrumbs([['My tools', '/tools/'], ['Software architecture simulator', SIM], [m.title, path]]);
    const incident = m.kind === 'incident';
    const skills = Object.entries(m.skills)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => SKILL[k])
      .filter(Boolean);
    pages.push({
      path,
      title: `${m.title}: ${incident ? 'Cloud Incident' : 'System Design'} Simulation`,
      description: trunc(`${m.tagline} A free ${incident ? 'incident' : 'design'} mission in the software architecture simulator: ${m.learning.slice(0, 3).join(', ').toLowerCase()}.`, 158),
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'LearningResource',
          name: m.title,
          url: url(path),
          description: m.tagline,
          learningResourceType: incident ? 'Incident simulation' : 'Design exercise',
          educationalLevel: m.difficulty,
          teaches: m.learning,
          timeRequired: `PT${m.estMinutes}M`,
          isAccessibleForFree: true,
          inLanguage: 'en',
          isPartOf: { '@type': 'WebApplication', name: 'Engineering Ops', url: url(SIM) },
        },
        crumbs.ld,
      ],
      body: `${crumbs.html}
      <h1>${esc(m.title)}</h1>
      <p class="lead">${esc(m.tagline)}</p>
      <ul class="chips"><li class="chip">${incident ? 'Incident' : 'Design project'}</li><li class="chip">${esc(m.difficulty)}</li><li class="chip">About ${m.estMinutes} minutes</li><li class="chip">Free, in your browser</li></ul>
      <p><a class="btn" href="${APP_OPS}#/play/${m.id}">Play this mission</a></p>

      <h2>The scenario</h2>
      <p>${esc(m.story)}</p>
      <p><b>Context.</b> ${esc(m.business.context)}</p>
      <p><b>What is at stake.</b> ${esc(m.business.impact)}</p>

      <h2>Your brief</h2>
      <ul class="bullets">${m.constraints.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>

      <h2>What you will learn</h2>
      <ul class="bullets">${m.learning.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="muted">Builds: ${esc(skills.join(', '))}.</p>

      <h2>How it plays</h2>
      <p>You are given a running architecture and the evidence a real engineer would have: metrics, logs, traces, cost and recent changes. Form a hypothesis, make a change, deploy it, and read why the system reacted as it did. A verification load test then scores your design and a debrief explains the root cause and the alternatives. Nothing here touches a real cloud account.</p>
      <p><a class="btn" href="${APP_OPS}#/play/${m.id}">Play ${esc(m.title)}</a></p>

      <nav class="pager" aria-label="More missions">
        ${prev ? `<a href="${missionPath(prev)}">&larr; ${esc(prev.title)}</a>` : '<span></span>'}
        <a href="${SIM}">All missions</a>
        ${next ? `<a href="${missionPath(next)}">${esc(next.title)} &rarr;</a>` : '<span></span>'}
      </nav>`,
    });
  });

  return { pages, exams, missions: ordered, helpers: { missionPath, examPath, HUB, SIM, APP_OPS } };
}
