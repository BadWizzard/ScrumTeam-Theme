(function () {
  const { DEFAULT_MODE, MODES } = self.SLTheme;
  const buttons = [...document.querySelectorAll('.modes button')];

  function render(mode) {
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  }

  chrome.storage.sync.get({ mode: DEFAULT_MODE }, (items) => render(items.mode));

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      if (!MODES.includes(mode)) return;
      chrome.storage.sync.set({ mode }, () => render(mode));
    });
  }
})();
