# Architecture and migration boundary

- Static UI/data: root `index.html`, `assets/`, `data/`, `manifest.webmanifest`, `sw.js`.
- Data generation: `scripts/` (`build-data.mjs`, `expand-enko.mjs`).
- API: `worker/src/index.js`, `worker/wrangler.toml`; deploy from `worker/`.

Keep published data paths and the Worker name stable. Build scripts may later be wrapped by domain tools, but generated JSON must pass validation before publication. Agent tools should expose dictionary lookup and data-build operations separately.
