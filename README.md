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

**Note on GitHub Pages:** it's a static host with no directory listing, so the app can't discover files under `questions/` on its own — `banks.json` is the index that tells it which files exist. Whenever you add a bank file, add one line to `banks.json` too (step 2 below).

## Deploying to GitHub Pages

1. Create a new GitHub repository (public, or private on a paid plan) and push this folder's contents to its root (or to a `/docs` folder — either works, see step 3).

   ```bash
   cd exam-simulator-pwa
   git init
   git add .
   git commit -m "Initial commit: Mock Exam Simulator PWA"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. In the repository on GitHub, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder (or `/docs` if you pushed there), then **Save**.
4. GitHub gives you a URL like `https://<your-username>.github.io/<your-repo>/`. It can take a minute or two to go live after the first push.
5. Open that URL. Because it's served over HTTPS, the app can `fetch()` the JSON files directly — no local server workaround needed, and the service worker can register (service workers require HTTPS or localhost).

Every time you push a change (a new question bank, a tweak to `index.html`), GitHub Pages redeploys automatically within a minute or so.

**A note on case sensitivity:** GitHub Pages runs on Linux, which treats `Questions/Bank1.json` and `questions/bank1.json` as different paths — unlike Windows or Mac, where you might not notice the mismatch while testing locally. Pick a casing convention (this project uses all-lowercase folder and file names) and use it exactly the same way in `banks.json`.

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
           { "id": "developer-associate-bank1", "file": "questions/developer-associate/bank1.json", "title": "Bank 1 (sample)", "description": "..." },
           { "id": "developer-associate-bank2", "file": "questions/developer-associate/bank2.json", "title": "Bank 2", "description": "..." }
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
       { "id": "cloud-practitioner-bank1", "file": "questions/cloud-practitioner/bank1.json", "title": "Bank 1", "description": "..." }
     ]
   }
   ```

   Bank `id`s must be unique across the *entire* file (not just within one certification), since progress, flags, timer state and history are all keyed by bank id.

3. Commit and push. On the start screen, the person first picks a **certification** from one dropdown; a second dropdown then appears underneath listing that certification's banks. Selections are remembered (see below), so the new bank or certification shows up the next time the relevant dropdown is opened. If someone already has the app open or installed, they'll see it after their next reload — the service worker fetches question JSON with a stale-while-revalidate strategy, so a cached list is shown instantly while a fresh copy loads in the background.

You can have as many question-bank files, under as many certification folders, as you like; each exam run pulls up to 65 random questions from the selected bank (fewer if the bank itself has fewer than 65).

## Remembering the selected certification and bank

The start screen remembers the last certification and bank the person picked (stored in `localStorage`), and pre-selects both the next time they open the app — including after fully closing and reopening the browser. If either one was removed from `banks.json` since they last picked it (a certification deleted, or just one bank removed from under a certification that still exists), the app falls back to the first available option in the affected dropdown and shows a short explanatory notice above the dropdowns instead of silently switching.

## No icon

This build ships with no app icon and no favicon on purpose. `manifest.json` has no `icons` array, and `index.html` points its `<link rel="icon">` at an empty data URI so browsers don't request `/favicon.ico`. Practically, this means:
- Browsers that require an icon before offering an install prompt (notably desktop Chrome/Edge) may not show an "Install app" button until you add one.
- An installed instance (on platforms that do install it, like Android) will use a generic placeholder icon.

To add an icon later, put image files somewhere in the project (e.g. an `icons/` folder), add an `icons` array to `manifest.json` pointing at them, add `<link rel="icon" ...>` / `<link rel="apple-touch-icon" ...>` tags back into `index.html`'s `<head>`, and list the new files in `sw.js`'s `SHELL_FILES` array so they're cached for offline use.

## Installing as an app

Once deployed and opened over HTTPS:
- **Desktop Chrome/Edge**: an "Install app" button appears in the top bar if the browser considers the app installable (see "No icon" above — some browsers withhold this until an icon is added).
- **Android Chrome**: "Add to Home screen" from the browser menu, or the same in-app install button.
- **iOS Safari**: Share → "Add to Home Screen" (iOS does not support the `beforeinstallprompt` button, so this is the only path there).

Installed, it opens in its own window with no browser chrome, and works fully offline after the first visit (app shell + whichever question banks you've opened at least once).

## Local testing before deploying

Because the app uses `fetch()` for the question JSON, opening `index.html` directly via `file://` won't work (browsers block those requests, and service workers require a real origin). Serve it locally instead:

```bash
cd exam-simulator-pwa
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html` in a browser — `localhost` is treated as a secure context, so the service worker and PWA install prompt work exactly as they will on GitHub Pages.

## Notes

- Progress, flags, timer state, and attempt history are stored in the browser's `localStorage`, scoped per question bank. They don't sync across browsers or devices.
- Bumping `CACHE_VERSION` at the top of `sw.js` forces all clients to drop old cached files and pick up new ones on their next visit — do this whenever you change `index.html` or `manifest.json` (question-bank JSON updates don't need it, since those are revalidated on every load when online).
