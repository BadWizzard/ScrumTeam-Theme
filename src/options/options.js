// Options page: per-theme live preview, readability hint, debounced auto-save,
// per-theme and global reset. See docs/superpowers/specs/2026-08-24-theme-
// customization-and-store-readiness-design.md ("Options page" section) for
// the full contract.
(function () {
  const { DEFAULT_THEMES, DEFAULT_SETTINGS } = SL.defaults;
  const { normalizeTheme } = SL.settings;
  const { isHex, contrastRatio } = SL.color;
  const { buildFilter } = SL.filter;
  const store = SL.store;

  const SAVE_DEBOUNCE_MS = 400;
  const NAMES = ['dark', 'light'];

  const status = document.getElementById('status');
  const saveTimers = {};
  // Snapshot of the theme to save, captured at schedule time (and
  // re-captured on every subsequent edit before the debounce fires), so the
  // eventual save always writes the exact value the user last typed — never
  // a late read of `state[name]` that something else may have touched.
  const pendingTheme = {};
  const savesInFlight = { dark: 0, light: 0 };
  // Last known-good theme per card. Read/written instead of the DOM so an
  // in-progress invalid hex edit never leaks into a save or a preview.
  const state = {};

  function els(name) {
    const card = document.querySelector(`section[data-theme="${name}"]`);
    return {
      card,
      bgColor: card.querySelector('input[type="color"][data-field="background"]'),
      bgHex: card.querySelector('input[type="text"][data-field="background"]'),
      textColor: card.querySelector('input[type="color"][data-field="text"]'),
      textHex: card.querySelector('input[type="text"][data-field="text"]'),
      contrast: card.querySelector('input[data-field="contrast"]'),
      contrastOutput: card.querySelector('output[for="' + name + '-contrast"]'),
      saturation: card.querySelector('input[data-field="saturation"]'),
      saturationOutput: card.querySelector('output[for="' + name + '-saturation"]'),
      keepColors: card.querySelector('input[data-field="keepColors"]'),
      hint: card.querySelector('p.hint.readability'),
      preview: card.querySelector('.preview'),
      previewImage: card.querySelector('.preview-image'),
      matrix: card.querySelector(`#sl-matrix-${name} feColorMatrix`),
      inverseMatrix: card.querySelector(`#sl-matrix-${name}-inverse feColorMatrix`),
      resetTheme: card.querySelector('.reset-theme'),
    };
  }

  const cards = { dark: els('dark'), light: els('light') };

  function setStatus(text, stateName) {
    status.textContent = text;
    if (stateName) status.dataset.state = stateName;
    else delete status.dataset.state;
  }

  // True while a card has local state that hasn't (yet) been fully
  // reconciled with storage: a debounced save waiting to fire, a save
  // in flight, or an invalid hex string sitting uncommitted in an input.
  // A render triggered by SL.store.onChange must skip such a card so it
  // never clobbers an edit the user is still mid-typing on another card's
  // save landing, or wipes an aria-invalid hex back to the stored value.
  function isPending(name) {
    const e = cards[name];
    return (
      !!saveTimers[name] ||
      savesInFlight[name] > 0 ||
      e.bgHex.getAttribute('aria-invalid') === 'true' ||
      e.textHex.getAttribute('aria-invalid') === 'true'
    );
  }

  function updateHint(name, theme) {
    const e = cards[name];
    if (theme.background === theme.text) {
      e.hint.textContent = 'Background and text are the same color — the page will be unreadable';
      return;
    }
    const ratio = contrastRatio(theme.background, theme.text);
    e.hint.textContent =
      ratio !== null && ratio < 4.5 ? `Low contrast (${ratio.toFixed(1)}:1) — text may be hard to read` : '';
  }

  function updatePreview(name, theme) {
    const e = cards[name];
    const f = buildFilter(theme, `sl-matrix-${name}`);
    e.matrix.setAttribute('values', f.matrix.join(' '));
    e.inverseMatrix.setAttribute('values', f.inverseMatrix.join(' '));
    e.preview.style.filter = f.css;
    e.previewImage.style.filter = f.inverseCss;
    updateHint(name, theme);
  }

  function scheduleSave(name) {
    // Snapshot now: this is exactly what gets written when the debounce
    // fires, even if state[name] is later touched by something else.
    pendingTheme[name] = { ...state[name] };
    clearTimeout(saveTimers[name]);
    saveTimers[name] = setTimeout(() => {
      saveTimers[name] = null;
      const theme = pendingTheme[name];
      savesInFlight[name]++;
      store
        .save({ themes: { [name]: theme } })
        .then(() => setStatus('Saved'))
        .catch((err) => setStatus('Not saved — ' + err.message, 'error'))
        .finally(() => {
          savesInFlight[name]--;
        });
    }, SAVE_DEBOUNCE_MS);
  }

  function commit(name, patch) {
    state[name] = { ...state[name], ...patch };
    updatePreview(name, state[name]);
    scheduleSave(name);
  }

  function renderCard(name, theme) {
    const e = cards[name];
    state[name] = theme;

    e.bgColor.value = theme.background;
    e.bgHex.value = theme.background;
    e.bgHex.removeAttribute('aria-invalid');

    e.textColor.value = theme.text;
    e.textHex.value = theme.text;
    e.textHex.removeAttribute('aria-invalid');

    e.contrast.value = theme.contrast;
    e.contrastOutput.textContent = theme.contrast;

    e.saturation.value = theme.saturation;
    e.saturationOutput.textContent = theme.saturation;

    e.keepColors.checked = theme.keepColors;

    updatePreview(name, theme);
  }

  // Full, unconditional render of both cards — used for explicit user
  // actions (initial load, per-theme reset, reset-all) where overwriting
  // whatever was in the fields is exactly the intent.
  function render(settings) {
    for (const name of NAMES) {
      renderCard(name, normalizeTheme(settings.themes[name], DEFAULT_THEMES[name]));
    }
  }

  // Render triggered by SL.store.onChange (our own saves landing, or a
  // change from another tab/the popup): skip any card that still has
  // pending local edits so it never gets clobbered mid-flight.
  function renderFromChange(settings) {
    for (const name of NAMES) {
      if (isPending(name)) continue;
      renderCard(name, normalizeTheme(settings.themes[name], DEFAULT_THEMES[name]));
    }
  }

  function bindHexInput(name, field, hexInput, colorInput) {
    hexInput.addEventListener('input', () => {
      const v = hexInput.value;
      if (!isHex(v)) {
        hexInput.setAttribute('aria-invalid', 'true');
        return;
      }
      hexInput.removeAttribute('aria-invalid');
      const normalized = v.toLowerCase();
      colorInput.value = normalized;
      commit(name, { [field]: normalized });
    });
  }

  function bindColorInput(name, field, colorInput, hexInput) {
    colorInput.addEventListener('input', () => {
      const v = colorInput.value;
      hexInput.value = v;
      hexInput.removeAttribute('aria-invalid');
      commit(name, { [field]: v });
    });
  }

  function bindRange(name, field, range, output) {
    range.addEventListener('input', () => {
      output.textContent = range.value;
      commit(name, { [field]: Number(range.value) });
    });
  }

  function bindCheckbox(name, field, checkbox) {
    checkbox.addEventListener('change', () => {
      commit(name, { [field]: checkbox.checked });
    });
  }

  function bindCard(name) {
    const e = cards[name];
    bindHexInput(name, 'background', e.bgHex, e.bgColor);
    bindColorInput(name, 'background', e.bgColor, e.bgHex);
    bindHexInput(name, 'text', e.textHex, e.textColor);
    bindColorInput(name, 'text', e.textColor, e.textHex);
    bindRange(name, 'contrast', e.contrast, e.contrastOutput);
    bindRange(name, 'saturation', e.saturation, e.saturationOutput);
    bindCheckbox(name, 'keepColors', e.keepColors);

    e.resetTheme.addEventListener('click', () => {
      store
        .save({ themes: { [name]: DEFAULT_THEMES[name] } })
        .then((settings) => {
          setStatus('Saved');
          render(settings);
        })
        .catch((err) => setStatus('Not saved — ' + err.message, 'error'));
    });
  }

  for (const name of NAMES) bindCard(name);

  document.getElementById('reset-all').addEventListener('click', () => {
    store
      .save(DEFAULT_SETTINGS)
      .then((settings) => {
        setStatus('Saved');
        render(settings);
      })
      .catch((err) => setStatus('Not saved — ' + err.message, 'error'));
  });

  store
    .load()
    .then(render)
    .catch((err) => setStatus('Not loaded — ' + err.message, 'error'));
  store.onChange(renderFromChange);
})();
