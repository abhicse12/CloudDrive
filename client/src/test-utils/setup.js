// Runs before every client test file (see `test.setupFiles` in vite.config.js).

// jsdom (the simulated browser) has no window.matchMedia. ThemeProvider uses it to read
// the OS dark-mode setting, so provide a stand-in that reports "light, no changes".
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}
