# Architecture and migration boundary

- Static UI/data: root `index.html`, `assets/`, `data/`, `manifest.webmanifest`, `sw.js`.
- Data generation: `tools/` (`build-data.mjs`, `expand-enko.mjs`) plus their co-located source files (`kengdic.tsv`, `freq_en.txt`, `ipa_en_uk.txt`, `ipa_en_us.txt`). The scripts read sources from their own directory and write to `../data/`, so the sources must stay beside the scripts.
- API: `worker/src/index.js`, `worker/wrangler.toml`; deploy from `worker/`.

Keep published data paths and the Worker name stable. Build scripts may later be wrapped by domain tools, but generated JSON must pass validation before publication. Agent tools should expose dictionary lookup and data-build operations separately.
