# 원본 화면–위젯–API 전체 매핑

2026-11-10 · 목업·소스·가공·화면 연결판 · revision 2026-11-10.7 · 검토 초안. 담당·제품 주기·평가 조건은 미팅 확정.

회의에서는 [목업 → 기관 소스 → 글루시스 가공 → 온라인파워스 연결](SOURCE_PROCESSING_UI_MAP.md)을 먼저 확인합니다. 이 파일은 API·필드 개발 상세입니다.

기준: {"console": "5eba8dc7c11c2b94d2f35c853bc674ae0342406e", "gpuflow-kit": "e27f81fba387047d1e2546aef5d0f9a6ca10d0c8", "telemetry-spec": "af28385", "original_guide_sha256": "22499aef2d31e7672889e33e6058b6da5451ef992ea1bb006a67d9a89949d4c0"}

| ID·화면 | 원본 표시 항목 | 지표·이벤트 | API·필드 | 표시·결정 사항 |
| --- | --- | --- | --- | --- |
| W01-01 ① | GPU 할당량 |  | GET /v1/workloads; GET /v1/topology-nodes / /v1/workloads → items[].data: workload_id, type, tenant, namespace, pod, placement, storage, started_at, ended_at<br>/v1/topology-nodes → items[].data: id, kind, layer, pod, rack, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>추가: placement.cluster, nodes, active_gpu_uuids, registry(state, observed_at, valid_until), quality.registry_stale, binding_verified. inventory attrs.cluster/node/gpu_uuid와 연결. 종료·만료는 제외. | 등록 GPU와 유효한 작업–GPU 관측 관계를 분리한다. 스케줄러 예약·할당 수는 미확인이다.  |
| W01-02 ① | 클러스터 GPU 데이터 대기율 | gpuflow_derived_gpu_data_wait_ratio, gpuflow_host_io_stall_seconds_total, gpuflow_gpu_allocated_seconds_total | VM PromQL · raw / 집계 저장소 / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | I/O stall 시간 ÷ GPU 할당 시간의 클러스터 집계. 단순 GPU idle 비율이 아님.  |
| W01-03 ① | 스토리지 전달 대역폭 | gpuflow_storage_target_read_bytes_total, gpuflow_storage_target_write_bytes_total | VM PromQL · raw / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 워크로드에 전달된 bytes/s를 합산해 GB/s로 표시. 누적 bytes 자체가 아님.  |
| W01-04 ① | L3 용량 사용률 | gpuflow_storage_capacity_used_ratio | VM PromQL / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 사용 용량 / 전체 용량. 노드 비율의 단순 평균과 용량 가중 평균을 구분.  |
| W01-05 ① | 활성 워크로드 수 |  | GET /v1/workloads; GET /v1/topology-nodes / /v1/workloads → items[].data: workload_id, type, tenant, namespace, pod, placement, storage, started_at, ended_at<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>현재 데모 관계 검증: placement.cluster/nodes/active_gpu_uuids/registry(state,observed_at,valid_until), quality.binding_verified/registry_stale; topology attrs.cluster/node/gpu_uuid와 연결. 종료·만료·충돌 제외. 제품 스케줄러 상태/활성 집계 계약은 추가 필요. | 선택 범위에서 실행 중인 활성 워크로드 수와 유형별 수·병목 수. 현재 데모의 GPU 연결 확인 작업 수와 구분.  |
| W01-06 ① | GPU 대기율 히트맵 | gpuflow_derived_gpu_data_wait_ratio, gpuflow_host_io_stall_seconds_total, gpuflow_gpu_allocated_seconds_total | VM PromQL; GET /v1/workloads; GET /v1/topology-nodes / /v1/workloads → items[].data: workload_id, type, tenant, namespace, pod, placement, storage, started_at, ended_at<br>/v1/topology-nodes → items[].data: id, kind, layer, pod, rack, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 노드×GPU별 대기율과 워크로드 할당을 조합. GPU utilization 색상으로 대체하지 않음.  |
| W01-07 ①,⑥ | 스토리지 요약 | gpuflow_storage_target_read_bytes_total, gpuflow_storage_target_write_bytes_total, gpuflow_storage_capacity_used_ratio | VM PromQL; GET /v1/topology-nodes; GET /v1/topology-edges; GET /v1/events / /v1/topology-nodes → items[].data: id, kind, layer, pod, rack, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 용량·상태·I/O를 구분해 표시. 기본 모니터링 범위.  |
| W02-01 ② | 워크로드 목록 |  | GET /v1/workloads / /v1/workloads → items[].data: workload_id, type, tenant, namespace, pod, placement, storage, started_at, ended_at<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>추가: placement.gpu_uuids/active_gpu_uuids/registry, quality.registry_stale/binding_verified. GPU 그래프는 gpuflow_gpu_util_ratio 및 DCGM_FI_DEV_FB_USED의 cluster/node/pod/gpu/data_origin/simulated 조건으로 조회.<br>내부 실증 확장: placement.progress의 batches/totals와 15초 registry lease. 작업별 request.start/end 이벤트로 원 계측값 조회. | 출처별 워크로드 목록과 시작/종료·관계 상태를 확인한다. 작업 선택 시 등록 GPU UUID와 실행 구간의 GPU 단위 메트릭을 조회한다.  |
| W02-02 ②,③,④ | 워크로드 GPU 데이터 대기율 | gpuflow_derived_gpu_data_wait_ratio, gpuflow_host_io_stall_seconds_total, gpuflow_gpu_allocated_seconds_total | VM PromQL / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 선택 워크로드의 I/O stall / GPU 할당 시간. % 표시와 ratio 저장을 구분.  |
| W02-03 ② | 워크로드 주요 성능 | gpuflow_app_request_ttft_seconds, gpuflow_app_train_steps_total | VM PromQL / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 목업에서 workload 유형에 따라 TTFT·학습 처리량 등이 바뀌는 카드. 지표/단위도 함께 전환.  |
| W02-04 ②,③ | 워크로드 전달 대역폭 | gpuflow_storage_target_read_bytes_total, gpuflow_storage_target_write_bytes_total, gpuflow_storage_target_ops_total | VM PromQL / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 선택 workload의 전달 bytes/s와 IOPS. 서로 다른 단위·계측.  |
| W02-05 ②,③ | Zero-copy 경로 비율 | gpuflow_derived_path_zerocopy_ratio, gpuflow_transport_bytes_total | VM PromQL / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | GDS/GDR 전송량 / 동일 범위 전체 전송량. 중복·다른 경로 분모 구분.  |
| W02-06 ② | 캐시 적중률 | gpuflow_derived_tier_hit_ratio, gpuflow_cache_lookup_total | VM PromQL / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 캐시 조회 중 적중 비율. tier별 분모와 miss 의미 합의 필요.  |
| W02-07 ② | 호스트 CPU 사용률 | gpuflow_host_cpu_util_ratio | VM PromQL / VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 노드 CPU 사용률의 평균. workload CPU 사용량과 구분.  |
| W03-01 ③ | 배치·GPU 연결 |  | GET /v1/workloads; GET /v1/topology-nodes; GET /v1/topology-edges / /v1/workloads → items[].data: workload_id, type, tenant, namespace, pod, placement, storage, started_at, ended_at<br>/v1/topology-nodes → items[].data: id, kind, layer, pod, rack, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리. | 워크로드 placement와 노드/GPU 인벤토리의 연결.  |
| W03-02 ③ | 계층별 데이터 경로 |  | GET /v1/workloads; GET /v1/topology-nodes; GET /v1/topology-edges / /v1/topology-nodes → items[].data: id, kind, layer, pod, rack, attrs<br>/v1/topology-edges → items[].data: from_id, to_id, link, capable, metric_ref, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요.<br>내부 실증 확장: workloads.storage.binding.transfer의 path·bytes·GPU UUID·host/device checksum·관측 시각. 기관 공통 계약 확정은 후속.<br>반복 배치: placement.progress.batches[]/totals, observed_at, execution_kind/status; storage.binding.scope/observed_before/io; GPU·Pool·Container·구성원 등록 토폴로지. | 완료 실증의 데이터 전달 근거와 인벤토리·토폴로지 연결을 표시한다. 시나리오 보기의 병목 예시와 구분한다.  |
| W03-03 ③,④ | 계층별 예측·권고 | gpuflow_predict_util_ratio, gpuflow_predict_util_lower, gpuflow_predict_util_upper, gpuflow_predict_accuracy_ratio | VM PromQL; GET /v1/events / /v1/events → items[].data: event_key, event, severity, ts_ns, source, node, workload_id, labels, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>VM: status, data.resultType, data.result[].metric, value=[시각, 문자열 값] 또는 values[]. 메트릭별 라벨·단위 확인 필요. | 관측 시각·예측 생성 시각·대상 시각을 분리해 예측과 권고 표시.  |
| W04-01 ④ | 실측 배치 조건 비교 |  | GET /v1/workloads; GET /v1/topology-nodes; GET /v1/topology-edges / workloads.placement.progress: batches[], totals, expected_batches, status, observed_at, input_delay_requested_seconds, failure_injection_batch, kernel, inter_batch_pause_seconds; provenance/quality와 topology 식별자 교차 확인. | 동일 GPU·노드·저장소·입력·커널·휴식 설정의 정상·지연·실패 실행을 성공 배치당 평균으로 비교.  |
| W11-01 ⑪ | 활성 경보·확인(ack) |  | GET /v1/events; 활성 경보/ack 전용 API — 미정 / /v1/events → items[].data: event_key, event, severity, ts_ns, source, node, workload_id, labels, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리. | alert.fire/resolve로 현재 상태를 만들고 ack를 별도 기록.  |
| W11-02 ⑪ | 이벤트 목록 |  | GET /v1/events / /v1/events → items[].data: event_key, event, severity, ts_ns, source, node, workload_id, labels, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리. | event_key·event·severity·ts_ns·source·workload_id·labels·attrs 표시.  |
| W05-01 ⑤ | 티어별 캐시 적중률 | gpuflow_cache_lookup_total, gpuflow_derived_tier_hit_ratio, kv.lookup, kv.load, kv.store, kv.evict | VM / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | tier별 hit/miss를 구분. 동일 대상·기간의 hit/lookup이며 분모 0은 결측.  |
| W05-02 ⑤ | 티어 용량·evict·이동 | gpuflow_cache_used_bytes, gpuflow_cache_evict_total, tier.promote, tier.demote | VM; GET /v1/events / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | 용량 bytes·evict counter·이동 이벤트를 분리. 용량 상한은 기관 원본 확인.  |
| W05-03 ⑤ | 티어 정책·효과 | gpuflow_policy_active, policy.change | GET /v1/policies; GET /v1/policy-history / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | 같은 조건의 전후 비교 필요. 추가 통합 규격은 후속 RFC 예정.  |
| W06-01 ⑥ | 스토리지·메타데이터 부하 | gpuflow_storage_target_ops_total, gpuflow_storage_target_latency_seconds, gpuflow_storage_mdt_ops_total | VM; GET /v1/topology-nodes / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | backend별 DAOS rank/target과 Lustre MDT/OST 구분. counter rate·지연 histogram 형식 확인.  |
| W06-02 ⑥ | DPU 통계·오프로드 | gpuflow_fabric_cnp_total, gpuflow_fabric_ecn_mark_total, gpuflow_fabric_pfc_pause_total, gpuflow_fabric_retrans_total, gpuflow_fabric_dpu_offload_ratio, gpuflow_transport_kv_op_seconds | VM; GET /v1/topology-nodes; GET /v1/topology-edges / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | QP·NVMe-oF IOPS/p99·온도는 기관 원본 확인. KV 지연과 NVMe-oF 지연을 혼동하지 않음.  |
| W06-03 ⑥ | 스위치 포트·대역폭 | gpuflow_fabric_port_rx_bytes_total, gpuflow_fabric_port_tx_bytes_total | VM; GET /v1/topology-edges / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | 포트·방향 구분. bytes counter rate×8로 bit/s 변환. SN4700 연결·capability 제공 확인.  |
| W06-04 ⑥ | DPU 설정·변경 이력 | audit.change | GET /v1/events / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | CC 프로파일·ECN·QP 한도·MTU·PFC·NVMe-oF 오프로드 6종. 전후값 schema 미정. 실적용 후속.  |
| W07-01 ⑦ | 고정 질문·입력 근거 |  | POST /v1/llm/explain / /v1/llm/explain → question_id, scenario, mock, response, evidence, request_id | Q01~Q03, normal/no_evidence/timeout 지원. 현재 고정 mock. 원본 질문 후보와 구현된 3문항 구분.  |
| W07-02 ⑦ | 응답·출처·실패 처리 |  | POST /v1/llm/explain / /v1/llm/explain → question_id, scenario, mock, response, evidence, request_id | mock/response.status/answer/findings/evidence_ids/quality/관측·생성 시각. timeout은 HTTP504 DEADLINE_EXCEEDED.  |
| W08-01 ⑧ | 노드·GPU/NIC 연결 | node.join, node.leave, node.maintenance | GET /v1/topology-nodes; GET /v1/topology-edges; GET /v1/events / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | health·heartbeat가 없으면 정상으로 표시하지 않음. 물리 POD와 K8s Pod 분리.  |
| W08-02 ⑧ | Rebuild·Rebalance 진행·영향 | gpuflow_storage_rebuild_progress_ratio, gpuflow_app_train_steps_total, storage.rebuild.start, storage.rebuild.progress, storage.rebuild.end, storage.rebalance.start, storage.rebalance.end | GET /v1/events; VM / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | 진행 조회는 1차 후보. 영향≤10%는 동일 조건 baseline 대비 성능 저하율. 영향 workload·ETA 원천 없으면 미제공.  |
| W08-03 ⑧ | 노드 관리 실행 범위 | node.maintenance | 미정 / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | Maintenance/Drain/추가/장애 주입은 제안. 실행 API·권한·감사·복구 계약은 후속.  |
| W09-01 ⑨ | 정책 목록 |  | GET /v1/policies / /v1/policies → policy, name, from_tier, to_tier, rule, owner, workload_id, active, updated_at, updated_ns | 주키는 policy. active는 저장 상태이며 장비 적용의 증거가 아님.  |
| W09-02 ⑨ | 정책 이력·권고 연결 | policy.change, predict.bottleneck | GET /v1/policy-history; GET /v1/events / /v1/policy-history → id, event_key, policy, ts, ts_ns, active, actor, role, reason, span_id, attrs | policy·span_id·workload·시각으로 연결. policy.recommend는 지정 카탈로그에 없어 추가 계약 후보. 미확정 계약: policy.recommend |
| W09-03 ⑨ | KETI 프로파일·예측·프리페치 | gpuflow_predict_util_ratio, gpuflow_predict_accuracy_ratio, prefetch.issue, prefetch.ready, predict.bottleneck | 기관 확인: GET /awsm/profiles; PUT /hci/profiles / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | KETI 제공 후보. AWSM 메타데이터·정책 도출·HCI·30분 열화 예측은 기관 API 구현 확인 대기. 프리페치 정확도 지표는 spec에는 있고 kit에는 없는 차이로 kit 연동 확인 대기. 미확정 계약: gpuflow_host_prefetch_accuracy_ratio |
| W09-04 ⑨ | 데모 세션·실행 상태 | policy.change | POST /v1/policy-demo-sessions; GET /v1/policy-demo-sessions/{session_id} / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | 기존 mock API 제공. 이번 UI는 실행하지 않고 계약만 매핑. simulated=true·memory_until_restart·실효과 미계산.  |
| W10-01 ⑩ | 테넌트·쿼터·QoS | qos.limit.change | GET /v1/events; 전용 API 미제공 / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | tenant/namespace 귀속 레지스트리 필요. quota·실사용량 분리.  |
| W10-02 ⑩ | Top talkers |  | 전용 API 미제공; VM후보 / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | 동일 기간 workload/tenant별 전송량 rate로 순위. 공유 pool 임의 배분 금지.  |
| W10-03 ⑩ | 볼륨·프로비저닝·격리 | csi.provision, csi.delete | GET /v1/events; 전용 volumes API 미제공 / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | PVC→Pool/Container 귀속 필요. 격리 기법은 구현·검증 근거 필요. 이벤트만으로 사용 성공 판정 금지.  |
| W11-03 ⑪ | 임계값·상태 계산·Ack 책임 | alert.fire, alert.resolve | GET /v1/events; Ack 계약 미정 / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | 임계값 정의·발화/해소 상태 계산·Ack 영속화·권한 책임 결정.  |
| W12-01 ⑫ | 역할 4종 × 13화면 권한표 | audit.access | 제품 RBAC 미제공 / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | admin/op/user/ro × F/S/R/X는 원본 검토안. bearer testbed_all은 테넌트 격리 근거가 아님.  |
| W12-02 ⑫ | 접근·변경 감사 | audit.access, audit.change | GET /v1/events / 원천 metric/event 라벨·단위·attrs schema 확인 필요. 목록 공통 items[].data/provenance/quality, next_cursor, backend. | actor/role/target/request_id 등 attrs의 실제 schema 확인. ns 정밀도·보존·조회 권한 협의.  |
| W13-01 ⑬ | I/O 성능 향상 | bench.result | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | (시험값−기준값)/기준값×100; 기준값>0·동일 조건; TTA 기준 시스템·시험 원본·구성·반복  |
| W13-02 ⑬ | 노드별 순차 읽기 | bench.result | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 읽기 bytes/초/1e9; 노드별 원본 집계. 전체값 임의 나눗셈 금지; IO500 easy-read·참여 노드·시험 구간  |
| W13-03 ⑬ | 노드별 순차 쓰기 | bench.result | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 쓰기 bytes/초/1e9; 노드별 원본 집계; IO500 easy-write·동일 조건  |
| W13-04 ⑬ | 체크포인트 읽기 | bench.result | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 체크포인트 읽기 bytes/초/2^30; MLPerf 관련 원본 시험·checkpoint 범위·구간  |
| W13-05 ⑬ | 체크포인트 쓰기 | bench.result | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 체크포인트 쓰기 bytes/초/2^30; MLPerf 관련 쓰기 원본·동기화 완료 기준  |
| W13-06 ⑬ | 피드백 지연 | predict.bottleneck, policy.change | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 동일 span 분석 완료→정책 적용 완료 시각 차이; ns→ms /1e6; 분석/적용 상태·span·정밀 시각. API 수신시각 대체 금지  |
| W13-07 ⑬ | 호스트 CPU 사용률 | gpuflow_host_cpu_util_ratio | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 대상 학습 노드의 시간 가중 평균 ratio×100; CPU 정규화 합의; gpuflow_host_cpu_util_ratio·대상·기간·DPU 조건  |
| W13-08 ⑬ | 원격 복구 RTO | dr.failover | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 장애/전환 시작→서비스 복구 완료. event 한 건만으로 계산 금지; 복구 시작·완료의 실제 상태·검증 로그  |
| W13-09 ⑬ | 격리 기법 수 |  | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 구현·검증된 고유 기법의 개수. 목업 Active 개수 제외; ⑩ 격리 기법별 증거·중복 제거 기준  |
| W13-10 ⑬ | 프로비저닝 자동화 | csi.provision | GET /v1/scorecard-runs; GET /v1/events / items[].data: id, event_key, indicator, target, measured, unit, run_at, ts_ns, source, attrs; 공통 provenance/quality. indicator 문자열과 KPI를 명시적으로 연결. | 자동 요청→생성·연결·사용 성공 증거. demo 클릭 수 제외; PVC/volume/Container 연결·성공 결과·사용 검증  |
| W01-08 ① | POD별 요약 | gpuflow_derived_gpu_data_wait_ratio, gpuflow_fabric_port_tx_bytes_total, gpuflow_fabric_port_rx_bytes_total | GET /v1/workloads; GET /v1/topology-nodes; VM PromQL; GET /v1/topology-edges / /v1/workloads → items[].data: workload_id, type, tenant, namespace, pod, placement, storage, started_at, ended_at<br>/v1/topology-nodes → items[].data: id, kind, layer, pod, rack, attrs<br>공통: items[].provenance, items[].quality, next_cursor, backend. ns 값은 정밀도를 잃지 않도록 처리.<br>추가: placement.cluster, nodes, active_gpu_uuids, registry(state, observed_at, valid_until), quality.registry_stale, binding_verified. inventory attrs.cluster/node/gpu_uuid와 연결. 종료·만료는 제외. | 물리 POD별 등록 노드·GPU·Max wait·할당·Alerts·Uplink. Alerts는 원본의 wait≥15% GPU 수이며 전체 경보 수와 구분. 미계측·미연동은 0이 아님.  |
| W01-09 ① | Top nodes by wait | gpuflow_derived_gpu_data_wait_ratio | GET /v1/topology-nodes; VM PromQL / Top8 순위의 기간·다중 GPU 가중·유효 표본·동률·노드→③ 이동 키(cluster/node/GPU UUID) 결정. wait 미계측이면 순위 미산출. | Top8 순위의 기간·다중 GPU 가중·유효 표본·동률·노드→③ 이동 키(cluster/node/GPU UUID) 결정. wait 미계측이면 순위 미산출.  |
| W01-10 ① | 워크로드 유형별 GPU 점유 |  | GET /v1/workloads; 스케줄러 할당 원천 확인 필요 / Inference/Training/Data/Other batch/Idle 범주·유형 그룹 등록·공유 GPU 배분·할당시간 분모 결정. 미관측 GPU를 Idle로 분류하지 않음. | Inference/Training/Data/Other batch/Idle 범주·유형 그룹 등록·공유 GPU 배분·할당시간 분모 결정. 미관측 GPU를 Idle로 분류하지 않음.  |
| W10-04 ⑩ | 스케줄러·오케스트레이터 연동 |  | 기관 Kubernetes/Slurm 어댑터 미정; GET /v1/workloads; GET /v1/topology-nodes / Kubernetes: namespace/Pod/PVC·할당 GPU·동기화 시각(KETI K8s/CSI 후보). Slurm: partition·running/pending·할당 GPU(글루시스 registry 후보). 원본 버전·건수는 목업. provider·관측 시각·상태·registry 연결·권한/폴링 계약을 기관 미팅에서 확정. | Kubernetes: namespace/Pod/PVC·할당 GPU·동기화 시각(KETI K8s/CSI 후보). Slurm: partition·running/pending·할당 GPU(글루시스 registry 후보). 원본 버전·건수는 목업. provider·관측 시각·상태·registry 연결·권한/폴링 계약을 기관 미팅에서 확정.  |

