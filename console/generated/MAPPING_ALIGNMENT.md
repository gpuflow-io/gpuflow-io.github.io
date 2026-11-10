# 문서 정합성·적용 상태

2026-11-10 · 목업·소스·가공·화면 연결판 · revision 2026-11-10.7 · 검토 초안. 담당·제품 주기·평가 조건은 미팅 확정.

| 항목 | 정리 기준 |
| --- | --- |
| 갱신 | 현재 미리보기: API 목록 5초 조회·관계 1초 재평가·lease 15초. 저장 표본은 고정. 제품 갱신·수집 주기·step·캐시 TTL: 미정 — 글루시스·온라인파워스·기관 / 미팅. |
| 카탈로그 | gpuflow-kit e27f81f의 내장 catalog를 이번 매핑의 검수 기준으로 고정. telemetry-spec af28385와의 차이는 별도 동기화 검토. |
| 신규 후보 | policy.recommend는 kit 미등록 후보. gpuflow_host_prefetch_accuracy_ratio는 spec af28385에는 있고 kit e27f81f에는 없음. 기관 native 또는 추가 RFC로 확인하며 확정 심볼로 등록하지 않음. |
| 지연 지표 이름 | 원본 콘솔 문구의 gpuflow_storage_target_read_seconds를 등록된 gpuflow_storage_target_latency_seconds로 정정. 읽기 전용 해석은 op 라벨·원본 의미 확인 필요. |
| 원본 요소 누락 | ① Max wait/Alerts/Uplink는 POD 타일 내부 항목. 수치·필터 미구현을 잔여 작업에 기록. Top nodes·유형별 점유는 미산출 카드 표시. |
| 등록 CSV | 13행 api-screens는 사전 작성 초안. metrics/mappings는 확인된 표준 카탈로그 참조만 포함하며 기관 구현 완료·승인으로 간주하지 않음. |
| 기관 제어 | AWSM/HCI는 원본의 KETI 제공 제안. 실제 제공 버전·인증·필드는 기관 확인 대기. Rebuild/Rebalance 진행 조회와 실행 제어 분리. |
| 이전 문서 | 11/07 matrix·query evidence는 당시 검증 기록으로 보존. 현재 화면 범위는 매핑 보완판과 생성된 최신 matrix 사용. |
| 중계 | 로컬 reference adapter는 목록·LLM UI 연결 시험용. 기존 J 중계 교체·운영 배포 없음. GPU 시계열 endpoint는 reference에서 미구성으로 명시. |

카탈로그·이벤트 이름 존재는 실제 계측·발행·화면 표시 가능성의 증거가 아닙니다. 카탈로그 변경·J guard 변경·새 공용 proto/DB 스키마 변경은 이번 범위에 포함하지 않습니다.
