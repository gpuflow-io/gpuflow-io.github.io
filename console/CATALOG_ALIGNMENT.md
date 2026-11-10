# toolkit / telemetry-spec 지표 차이

2026-11-10 · toolkit e27f81f / telemetry-spec af28385 기준. 이번에는 공용 카탈로그를 변경하지 않습니다.

| 참조 지표 | telemetry-spec af28385 | 이번 매핑 기준 |
| --- | --- | --- |
| gpuflow_app_request_ttft_seconds | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_app_train_steps_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_cache_evict_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_cache_lookup_total | 존재 | toolkit e27f81f |
| gpuflow_cache_used_bytes | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_derived_gpu_data_wait_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_derived_path_zerocopy_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_derived_tier_hit_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_fabric_cnp_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_fabric_dpu_offload_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_fabric_ecn_mark_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_fabric_pfc_pause_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_fabric_port_rx_bytes_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_fabric_port_tx_bytes_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_fabric_retrans_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_gpu_allocated_seconds_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_host_cpu_util_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_host_io_stall_seconds_total | 존재 | toolkit e27f81f |
| gpuflow_policy_active | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_predict_accuracy_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_predict_util_lower | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_predict_util_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_predict_util_upper | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_storage_capacity_used_ratio | 존재 | toolkit e27f81f |
| gpuflow_storage_mdt_ops_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_storage_rebuild_progress_ratio | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_storage_target_latency_seconds | 존재 | toolkit e27f81f |
| gpuflow_storage_target_ops_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_storage_target_read_bytes_total | 존재 | toolkit e27f81f |
| gpuflow_storage_target_write_bytes_total | 존재 | toolkit e27f81f |
| gpuflow_transport_bytes_total | 없음 · 동기화 검토 | toolkit e27f81f |
| gpuflow_transport_kv_op_seconds | 없음 · 동기화 검토 | toolkit e27f81f |

policy.recommend·gpuflow_host_prefetch_accuracy_ratio는 toolkit 기준에도 없어 추가 계약/기관 native 확인 대상입니다. 카탈로그에 존재하더라도 실제 발행·계측·화면 인수가 완료된 것은 아닙니다.
