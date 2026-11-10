# 기존 API 4개 화면 매핑

2026-11-10 · 매핑 보완판 3 · revision 2026-11-10.6 · 검토 초안. 담당·제품 주기·평가 조건은 미팅 확정.

| 화면 | 요청 | 필드 | 응답·표시 상태 |
| --- | --- | --- | --- |
| ⑨ | GET /v1/policies | policy, name, from_tier, to_tier, rule, owner, workload_id, active, updated_at, updated_ns | LLM: 고정 mock, 정상/근거 없음/HTTP504. 목록: items[].data/provenance/quality, next_cursor, backend. API 존재·UI 연결·실측 검증은 별도. |
| ⑨ | GET /v1/policy-history | id, event_key, policy, ts, ts_ns, active, actor, role, reason, span_id, attrs | LLM: 고정 mock, 정상/근거 없음/HTTP504. 목록: items[].data/provenance/quality, next_cursor, backend. API 존재·UI 연결·실측 검증은 별도. |
| ⑬ | GET /v1/scorecard-runs | id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs | LLM: 고정 mock, 정상/근거 없음/HTTP504. 목록: items[].data/provenance/quality, next_cursor, backend. API 존재·UI 연결·실측 검증은 별도. |
| ⑦ | POST /v1/llm/explain | question_id, scenario, mock, response, evidence, request_id | LLM: 고정 mock, 정상/근거 없음/HTTP504. 목록: items[].data/provenance/quality, next_cursor, backend. API 존재·UI 연결·실측 검증은 별도. |

정책 주키는 `policy`이며 스코어카드 연결 필드는 `indicator`입니다. workload_id를 키로 한 새 상세 API를 가정하지 않습니다. 목록은 같은 page_size/조건으로 cursor 끝까지 읽고 반복 cursor·중간 오류·조회 상한 초과는 완전한 결과로 처리하지 않습니다. HTTP 401/400/5xx와 빈 정상 응답을 구분합니다.

저장된 HTML의 정책·스코어카드 응답은 **합성 계약 fixture**이며 DB 캡처가 아닙니다. LLM은 기존 고정 fixture입니다. 기존 11/07 API 호출 검증 기록은 당시 이력이며 현재 상태를 증명하지 않습니다.

현재 미리보기: API 목록 5초 조회·관계 1초 재평가·lease 15초. 저장 표본은 고정. 제품 갱신·수집 주기·step·캐시 TTL: 미정 — 글루시스·온라인파워스·기관 / 미팅.
