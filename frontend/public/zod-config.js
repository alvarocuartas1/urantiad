// Loaded before the app bundle (see index.html). Zod reads this global config when it loads
// and, at that moment, decides whether to compile validators with `new Function`. The
// production Content-Security-Policy forbids eval: even though Zod catches the error and
// falls back, the browser reports every attempt as a CSP violation. `jitless` skips it.
globalThis.__zod_globalConfig = { ...globalThis.__zod_globalConfig, jitless: true }
