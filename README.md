# Mock Exam Simulator (PWA)

An installable, offline-capable mock exam app for any certification test — AWS, Google Cloud, Microsoft, or anything else — as long as the questions are provided in this app's JSON format. Pure HTML/CSS/JS, no build step, no external dependencies. Question banks live as separate JSON files so you can add or edit exams without touching the app code.

This is an independent study tool. It is not affiliated with, endorsed by, or associated with AWS, Google Cloud, Microsoft, or any other certification provider, and the bundled sample question content is AI-generated for practice purposes only — it is not official exam material. A disclaimer to this effect is shown at the bottom of every screen in the app.

## Project structure

```
.
├── index.html                 the whole app (markup, styles, logic)
├── manifest.json               PWA manifest (name, colors — no icons; see "No icon" below)
├── banks.json                  catalog of certifications, each with its own list of question banks
├── sw.js                       service worker — caches the app + question banks for offline use
└── questions/
    ├── developer-associate/
    │   └── bank1.json          sample bank (replace with your generated question bank)
    └── solutions-architect/
        └── bank1.json          sample bank
```

Each certification gets its own folder under `questions/` (add more as needed — name them however you like), and each folder can hold multiple numbered bank files (`bank1.json`, `bank2.json`, ...) so you can split a large question set or keep separate attempts.

## Adding or editing question banks

1. Create a new JSON file inside the right folder under `questions/` (e.g. `questions/developer-associate/bank2.json`, or `questions/cloud-practitioner/bank1.json` for a brand-new certification folder) following this schema:

```json
{
  "examTitle": "Certification Name — Sample Set",
  "questions": [
    {
      "id": 1,
      "domain": "Domain name from the exam guide",
      "type": "single",
      "question": "The question text...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswers": [1],
      "explanation": "Why the correct answer is correct, and why the others aren't.",
      "reference": "https://example.com/docs/..."
    }
  ]
}
```

- `type` is `"single"` or `"multi"`.
- `correctAnswers` is an array of zero-based indices into `options` (one entry for `single`, two or more for `multi`).
- `reference` is optional.

2. Register the file in `banks.json`. The catalog is two levels: a list of **certifications**, each with its own list of **banks**. To add a bank to an existing certification, add an entry to that certification's `banks` array, with `file` as the path from the site root:

```json
{
  "certifications": [
    {
      "id": "developer-associate",
      "title": "Developer Associate Certification",
      "banks": [
        {
          "file": "questions/developer-associate/bank1.json",
          "description": "..."
        },
        {
          "file": "questions/developer-associate/bank2.json",
          "description": "..."
        }
      ]
    }
  ]
}
```

To add a brand-new certification, add a new object to the top-level `certifications` array (with its own `id`, `title`, and `banks` list), e.g.:

```json
{
  "id": "cloud-practitioner",
  "title": "Cloud Practitioner Certification",
  "banks": [
    { "file": "questions/cloud-practitioner/bank1.json", "description": "..." }
  ]
}
```

A bank entry only needs `file` (path from the site root) and an optional `description`. The app derives everything else itself:

- **Dropdown label**: always shown as "Question Bank N", where N is the bank's position (1-based) in that certification's `banks` array — any `title` you add to a bank entry is ignored. Reordering the array changes the numbers shown.
- **Bank id** (used internally to key progress, flags, timer state and history in `localStorage`): derived from the file name with the folder path and `.json` stripped — e.g. `questions/developer-associate/bank1.json` → `bank1`. This means:
  - **Don't rename a bank's file** once people have used it, or their saved progress/history for that bank becomes unreachable (it's still in `localStorage`, just orphaned under the old id).
  - **File names only need to be unique within a certification**, not across the whole catalog — the derived id has no certification prefix, so `developer-associate/bank1.json` and `solutions-architect/bank1.json` both produce the id `bank1` and are kept apart only by which certification they're listed under. Giving every file a distinct name (e.g. `developer-associate-bank1.json`) avoids relying on that and is the safer convention if you ever plan to move bank entries between certifications.

3. Commit and push. On the start screen, the person first picks a **certification** from one dropdown; a second dropdown then appears underneath listing that certification's banks. Selections are remembered (see below), so the new bank or certification shows up the next time the relevant dropdown is opened. If someone already has the app open or installed, they'll see it after their next reload — the service worker fetches question JSON with a stale-while-revalidate strategy, so a cached list is shown instantly while a fresh copy loads in the background.

You can have as many question-bank files, under as many certification folders, as you like; each exam run pulls up to 65 random questions from the selected bank (fewer if the bank itself has fewer than 65).

## Remembering the selected certification and bank

The start screen remembers the last certification and bank the person picked (stored in `localStorage`), and pre-selects both the next time they open the app — including after fully closing and reopening the browser. If either one was removed from `banks.json` since they last picked it (a certification deleted, or just one bank removed from under a certification that still exists), the app falls back to the first available option in the affected dropdown and shows a short explanatory notice above the dropdowns instead of silently switching.

Note that this is matched by the bank's derived id (see "Adding or editing question banks" above), not by its dropdown position — so reordering banks within a certification's array is safe and won't trigger the notice, but renaming a bank's file will (the app will treat it as a different, unrecognized bank).

## Installing as an app

Once deployed and opened over HTTPS:

- **Desktop Chrome/Edge**: an "Install app" button appears in the top bar if the browser considers the app installable (see "No icon" above — some browsers withhold this until an icon is added).
- **Android Chrome**: "Add to Home screen" from the browser menu, or the same in-app install button.
- **iOS Safari**: Share → "Add to Home Screen" (iOS does not support the `beforeinstallprompt` button, so this is the only path there).

Installed, it opens in its own window with no browser chrome, and works fully offline after the first visit (app shell + whichever question banks you've opened at least once).

## Notes

- Progress, flags, timer state, and attempt history are stored in the browser's `localStorage`, scoped per question bank. They don't sync across browsers or devices.
- Bumping `CACHE_VERSION` at the top of `sw.js` forces all clients to drop old cached files and pick up new ones on their next visit — do this whenever you change `index.html` or `manifest.json` (question-bank JSON updates don't need it, since those are revalidated on every load when online).
