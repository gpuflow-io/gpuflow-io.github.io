# 지연·VOS 용량 중앙 수집 추가 설계 — 검토용

이번 산출물은 **설계안**이다. collector 설정·공통 validator·toolkit 회귀·자원 실측까지 완료한 배포 패키지는 아니다. 현 J는 원천 지연·용량을 keep 목록에서 제외하고 있으며 해당 VM 시리즈가 없음을 읽기 조회로 확인했다. 원본 exporter에는 지표가 있다.

## 제안 경로

기관 exporter 유지 → A/B 로컬 node-agent에서 선택 원천을 native 이름으로 매핑 → 기존 중앙 guard 검증 → vm-raw → 조회·품질 판정 → 온라인파워스 화면. 중앙에서 기관 exporter를 원격 scrape하는 구조로 바꾸지 않는다.

| 원천 | native 이름 제안 | 타입·단위 변환 | 추가 원천 차원 |
|---|---|---|---|
| engine_io_latency_fetch_sum | gpuflow_gluesys_engine_io_latency_fetch_seconds_total | counter, µs × 1e-6 → seconds | rank,target,size |
| engine_io_latency_update_sum | gpuflow_gluesys_engine_io_latency_update_seconds_total | counter, µs × 1e-6 → seconds | rank,target,size |
| engine_io_latency_fetch_samples | gpuflow_gluesys_engine_io_latency_fetch_observations_total | counter, 1 | rank,target,size |
| engine_io_latency_update_samples | gpuflow_gluesys_engine_io_latency_update_observations_total | counter, 1 | rank,target,size |
| engine_pool_vos_space_scm_used | gpuflow_gluesys_engine_pool_vos_space_scm_used_bytes | gauge, bytes | pool,rank,target |
| engine_pool_vos_space_scm_total | gpuflow_gluesys_engine_pool_vos_space_scm_total_bytes | gauge, bytes | pool,rank,target |
| engine_pool_vos_space_nvme_used | gpuflow_gluesys_engine_pool_vos_space_nvme_used_bytes | gauge, bytes | pool,rank,target |
| engine_pool_vos_space_nvme_total | gpuflow_gluesys_engine_pool_vos_space_nvme_total_bytes | gauge, bytes | pool,rank,target |

8개 native 이름은 아직 등록·배포하지 않았다. 기관 소유 규격과 표준 핵심 지표를 구분하는 기존 원칙을 따른다. cluster/node/source/pod/data_origin/simulated 등 공통 식별·출처를 유지하고 PID를 붙이지 않는다. 현재 원천 표본 기준 예상 추가 시리즈는 **136개**(지연 128 + 용량 8)이며 다른 장비·Pool 증가까지의 상한은 source quota와 함께 다시 검증한다. source quota를 자동으로 늘리지 않는다.

## 계약 충돌 처리

- stats를 `gpuflow_storage_target_latency_seconds` histogram으로 이름만 바꾸지 않는다. native sum/count로 제한된 평균을 제공하는 안이며 p95/p99에는 실제 duration bucket 계측·별도 RFC가 필요하다.
- size는 I/O 크기다. latency boundary `le`로 변환하지 않는다. Pool/워크로드 식별이 없는 지연에 귀속 라벨을 만들어 넣지 않는다.
- VOS ratio는 매체·target·Pool 범위로 유지. 전체 capacity KPI에 연결할 분자·분모와 예약 공간 의미는 미정 — 글루시스·온라인파워스 / 화면 지표 협의 시 확정.
- 기존 DCGM/호스트/DAOS 이름과 조회 예제는 그대로 유지. 새 native만 등록하며 raw 수집과 향후 집계 지원을 구분한다.

## 적용 전에 완료할 검증

1. 등록 양식·source 매핑 규칙 생성: 타입/단위/추가 라벨/출처 주체/집계 여부를 명시한다. 1분·10분 집계는 기본 제외하고 별도 의미 검토한다.
2. 공통 validator/툴킷 로컬 검증: source-prefix·필수 라벨·타입·단위·카디널리티·legacy 회귀. 평균은 sum/count 모두 신선하고 증가한 구간만 계산한다.
3. node-agent 로컬 실험: 1e-6 변환, 원본값 대응, Prometheus stats counter·reset·재시작·중복 차원·누락을 검사한다. sum/count 쌍 중 한쪽만 저장된 경우 평균을 만들지 않는다.
4. J 적용용 diff·백업·복구 명령과 수집 부담 근거를 준비한다. 기존 사용자 요청의 **“C의 guard 변경은 J에 적용하기 전에 반드시 승인을 받는다”** 조건을 따른다. 이번 작업에서는 guard와 상시 수집 설정을 바꾸지 않았다.
5. 승인 후 A/B→J 경로 소규모 적용, 원천→VM 값·정책→화면 연결 검증. 실패 시 추가한 매핑·등록만 되돌리고 기존 raw 이력은 지우지 않는다.

미정 — 글루시스 / 설계 검토 후: native 정식 이름 확정, registry 단위 필드 호환, source quota 여유·부하 예산, reset 판정/평균 창, 저장·집계 보존, 적용 시점. 온라인파워스 검토에는 현재 제공 가능한 RPC 조회와 아직 원천 검토 단계인 지연·용량을 분리해 안내한다.