## 하위 영역·후속 제어 API(원본 표기, 구현 보증 아님)

| 위젯 | 하위 영역 | 후속 제어 |
| --- | --- | --- |
| W01-07 | 노드별 target 부하와 Container/tier 사용률: workload·pool·container·tier 귀속 필요. L4 S3는 표시 티어이며 8계층과 별도 매핑.; 운영 이벤트 node.join·storage.rebalance/rebuild 및 학습 영향≤10%는 baseline 대비 성능·워크로드 귀속 필요.; DR 복제 지연: 원본 0.4s는 목업. kit에 복제 지연 지표 없음. dr.failover를 복제 lag로 대체하지 않음. |  |
| W02-02 | Timeline: 같은 workload/span의 GPU wait와 TTFT/step time을 각 단위·축·시각으로 표시.; policy.change 표식은 event 발생 시각·상태와 policy-history의 policy/span/workload를 연결. 브라우저 조작 시각을 실제 적용 시각으로 쓰지 않음. |  |
| W02-03 | TTFT/step time과 wait를 독립 축으로 표시. 정책 on/off 표식은 동일 범위·ns 시각·실제 적용 완료 상태 필요. |  |
| W03-02 | hops 지연값: 배치 계측 JSON은 성공 배치 합계/구간, VM 지연은 지표형식·집계 구간·백분위 확인. 서로 합산/대체 금지.; 칩·rail(railc) 폭/애니메이션은 시각 표현. 병목 근거 없이 실제 병목 hop으로 좁히지 않음. |  |
| W03-03 | verdict/evidence 목록은 원천 지표·이벤트·관측/예측 시각·대상·출처·quality를 연결.; what-if는 실제 적용과 분리된 모사 서비스·모델/버전·입력·예상효과 계약 필요. 계산 주체는 글루시스/기관·화면 조합 온라인파워스 협의. |  |
| W04-01 | 배치 실험 비교와 verdict/evidence 기반 진단 분리. 권고 토글 영향 미리보기는 합성 what-if이며 관측값 불변·실효과 보증 안 함. |  |
| W05-03 | 후속 제어 API는 원본 목업 표기이며 현재 제공·인증·구현 완료를 보증하지 않음. 읽기 조회와 분리하고 이 미리보기에서 호출하지 않음. | POST /policies/apply |
| W06-01 | Lustre 수집 원천: lctl get_param mdt.*.md_stats / obdfilter.*.stats. DAOS: daos_metrics의 dfs metadata ops. exporter 변환·단위·노드/rank/target 매핑 확인. |  |
| W06-02 | DPU 인벤토리 #dinv: topology-nodes의 kind/attrs와 topology-edges 연결. 호스트·모델·capabilities·포트 식별과 VM 처리량/온도 시리즈를 구분. |  |
| W06-04 | 후속 제어 API는 원본 목업 표기이며 현재 제공·인증·구현 완료를 보증하지 않음. 읽기 조회와 분리하고 이 미리보기에서 호출하지 않음. | PUT /dpu/{id}/config |
| W08-03 | 후속 제어 API는 원본 목업 표기이며 현재 제공·인증·구현 완료를 보증하지 않음. 읽기 조회와 분리하고 이 미리보기에서 호출하지 않음. | POST /nodes/{id}/maintenance; POST /nodes/{id}/drain |
| W09-01 | 기본 POL/ksPolicy: KV 경로·L3 청크 배치·checkpoint·대용량 전송·데이터셋·예측 프리페치. owner·mode·base 여부는 현재 API 필드와 attrs/확장 계약 확인. active를 base/실적용으로 추정하지 않음.; 후속 제어 API는 원본 목업 표기이며 현재 제공·인증·구현 완료를 보증하지 않음. 읽기 조회와 분리하고 이 미리보기에서 호출하지 않음. | POST /policies/apply |
| W09-03 | AWSM→policy: I/O priority·redundancy 사용자 입력·대상 스토리지·적용 상태 포함. 메타데이터 저장 주체/쓰기 경로·버전·권한·감사는 KETI/글루시스 협의 미정.; gpuflow_host_prefetch_accuracy_ratio: telemetry-spec af28385에는 존재, kit e27f81f에는 없음. 양방향 차이이며 kit 등록 전 표준 계측 가능으로 표시하지 않음.; 후속 제어 API는 원본 목업 표기이며 현재 제공·인증·구현 완료를 보증하지 않음. 읽기 조회와 분리하고 이 미리보기에서 호출하지 않음. | GET /awsm/profiles; PUT /hci/profiles; PUT /prefetch/{workload} |
| W10-01 | 후속 제어 API는 원본 목업 표기이며 현재 제공·인증·구현 완료를 보증하지 않음. 읽기 조회와 분리하고 이 미리보기에서 호출하지 않음. | PUT /tenants/{id}/qos |

