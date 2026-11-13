# ①~⑬ 전체 화면 검토 미리보기

2026-11-13 · Draft 검토본. 공개 Pages의 main 배포와 별개입니다.

① 전체 현황부터 ⑬ KPI까지 **목업에서 보여줄 것 → 기관이 제공할 소스 → 글루시스 가공·제공 결과 → 온라인파워스 화면 연결** 순서로 검토합니다. 56개 위젯과 전역 범위 바에 현재 구현·추가 필요·기관 확인 사항을 구분했습니다. 저장된 실측 이력은 구현 근거로 함께 확인합니다.

## 접속 없이 미리보기

GitHub Actions에서 **Console review contract → 성공한 실행 → Summary → Artifacts → gpuflow-console-preview**를 클릭하면 ZIP을 받을 수 있습니다. 실행 요약의 미리보기 다운로드 링크도 사용할 수 있습니다. GitHub 로그인 후 ZIP을 풀고 `batch-review.html`을 브라우저로 엽니다. Artifact 보관 기간은 30일입니다. 이 업로드 단계가 추가되기 전 실행에는 Artifact가 없습니다.

Python 3과 Node.js 20 이상을 사용합니다. 저장소 루트에서 실행합니다.

```bash
python3 console/build_review_preview.py output/batch-review.html \
  --snapshot console/samples/storage-metrics-observation.redacted.json \
  --workload sample-batch-delayed --screen overview --meeting
node --test console/tests/*-unit.cjs console/tests/redacted-sample.cjs
```

생성된 `output/batch-review.html`을 브라우저로 엽니다. 목업과 역할 패널이 먼저 열립니다. 각 위젯을 클릭하거나 바로가기에서 선택하고, **현재 화면 역할표**로 해당 화면의 연결 관계를 함께 봅니다. API·필드·계산식은 **개발 상세**를 펼쳐 확인합니다. 데이터 보기를 **저장된 테스트베드 관측**으로 바꾸면 실제 구현 근거와 차이를 확인할 수 있습니다. 외부 폰트 없이도 기본 글꼴로 표시됩니다. 실시간 조회는 별도로 승인된 내부 미리보기에서만 가능합니다.

기관 소스가 미확인인 항목은 후보로 표시했습니다. 가공 결과의 제안은 새 API나 파생 지표의 구현 완료를 뜻하지 않습니다. W01-05의 제품 활성 워크로드 수와 현재 데모의 GPU 연결 확인 작업 수는 구분합니다. 시계열은 온라인파워스 백엔드의 VM 직접 조회 방향을 유지합니다.

샘플은 실제 읽기/GPU 커널 검증의 수치와 시각을 보존하고 장비·작업·저장소 식별자를 치환한 과거 표본입니다. `redacted`와 `sample_notice`를 유지합니다. 원천 provenance는 실측으로 남기지만, 치환된 식별자를 실제 API/VM 필터로 쓰거나 현재 상태라고 해석하지 않습니다. 실행기 원본 데이터나 독립 재실행 증명은 포함하지 않습니다.

## 최신 매핑 보완판

검토 위젯은 기존 ID를 유지하여 56개로 확장했습니다. ⑤~⑬ 위젯과 ⑬ KPI 10행을 항목별로 검토할 수 있습니다.

- [전체 화면–위젯 매핑·잔여 항목](generated/FULL_SCREEN_WIDGET_MAP.md)
- [회의용 소스·가공·화면 연결표](generated/SOURCE_PROCESSING_UI_MAP.md), [56행 CSV](generated/source-processing-ui.csv)
- [기존 API 4개 필드 매핑](generated/EXISTING_API_MAP.md)
- [KPI 10행·산식·검증 주체](generated/KPI_ROW_MAP.md)
- [문서 정합성](generated/MAPPING_ALIGNMENT.md), [카탈로그 차이](CATALOG_ALIGNMENT.md)

