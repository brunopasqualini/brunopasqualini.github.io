# Contributing a question bank

The Mock Exam Simulator reads plain JSON question banks, so you can add practice questions for any exam or cloud provider
(AWS, Google Cloud, Azure, Kubernetes, anything) without touching the app's code.

## Ground rules

- **Original questions only.** Do not submit real exam questions, "braindumps", or questions copied or lightly reworded from
  paid courses and question banks. They break the exam providers' terms and this site is not the place for them.
- **Base them on official documentation.** AI assistance is fine, but check each question against the provider's official
  documentation and put the link in `reference` (an `https` URL). A wrong "correct answer" is worse than no question.
- **Explain every answer.** The `explanation` says why the right option is right *and why each wrong option is wrong*. That is
  what makes a practice question teach something.
- **Be clear it is practice material.** Banks are shown with a notice that the questions are AI-generated or community written,
  are not official exam content, and that this project is not affiliated with any cloud provider.

## How to add a bank

1. Create a JSON file under `exam-simulator/questions/<provider>/<exam>/`, for example
   `exam-simulator/questions/gcp/associate-cloud-engineer/ACE_01.json`. Use the schema in
   [exam-simulator/README.md](exam-simulator/README.md#adding-or-editing-question-banks): an `examTitle` and a list of questions,
   each with `id`, `domain` (the exam-guide domain, used for the score breakdown), `type` (`single` or `multi`), `question`,
   `options`, `correctAnswers` (zero-based indexes), `explanation` and a `reference` link.
2. Register it in [`exam-simulator/banks.json`](exam-simulator/banks.json). Add the file to an existing certification's
   `banks`, or add a new certification with its own `id` (for example `gcp-ace`), `title` and `banks`.
3. Check it:
   ```bash
   node scripts/validate-banks.mjs
   ```
   It checks the catalog and every bank: valid JSON, unique ids, answer indexes inside `options`, `single` has one answer and
   `multi` has two or more, every question has a domain and an explanation, and references are `https` links.
4. Try it in the simulator (open `exam-simulator/index.html` through any static server), then open a pull request. A GitHub
   check runs the same validator.

Smaller contributions are welcome too: fixing a wrong answer, improving an explanation or adding a missing reference.

## Notes

- Bank files of about 65 questions work well for a timed exam. Split larger sets into numbered files (`..._01.json`,
  `..._02.json`).
- The static pages that describe the AWS practice exams are generated (`node scripts/seo/generate.mjs`). New exams from other
  providers show up in the simulator right away; a dedicated page for them is a separate change.
- The repository does not yet have a license file, so ask the maintainer how contributions are licensed if that matters to you.