| 공통 결정 사항 | 계약 |
| --- | --- |
| 유형 | WSPEC은 원본 예시 워크로드 목록. type 열거값·Inference/Training·data·dev 2그룹·점유 5범주 분류표/등록 주체는 기관·레지스트리 미팅 결정. benchmark를 무조건 training 또는 idle로 바꾸지 않음. |
| 임계값 | 원본 제안: wait≥10% 경고/≥15% 위험, 예측 병목85%, 부하60/85%, PFC1.7k/min, CPU목표≤5%. 정의 주체·단위·기간·분모·변경 이력·룰 버전은 공동 확정. 히트맵/POD Alerts/⑪은 같은 룰 사용. 계측 없는 색·경보 미생성. |
| 이동 | 히트맵/Top nodes→③: cluster/node/GPU UUID와 관측 시각. workload 연결이 유일하지 않으면 임의 선택 금지. 경보/KPI data-go는 대상 screen과 event/run/workload 키 보존. 현재 GPU 셀 자동 이동 미지원, 계약 매핑만 제공. |
| 모드 | Live/Replay/Scenario·시계·Pause는 전역 Period와 연계. Replay 제공 여부·재생 시각/관측 시각 구분·재생 속도·Pause 범위 미정. 저장 관측을 재생으로 간주하지 않음. |

