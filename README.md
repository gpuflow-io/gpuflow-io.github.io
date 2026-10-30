# gpuflow-io.github.io

Source for the GPUFlow project homepage: <https://gpuflow-io.github.io>

GPUFlow is a Korean national R&D project (2026–2028) building ultra-high-bandwidth parallel storage software
with an accelerator-initiated, zero-copy data path for AI computing.

## Structure

```
index.html         single-page site
assets/style.css   styles (light/dark via prefers-color-scheme)
assets/logo.svg    logo / favicon
.nojekyll          serve files as-is (no Jekyll build)
```

## Publishing

GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