⑦은 기존 Q01~Q03 고정 mock을 선택해 normal/no_evidence/timeout 표시를 확인합니다. ⑨ 정책·이력과 ⑬ scorecard의 내장 예시는 합성 계약 fixture이며 DB 캡처가 아닙니다. 실측 batch 표본의 출처와 혼합하지 않습니다.

로컬 중계 참조 구현 `review_preview_server.py`는 `--api-url`, `--token-file`, `--port`로 실행합니다. API URL·토큰 파일은 로컬에서 제공하며 브라우저에 Bearer를 전달하지 않습니다. 기존 목록 3종과 LLM을 중계하고, GPU 시계열 중계는 별도 미구성(503)입니다. 기존 J 중계 교체·운영 배포를 의미하지 않습니다.

## 화면 확인

회의에서는 목업의 요구사항을 먼저 확인하고, 원천 담당/샘플 → 글루시스 가공 결과 → 온라인파워스 연결 → 담당/기한 순서로 결정합니다. 아래 실측 검증은 데이터 보기를 **저장된 테스트베드 관측**으로 바꾼 뒤 진행합니다.

1. 첫 화면 ①에서 클러스터·컴퓨트 장비 POD·랙·노드 필터, POD 요약, 회색 GPU 히트맵과 스토리지 등록 구성을 확인합니다. 랙 미등록·대기율 미계측은 실제 결손이며 0이 아닙니다.
2. ④에서 정상 8/8·지연 8/8·실패 2/6과 성공 배치 평균, 실패 batch 3의 부분 시간을 비교합니다.
3. ③ 경로 보기에서 단계별 성공 합계와 데이터 출처·시각을 확인합니다.
4. ② 상세에서 배치 결과 검증과 실행 전 구성원 등록 연결, 종료 시 구성원 미확인을 구분합니다.
5. 연동 검토 모드의 W04-01에서 필드·계산·미결 사항을 확인합니다. 검토 기록은 브라우저에 저장되며 JSON/CSV/Markdown으로 내보낼 수 있습니다.

⑤~⑬도 저장된 관측 모드를 유지합니다. ⑥은 등록 구성과 별도 시각의 DAOS 처리량, ⑧은 표본의 등록 구성을 표시하고, 미연동 위젯은 필요한 원천·연동 조건을 명시합니다. 각 페이지의 **시나리오 목업 보기** 또는 상단 데이터 보기로 전환하면 기존 목업을 검토할 수 있습니다. 시나리오 조작은 브라우저 내부에서만 동작합니다. GPU data wait·스케줄러 할당·자동 병목·예측·정책 적용은 이번 실측 검증 범위가 아닙니다. 실측 비교의 평균값을 통계적 성능 결론으로 해석하지 않습니다.

## 제품 연결

