# CookieHost

CookieHost is a deliberately ridiculous browser-only experiment: upload a small text-only website, compress it in-browser, split it into cookie-sized chunks, store those chunks as cookies, and reconstruct the site on `/loadsite.html`.

This is intentionally not production hosting. The point is the joke: the website lives in cookies.

## Features

- Upload multiple text-only website files
- Strict file filtering for supported extensions
- Browser-side gzip compression
- Base64 encoding
- Cookie chunking and storage verification
- Reconstructing and rendering the uploaded site
- Inline local CSS and JS for the baked website
- Error handling for missing cookies, corrupted data, storage limits, and invalid packages

## Supported files

- HTML
- CSS
- JavaScript
- JSON
- TXT
- SVG

## Unsupported files

- PNG
- JPG/JPEG
- GIF
- WebP
- AVIF
- ICO
- fonts
- audio
- video
- PDF
- ZIP

## Run locally

Because this is static and browser-based, you can run it from any simple static web server.

For example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Notes

- This app stores the website in browser cookies only.
- It is meant for tiny text-only sites.
- Cookie limits are real, so large websites will fail.
- JavaScript in the uploaded site will run when reconstructed. Only bake files you trust.

## Structure

```text
cookiehost/
├── index.html
├── app.js
├── loadsite.html
├── style.css
├── README.md
```
