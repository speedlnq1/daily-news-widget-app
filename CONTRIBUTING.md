# Contributing

Thanks for helping. This is a small project, so the process is light.

## Ways to help
- **Report a bug or a wrong-looking story** (use the issue templates; say your country/region and what you saw).
- **Suggest a feed or outlet** for your country or region (see `src/sources.js`; outlets must be established, editorially independent and have a public RSS feed).
- **Share feedback or a review** with the Feedback issue template, or leave a star.
- **Send a pull request** for anything on the roadmap or a fix.

## Ground rules
- No tracking, accounts, analytics or API keys that users must supply. Everything stays on the user's PC.
- No AI-generated "facts". The app lists headlines from trusted outlets; it does not write or verify news, and the docs must never claim it is fact-checked.
- The UI stays sandboxed: no Node integration, no remote scripts, feed text rendered with `textContent` only.
- Do not add code that scrapes sites that forbid it.

## Development
```
npm ci
npm test       # fast unit tests, must pass
npm start      # run the app
```
Add or update a test in `test/` with your change (see the existing `*.test.js` files for the style). CI runs the unit tests on every pull request. The heavy jobs (installer build, end-to-end, RAM/CPU measure) run when a maintainer adds the `full-ci` label.

## Pull requests
Keep them focused, describe what changed and why, and mention anything you could not test (for example Windows-only behaviour). Be kind in reviews: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security
Do not open a public issue for a vulnerability; see [SECURITY.md](SECURITY.md).
