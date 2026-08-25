// Applies html[data-sl-theme="dark"] on teams.scrumlaunch.com according to the saved mode.
(function () {
  const { resolveTheme, DEFAULT_MODE } = self.SLTheme;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let currentMode = DEFAULT_MODE;

  function apply() {
    const theme = resolveTheme(currentMode, media.matches);
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-sl-theme', 'dark');
    else root.removeAttribute('data-sl-theme');
  }

  chrome.storage.sync.get({ mode: DEFAULT_MODE }, (items) => {
    currentMode = items.mode;
    apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.mode) {
      currentMode = changes.mode.newValue || DEFAULT_MODE;
      apply();
    }
  });

  media.addEventListener('change', apply);
})();
