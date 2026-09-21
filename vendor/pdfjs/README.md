# PDF preview runtime

Mozilla PDF.js / `pdfjs-dist` 6.3.289, Apache-2.0. Bundled from the npm distribution's `legacy/build/pdf.mjs` and `legacy/build/pdf.worker.mjs` with esbuild, format IIFE, globals `pdfjsLib` and `pdfjsWorker`, minified. Preserve the adjacent license files.

Loaded lazily from local files; no CDN, uploads or remote parsing. The worker module is exposed for PDF.js's in-page fallback to also support a static file-based prototype. Only canvas page rendering is used, without scripting, forms, annotations or remote navigation. This is not a production sandbox for hostile documents.
