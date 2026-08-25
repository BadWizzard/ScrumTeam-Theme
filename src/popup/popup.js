(function () {
  const { MODES } = SL.defaults;
  const buttons = [...document.querySelectorAll('.modes button[data-mode]')];
  const status = document.getElementById('status');
  const openOptions = document.getElementById('open-options');

  let current = null;
  let saving = false;

  function render(settings) {
    if (!settings) return;
    current = settings;
    for (const b of buttons) {
      b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
    }
  }

  function setButtonsDisabled(disabled) {
    for (const b of buttons) b.disabled = disabled;
  }

  function clearStatus() {
    status.textContent = '';
    delete status.dataset.state;
  }

  // Buttons stay disabled until the initial load resolves, so a click can
  // never race render() with a null/undefined settings object.
  setButtonsDisabled(true);
  SL.store
    .load()
    .then((settings) => {
      render(settings);
      setButtonsDisabled(false);
      // Settle signal for the e2e suite: the initial load has finished, so a
      // test may now seed storage without racing this page's own startup.
      window.__slReady = true;
    })
    .catch((err) => {
      console.warn('[SL] load failed', err);
      // Buttons deliberately stay disabled: there is no known-good `current`
      // to save a patch against.
      window.__slReady = true;
    });

  for (const b of buttons) {
    b.addEventListener('click', () => {
      // Guard against clicks before the initial load resolves and against
      // overlapping saves (buttons are disabled while one is in flight, but
      // belt-and-braces here too).
      if (!current || saving) return;
      const mode = b.dataset.mode;
      if (!MODES.includes(mode)) return;

      saving = true;
      setButtonsDisabled(true);
      SL.store
        .save({ mode })
        .then((settings) => {
          clearStatus();
          render(settings);
        })
        .catch((err) => {
          status.textContent = 'Not saved — ' + err.message;
          status.dataset.state = 'error';
          // Re-render the latest known-good settings, not a pre-save
          // snapshot, so a failed save after a successful one doesn't
          // revert the UI past what storage actually holds.
          render(current);
        })
        .finally(() => {
          saving = false;
          setButtonsDisabled(false);
        });
    });
  }

  openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
})();
