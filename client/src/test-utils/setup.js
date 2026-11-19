// Runs before every client test file (see `test.setupFiles` in vite.config.js).

// jsdom (the simulated browser) has no window.matchMedia. ThemeProvider uses it to read
// the OS dark-mode setting, so provide a stand-in that reports "light, no changes".
// jsdom has <dialog> but not showModal()/close(), which every real browser supports.
// Minimal stand-ins: toggle the `open` attribute and fire "close" like a browser does.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}
