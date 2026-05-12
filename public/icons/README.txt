Place the following PNG icons here before deploying:

  icon-192.png            – 192 × 192   (any purpose)
  icon-512.png            – 512 × 512   (any purpose, also Apple Touch Icon)
  icon-512-maskable.png   – 512 × 512   (Android/PWA maskable, safe-zone padded)

These are referenced from /public/manifest.json and from the
<link rel="apple-touch-icon"> tags in index.html.

Quickest way to generate them:

  npx pwa-asset-generator ./public/favicon.svg ./public/icons \
      --icon-only --opaque false --maskable true --padding "10%" \
      --background "#c1272d"

That command produces all three PNGs from the SVG logo.
