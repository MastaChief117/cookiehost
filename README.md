# CookieHost 🍪

A deliberately ridiculous static web experiment: select a small text-only website, compress it in the browser, split it into cookies, and reconstruct it at `/loadsite`.

## Run it

This is static-only. Any static server works. For a quick local test:

```bash
npx serve .
```

Open the URL it prints, select a folder containing `index.html`, CSS, and JavaScript, then bake it. The app uses root-relative links, so deploy the files at the domain root for `/loadsite` to work.

## Supported files

HTML, CSS, JavaScript, JSON, TXT, and SVG. Other files are shown as **UNSUPPORTED** and baking is blocked until they are removed. V1 does not upload or store anything on a server. The "continue without these" behavior is represented by removing unsupported files from the selection; because the browser file picker cannot edit its own selection, choose the folder again without those files.

## Notes

- Cookies are deliberately limited to 3,000 characters per chunk.
- Cookies expire after one year and use `Path=/; SameSite=Lax`.
- The builder verifies every expected cookie after writing.
- The loader prefers `index.html`, then the first HTML file.
- Local CSS and JavaScript references are inlined. External URLs remain external.
- Uploaded JavaScript intentionally runs in the reconstructed page. Bake only files you trust.
