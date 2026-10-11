// Checks the exam simulator's catalog and question banks against the schema in exam-simulator/README.md.
// Run: node scripts/validate-banks.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..', 'exam-simulator');
const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);
const read = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
};
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

const catalog = read(join(root, 'banks.json'));
if (catalog.__error) bad('banks.json', `not valid JSON (${catalog.__error})`);
else if (!Array.isArray(catalog.certifications) || !catalog.certifications.length) bad('banks.json', '"certifications" must be a non-empty array');

const certIds = new Set();
let questionCount = 0;
for (const cert of catalog.certifications ?? []) {
  const c = `banks.json > ${cert.id ?? '(no id)'}`;
  if (!nonEmpty(cert.id)) bad(c, 'certification needs an "id"');
  else if (certIds.has(cert.id)) bad(c, 'duplicate certification id');
  certIds.add(cert.id);
  if (!nonEmpty(cert.title)) bad(c, 'certification needs a "title"');
  if (!Array.isArray(cert.banks) || !cert.banks.length) bad(c, '"banks" must be a non-empty array');

  for (const bank of cert.banks ?? []) {
    const where = bank.file ?? '(no file)';
    if (!nonEmpty(bank.file)) {
      bad(c, 'a bank needs a "file" path');
      continue;
    }
    if (!existsSync(join(root, bank.file))) {
      bad(where, 'file does not exist (paths are relative to exam-simulator/)');
      continue;
    }
    const data = read(join(root, bank.file));
    if (data.__error) {
      bad(where, `not valid JSON (${data.__error})`);
      continue;
    }
    if (!nonEmpty(data.examTitle)) bad(where, 'needs an "examTitle"');
    if (!Array.isArray(data.questions) || !data.questions.length) {
      bad(where, '"questions" must be a non-empty array');
      continue;
    }
    const ids = new Set();
    data.questions.forEach((q, i) => {
      const at = `${where} > question #${q?.id ?? i + 1}`;
      questionCount++;
      if (ids.has(q.id)) bad(at, 'duplicate id within this file');
      ids.add(q.id);
      if (!nonEmpty(q.domain)) bad(at, 'needs a "domain" (an exam domain name, used for the score breakdown)');
      if (q.type !== 'single' && q.type !== 'multi') bad(at, '"type" must be "single" or "multi"');
      if (!nonEmpty(q.question)) bad(at, 'needs "question" text');
      if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(nonEmpty)) bad(at, '"options" needs at least two non-empty strings');
      else if (new Set(q.options).size !== q.options.length) bad(at, 'two options are identical');
      const answers = q.correctAnswers;
      if (!Array.isArray(answers) || !answers.length) bad(at, '"correctAnswers" must be a non-empty array of option indexes');
      else {
        if (!answers.every((a) => Number.isInteger(a) && a >= 0 && a < (q.options?.length ?? 0))) bad(at, '"correctAnswers" has an index outside "options" (indexes start at 0)');
        if (new Set(answers).size !== answers.length) bad(at, '"correctAnswers" repeats an index');
        if (q.type === 'single' && answers.length !== 1) bad(at, 'a "single" question needs exactly one correct answer');
        if (q.type === 'multi' && answers.length < 2) bad(at, 'a "multi" question needs two or more correct answers');
      }
      if (!nonEmpty(q.explanation)) bad(at, 'needs an "explanation" of why the answer is right and the others are not');
      if (q.reference !== undefined && !/^https:\/\/\S+$/.test(q.reference)) bad(at, '"reference" must be an https URL when present');
    });
  }
}

if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} found.`);
  process.exit(1);
}
console.log(`Question banks are valid: ${certIds.size} certifications, ${questionCount} questions.`);