[온라인파워스 화면–API 가이드](https://github.com/gpuflow-io/onlinepowers-integration/pull/3)의 최신 전달 문서를 기준으로 협의합니다. 업무 데이터는 기존 API, GPU·스토리지 시계열은 승인된 VM 직접 조회를 사용합니다. `testbed.js`가 호출하는 `/testbed-api/*`는 내부 미리보기 어댑터이며 새 외부 제품 계약이 아닙니다.

현재 standalone 샘플에는 GPU 시계열을 넣지 않았습니다. ② 그래프의 저장 시계열 없음은 배치 계측 실패가 아닙니다. 테스트베드 raw 보존 기간이 지난 실행 역시 같은 구분이 필요합니다.

## 검증 범위

순수 판정·매핑·치환 샘플 117개 검증을 수행합니다. 로컬 브라우저 테스트는 Playwright와 Chromium이 있는 환경에서 `PUBLIC_PREVIEW_FILE`에 생성된 HTML 절대 경로를 지정해 `node console/tests/handoff-browser.cjs`로 실행합니다. 기존 시나리오 검토 회귀는 로컬 HTTP 서버와 `console/tests/review-browser.cjs`로 확인합니다. CI는 PR과 main push에서 순수 판정·샘플 117개와 Python 19개 검사와 standalone HTML 빌드를 수행합니다. 브라우저 검증은 로컬 별도 실행입니다. 실제 장비·담당자 접속·브라우저 인수와 구분합니다.

전체 페이지 회귀는 같은 환경에서 `node console/tests/all-pages-browser.cjs`로 실행합니다. 13개 화면 × 관측/시나리오 × 데스크톱/모바일, 56개 위젯의 관측 모드 검토 연결·LLM 9개 상태·KPI 10행과 오프라인 실패 표시를 검사합니다. [페이지별 검수 결과](ALL_PAGES_REVIEW.md)를 함께 확인하세요.

매핑 생성·검사: `python3 console/sync_mapping_docs.py --check`. HTTP 중계 회귀: `python3 -m unittest discover -s console/tests -p "test_*.py" -v`. 실제 J 데이터·접속은 별도 인수 대상입니다.

이전 revision 2026-11-10.7: 56개 위젯의 목업·소스·가공·화면 연결과 공통 Period/Role/논리 범위 책임을 제공합니다. JSON/CSV/Markdown 내보내기에 연결 내용과 회의 메모가 함께 들어갑니다. 이전 revision의 브라우저 회의 기록을 이어 읽습니다.

회의 보기 회귀는 `--meeting`으로 만든 파일에 `node console/tests/source-flow-browser.cjs`를 실행합니다. 관측 기준 기존 브라우저 회귀는 `--meeting` 없이 만든 파일로 실행합니다.

## 2026-11-13.1 DAOS 처리량 추가

`storage-review.html`은 ⑥에서 시작합니다. 직접 빌드할 때 `--screen storage`를 사용합니다. 15분 동안 수집된 4개 시리즈의 rate와 node/rank/target/pool 필터를 확인합니다. 표본은 유휴 실측 0 B/s이며 부하 성능 검증이 아닙니다. 기존 등록·배치 자료와 서로 다른 관측 시각을 표시합니다. 상세 의미·원천/가공/화면 책임·조회 예제는 [DAOS 처리량 연결](STORAGE_OBSERVATION.md)을 확인하세요.

로컬 참조 서버의 선택 옵션 `--vm-url`(raw base)과 `--storage-cluster`를 함께 주면 `/testbed-api/storage-series`가 고정 읽기 조회를 수행합니다. 토큰과 서버 주소는 브라우저에 전달하지 않습니다. J 서비스에는 배포하지 않았습니다. 브라우저 검증은 `--screen storage` 빌드에 `node console/tests/storage-browser.cjs`를 실행합니다.

## 2026-11-13.2 실제 부하 후속 검증

기본 빌드/CI 표본을 실제 쓰기·읽기 시험으로 갱신했다. 16 MiB × 8파일을 쓰고 읽어 해시를 확인했으며 4시리즈가 증가 후 유휴로 돌아온다. ⑥에는 최신값과 구간 최대, 시험 단계/정리 결과를 함께 표시한다. 초기 유휴 표본은 별도 파일로 보존한다. [부하 검증 상세](STORAGE_LOAD_VALIDATION.md)를 참고한다.

## 2026-11-14.1 RPC 처리율·원천 지연·VOS 용량

⑥에 VM 기반 fetch/update RPC/s와 원천 캡처 기반 크기별 지연 참고 평균·VOS 매체별 용량을 추가했다. 지연·용량은 VM/제품 API에 연결되지 않았다. 과거 부하 캡처를 재사용했으며 p95/p99를 계산하지 않는다. [의미·검증·연결 경계](STORAGE_METRICS.md)를 기준으로 검토한다. `/testbed-api/storage-ops`는 선택 설정된 로컬 참조 서버의 고정 VM 조회이며 새 제품 API가 아니다.