원본 type 예시(공용 열거값 확정 아님): Benchmark · IO500, Benchmark · MLPerf checkpoint, Data · dedup, Data · images, Data · ingest, Data · shard repack, Data · tokenize, Dev · DAOS perf test, Dev · GDS regression, Dev · KV cache prototype, Dev · RL, Dev · notebook, Eval · benchmark, Eval · long context, Eval · safety, Inference · MoE, Inference · RAG, Inference · batch, Inference · batch summarize, Inference · batch translate, Inference · chatbot, Inference · code, Inference · embedding, Inference · multimodal, Inference · reranker, Inference · synthetic data, Training · DPO, Training · Korean fine-tune, Training · LoRA, Training · MoE pretraining, Training · SFT, Training · checkpoint restore, Training · speech, Training · vision

## 원본 요소와 잔여 작업

| 화면 | 위젯 | 잔여 작업 |
| --- | --- | --- |
| ① | W01-01, W01-02, W01-03, W01-04, W01-05, W01-06, W01-07, W01-08, W01-09, W01-10 | POD 타일 Max wait·Alerts·Uplink, Top nodes·유형별 점유의 수치 미산출, tenant/namespace 필터 미연동 |
| ② | W02-01, W02-02, W02-03, W02-04, W02-05, W02-06, W02-07 | KV miss 전용 표시·Live/1m/10m 구간 전환·L3→GPU IOPS 표시 규칙 미구현 |
| ③ | W02-02, W02-04, W02-05, W03-01, W03-02, W03-03 | rail(railc)은 계층별 경로의 표현 요소. 실제 metric_ref·단위 연결 미완 |
| ④ | W02-02, W03-03, W04-01 | verdict·권고 토글의 실측 진단 미완; policy.recommend 추가 계약 후보 |
| ⑤ | W05-01, W05-02, W05-03 | 티어 정책 실효과·미등록 기관 지표 확인 필요 |
| ⑥ | W01-07, W06-01, W06-02, W06-03, W06-04 | QP·온도·NVMe-oF 지표, SN4700 포트 연결 및 실제 설정 API 확인 필요 |
| ⑦ | W07-01, W07-02 | 원본 고정 질문 4개 이상 후보 중 API 구현은 Q01~03 mock; 실모델·근거 조회 미연동 |
| ⑧ | W08-01, W08-02, W08-03 | 진행·영향·ETA 원천 미제공; 실행 제어는 후속 |
| ⑨ | W09-01, W09-02, W09-03, W09-04 | AWSM/HCI는 KETI 기관 제공 확인 대기; 실적용 후속 |
| ⑩ | W10-01, W10-02, W10-03, W10-04 | 전용 tenant/volume/qos API 없음; 1차 노출 여부 미정 |
| ⑪ | W11-01, W11-02, W11-03 | 현재 경보 집계·Ack 영속화·임계값 담당 미정 |
| ⑫ | W12-01, W12-02 | 역할표는 제안; 제품 RBAC·감사 보존 미확정 |
| ⑬ | W13-01, W13-02, W13-03, W13-04, W13-05, W13-06, W13-07, W13-08, W13-09, W13-10 | 10행 매핑 완료 대상. 실측 시험·공식 평가 인수는 별도 |

## 원본 역할별 화면 권한 제안

| 화면 | admin | op | user | ro |
| --- | --- | --- | --- | --- |
| ① | F | F | S | R |
| ② | F | F | S | R |
| ③ | F | F | S | R |
| ④ | F | F | S | R |
| ⑤ | F | F | S | R |
| ⑥ | F | F | X | R |
| ⑦ | F | F | S | X |
| ⑧ | F | S | X | X |
| ⑨ | F | S | X | X |
| ⑩ | F | R | S | R |
| ⑪ | F | F | S | R |
| ⑫ | F | R | X | X |
| ⑬ | F | F | R | R |

F 전체 / S 자기 범위 / R 조회 / X 숨김. 서버 권한 구현·확정 계약이 아닌 원본 검토안입니다.

현재 미리보기: API 목록 5초 조회·관계 1초 재평가·lease 15초. 저장 표본은 고정. 제품 갱신·수집 주기·step·캐시 TTL: 미정 — 글루시스·온라인파워스·기관 / 미팅.

매핑 완료는 실측·제품 인수 완료가 아닙니다. 화면별로 계약 매핑/합성 샘플 표시/온라인 중계 검증/실장비 실측을 나누어 보고합니다.
