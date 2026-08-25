(function () {
  const { MODES } = SL.defaults;
  const buttons = [...document.querySelectorAll('.modes button[data-mode]')];
  const status = document.getElementById('status');
  const openOptions = document.getElementById('open-options');

  let current = null;

  function render(settings) {
    current = settings;
    for (const b of buttons) {
      b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
    }
  }

  function clearStatus() {
    status.textContent = '';
    delete status.dataset.state;
  }

  SL.store.load().then(render);

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      if (!MODES.includes(mode)) return;
      const previous = current;
      SL.store
        .save({ mode })
        .then((settings) => {
          clearStatus();
          render(settings);
        })
        .catch((err) => {
          status.textContent = 'Not saved — ' + err.message;
          status.dataset.state = 'error';
          render(previous);
        });
    });
  }

  openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
})();
