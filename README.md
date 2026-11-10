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

The console includes an optional Korean widget-to-metric/API review mode for meetings.
See [console review guide](console/REVIEW.md) for local notes, exports and browser tests.

## License

Apache License 2.0. See [LICENSE](LICENSE).

## 실측 화면 검토 (Draft)

[②·③·④ 검토 가이드](console/HANDOFF.md)에서 식별자를 치환한 실측 샘플과 standalone 미리보기 생성 방법을 확인합니다. 이 브랜치의 변경은 main의 공개 Pages 배포와 별개입니다.
