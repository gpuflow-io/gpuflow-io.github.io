# ②·③·④ 실측 검토 미리보기

2026-11-10 · Draft 검토본. 공개 Pages의 main 배포와 별개입니다.

② 결과 검증, ③ DAOS→호스트→GPU 경로, ④ 정상·입력 지연·실패 비교를 검토합니다. 내부 미리보기에서 확인한 코드를 포함하며, 접속 주소·토큰·서버 자격증명·내부 중계 서버는 포함하지 않습니다.

## 접속 없이 미리보기

Python 3과 Node.js 20 이상을 사용합니다. 저장소 루트에서 실행합니다.

```bash
python3 console/build_review_preview.py output/batch-review.html \
  --snapshot console/samples/batch-observation.redacted.json \
  --workload sample-batch-delayed --screen analysis
node --test console/tests/*-unit.cjs console/tests/redacted-sample.cjs
```

생성된 `output/batch-review.html`을 브라우저로 엽니다. 외부 폰트를 불러오지 못해도 기본 글꼴로 표시됩니다. 검토 중 **저장된 테스트베드 관측**을 유지합니다. 실시간 조회는 별도로 승인된 내부 미리보기에서만 가능하며 이 저장소에 운영 서버·토큰은 없습니다.

샘플은 실제 읽기/GPU 커널 검증의 수치와 시각을 보존하고 장비·작업·저장소 식별자를 치환한 과거 표본입니다. `redacted`와 `sample_notice`를 유지합니다. 원천 provenance는 실측으로 남기지만, 치환된 식별자를 실제 API/VM 필터로 쓰거나 현재 상태라고 해석하지 않습니다. 실행기 원본 데이터나 독립 재실행 증명은 포함하지 않습니다.

## 화면 확인

1. ④에서 정상 8/8·지연 8/8·실패 2/6과 성공 배치 평균, 실패 batch 3의 부분 시간을 비교합니다.
2. ③ 경로 보기에서 단계별 성공 합계와 데이터 출처·시각을 확인합니다.
3. ② 상세에서 배치 결과 검증과 실행 전 구성원 등록 연결, 종료 시 구성원 미확인을 구분합니다.
4. 연동 검토 모드의 W04-01에서 필드·계산·미결 사항을 확인합니다. 검토 기록은 브라우저에 저장되며 JSON/CSV/Markdown으로 내보낼 수 있습니다.

시나리오 모드는 기존 목업입니다. 실측 보기의 ①~④ 외 화면은 시나리오이며 GPU data wait·스케줄러 할당·자동 병목·예측·정책 적용은 이번 검증 범위가 아닙니다. 실측 비교의 평균값을 통계적 성능 결론으로 해석하지 않습니다.

## 제품 연결

[온라인파워스 화면–API 가이드](https://github.com/gpuflow-io/onlinepowers-integration/pull/3)의 최신 전달 문서를 기준으로 협의합니다. 업무 데이터는 기존 API, GPU 시계열은 승인된 VM 직접 조회를 사용합니다. `testbed.js`가 호출하는 `/testbed-api/*`는 내부 미리보기 어댑터이며 새 외부 제품 계약이 아닙니다.

현재 standalone 샘플에는 GPU 시계열을 넣지 않았습니다. ② 그래프의 저장 시계열 없음은 배치 계측 실패가 아닙니다. 테스트베드 raw 보존 기간이 지난 실행 역시 같은 구분이 필요합니다.

## 검증 범위

순수 판정 69개와 치환 샘플 6개 검증을 수행합니다. 로컬 브라우저 테스트는 Playwright와 Chromium이 있는 환경에서 `PUBLIC_PREVIEW_FILE`에 생성된 HTML 절대 경로를 지정해 `node console/tests/handoff-browser.cjs`로 실행합니다. 기존 시나리오 검토 회귀는 로컬 HTTP 서버와 `console/tests/review-browser.cjs`로 확인합니다. CI는 PR과 main push에서 순수 판정·샘플 75개 검사와 standalone HTML 빌드를 수행합니다. 브라우저 검증은 로컬 별도 실행입니다. 실제 장비·담당자 접속·브라우저 인수와 구분합니다.
