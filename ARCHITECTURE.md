# Architecture

```
feeds (RSS) --> fetcher --> rank --> topics filter --> main process state --> sandboxed renderer (UI)
                                   \--> breaking-news check --> tray notification
```

| File | Role |
| --- | --- |
| `src/main.js` | Electron main process: tray, window lifecycle, scheduler (daily refresh, 15-minute breaking check, pauses on sleep/lock), settings validation, IPC, link opening. Owns all state. |
| `src/preload.js` | The only bridge to the UI (`contextBridge`): a small fixed API, no Node access. |
| `src/renderer.js`, `index.html`, `style.css` | The UI. Renders feed text with `textContent` only. Strict CSP, no remote resources. |
| `src/fetcher.js` | Downloads feeds with timeouts and size caps, parses them, strips HTML/control/bidi characters. |
| `src/sources.js` | The fixed allowlist of trusted outlets and feeds per country/region. Nothing outside it is displayed. |
| `src/rank.js` | Clusters headlines about one story (first by headline words, then by rare names shared in headlines and summaries), counts independent outlets (wire-sharing outlets count once), scores severity by keywords, ranks. |
| `src/topics.js` | Keyword topic tagging used by the topic filter. A story fits every topic tied for the most hits; headline hits count double. When only some topics are picked, the fetcher also reads those topics' sections (Sport, Business, Health...) of the same trusted outlets, and a story from a section counts as that topic. |
| `src/geo.js`, `src/setup*.js` | Country/region data and the first-run steps. |
| `src/reddit.js` | Optional, off-by-default Reddit AI tab with its own rate limits and back-off. |
| `src/background.js` | Background picture handling (resized local copy, never uploaded). |
| `src/updates.js` | Decides whether auto-update may run: only when the installer is code-signed (`publisherName` set). |

## Design decisions

- **No AI, no server.** Everything runs on the user's PC from public feeds, so there is nothing to trust or pay for, and nothing to leak.
- **Verification means "carried by 2+ independent trusted outlets", not truth.** It is a junk filter and is documented as such everywhere.
- **Idle cost matters.** Closing the window destroys the renderer process; only the main process and tray remain. CI measures idle RAM and CPU.
- **Untrusted input everywhere.** Feed text is sanitised and length-capped; links must be `https` without credentials and are re-checked before opening; settings are validated in the main process.
- **Updates need signing.** Windows checks that an update is signed by the same publisher as the installed app, so unsigned builds never update.

## Tests

`test/*.test.js` are fast unit tests run by `npm test`. `test/e2e.js` drives the installed app in CI. `test/soak.js` hunts memory growth. `scripts/live-test.js` fetches real feeds and reports the ranking.
