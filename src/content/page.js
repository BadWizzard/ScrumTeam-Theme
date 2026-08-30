// Runs in the page's MAIN world (manifest `world: "MAIN"`), at document_start,
// so it can reach the page's own `ImageDecoder` and `HTMLImageElement` — the
// isolated world where content.js lives sees a separate copy of every global.
//
// Why: the site paints its photos (avatars, uploaded logos, picked-file
// previews) INSIDE the Flutter/CanvasKit canvas, where the inverse filter
// theme.css applies to real DOM images can't reach them, so they came out
// recolored along with the UI. The engine turns every raster image into a
// texture through one of two browser decoders, and both are wrapped here so
// the texture it uploads is already run through the inverse matrix
// (`#sl-matrix-inverse`, the same filter theme.css uses). The page filter
// then maps it straight back to the original pixels — M(M⁻¹(x)) = x — except
// where M⁻¹(x) falls outside [0, 1] and clamps, i.e. highlights brighter than
// the theme's text color, which come out capped at that brightness (a dimmed
// photo, not a negative).
//
//  - Bytes the app already holds (asset images, a picked file's preview) go
//    through WebCodecs `ImageDecoder.decode()`, one VideoFrame per frame.
//  - Images loaded by URL (every avatar / logo from the assets bucket, via
//    the engine's `createImageCodecFromUrl`) go through a detached
//    `<img crossOrigin="anonymous" decoding="async">`: the engine awaits
//    `img.decode()`, reads naturalWidth/Height and uses the element itself as
//    the texture source. Wrapping `decode()` lets us swap the element's `src`
//    to a corrected copy before the engine looks at it.
//
// The decoded textures live in Flutter's own image cache, which nothing
// outside the app can flush, so a *later* change of the transform leaves them
// prepared for the wrong matrix; `data-sl-images` tells content.js that
// this document holds such frames, and content.js reloads it on a theme
// change (see reloadForImages there). Vector assets (the app's SVG icons and
// logos) never pass through either decoder and keep following the UI recolor,
// which is what a dark theme wants from them.
(() => {
  const root = document.documentElement;
  let canvas = null;

  // `--sl-filter-inverse` is content.js's inline custom property on <html>:
  // `url("#sl-matrix-inverse")`, or 'none' when the theme is the identity or
  // its matrix is singular (nothing to correct with), or unset before the
  // theme is applied.
  function inverseFilter() {
    const v = root.style.getPropertyValue('--sl-filter-inverse').trim();
    return v && v !== 'none' ? v : null;
  }

  // Draws `source` through the inverse filter into the shared scratch canvas.
  function drawCorrected(source, w, h, filter) {
    if (!canvas) canvas = document.createElement('canvas');
    canvas.width = w; // also clears the bitmap and resets the 2d state
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.filter = filter;
    ctx.drawImage(source, 0, 0, w, h);
    return canvas;
  }

  function correctFrame(frame, filter) {
    drawCorrected(frame, frame.displayWidth, frame.displayHeight, filter);
    const init = { timestamp: frame.timestamp || 0 };
    if (frame.duration != null) init.duration = frame.duration;
    return new VideoFrame(canvas, init);
  }

  const NativeDecoder = window.ImageDecoder;
  if (typeof NativeDecoder === 'function') {
    class SLImageDecoder extends NativeDecoder {
      async decode(options) {
        const result = await super.decode(options);
        root.setAttribute('data-sl-images', '');
        const filter = inverseFilter();
        if (!filter) return result;
        try {
          const image = correctFrame(result.image, filter);
          result.image.close();
          return { image, complete: result.complete };
        } catch (e) {
          console.warn('[SL] could not pre-correct a decoded image', e);
          return result;
        }
      }
    }
    window.ImageDecoder = SLImageDecoder;
  }

  // The engine's codec images are never attached to the document and always
  // opt into CORS — that pair is the signature we act on. Anything else
  // (e.g. a real DOM <img>, which theme.css already handles) is left alone.
  const corrected = new WeakSet();
  const nativeDecode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = async function () {
    await nativeDecode.call(this);
    if (this.isConnected || this.crossOrigin !== 'anonymous' || corrected.has(this)) return;
    root.setAttribute('data-sl-images', '');
    const filter = inverseFilter();
    if (!filter) return;
    const w = this.naturalWidth;
    const h = this.naturalHeight;
    if (!w || !h) return;
    try {
      drawCorrected(this, w, h, filter);
      // toBlob throws SecurityError on a tainted canvas (the server sent no
      // CORS headers): the image then stays as decoded, i.e. recolored.
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
      );
      corrected.add(this);
      // Not revoked: the engine uploads the texture lazily, on first paint.
      this.src = URL.createObjectURL(blob);
      await nativeDecode.call(this);
    } catch (e) {
      console.warn('[SL] could not pre-correct an image element', e);
    }
  };
})();
