# ⑥ RPC 처리율·지연·용량 — 2026-11-14.1

기존 2026-11-13 실제 DAOS 부하 구간을 재사용해 의미가 확인된 지표를 연결했다. **RPC/s는 VM 조회, 지연·용량은 저장된 원천 캡처 검토**이다. 이 작업에서 새로운 부하를 발생시키거나 J/A/B 수집기·guard·서비스를 변경하지 않았다. 소스별 관측 시각을 보존했다.

| 화면 항목 | 원천 | 글루시스 처리 | 온라인파워스 연결 상태 |
|---|---|---|---|
| RPC 처리율 | engine_pool_ops_fetch/update | 기존 node-agent 복사 gpuflow_storage_target_ops_total, operation별 1분 rate | VM 직접 조회 가능. 디스크/애플리케이션 IOPS로 표기하지 않음 |
| 크기별 지연 참고 평균 | engine_io_latency_fetch/update_sum 및 _samples | 전후 Δsum/Δsamples/1000 → ms | 원천 캡처 검토. VM·제품 API 미연동 |
| VOS 용량 | engine_pool_vos_space_scm/nvme_used 및 _total | node/rank/target/pool/매체별 used/total | 원천 캡처 검토. VM·제품 API 미연동 |
| p95/p99 | 현재 지연 분포 bucket 없음 | 계산하지 않음 | 미계측 |

## 의미와 단위

DAOS v2.8.1은 ops를 처리한 object RPC 수로 계측한다. 파일 복사 한 번이 여러 RPC를 발생시키므로 테스트의 8파일·애플리케이션 I/O 수·블록 장치 IOPS와 같지 않다. [DAOS counter 정의](https://github.com/daos-stack/daos/blob/v2.8.1/src/object/obj_utils.c)

동일 소스의 지연 센서는 크기별 stats gauge이며 단위는 **µs**다. `_sum`/`_samples` 원천은 counter로 노출된다. `size=1MB` 등은 I/O 크기 분류이며 지연 구간 경계 `le`가 아니다. 이를 histogram bucket으로 변환하거나 평균에서 p95/p99를 만들지 않는다. [DAOS 지연 센서 정의](https://github.com/daos-stack/daos/blob/v2.8.1/src/object/obj_utils.c)

VOS `_used`, `_total`은 bytes gauge다. SCM·NVMe를 합쳐 백분율을 만들지 않는다. `used/total`은 해당 VOS가 보고한 비율이지 전체 장비 사용률이나 애플리케이션 쓰기 가능 공간이 아니다. `dmg pool query`의 free를 역산한 수치와도 일치한다고 가정하지 않는다. [VOS 지표 정의](https://github.com/daos-stack/daos/blob/v2.8.1/src/vos/vos_common.c)

**기존 표준 계약은 유지했다.** `gpuflow_storage_target_latency_seconds`는 histogram이다. stats gauge/counter를 이 이름으로 바꾸는 것은 형식·의미 충돌이다. 기존 `gpuflow_storage_capacity_used_ratio` 역시 VOS 매체별 비율을 전체 스토리지 사용률로 무조건 대입하지 않는다. 기관 제출 샘플에서 RPC 원천을 native로 안내한 내용과 J의 기존 표준 복사 경로는 구분한다. 이 작업은 실제 복사값의 일치를 확인했으며 기관 표준 매핑 합의를 대신하지 않는다.

## VM RPC 조회

```promql
rate(gpuflow_storage_target_ops_total{cluster="example-storage-cluster",source="gluesys",data_origin="measured",simulated="false",backend="daos",job="gpuflow-measured-daos",operation="read"}[1m])
```

`operation="write"`는 update RPC/s이다. 식별자는 예시 치환값이다. raw query_range의 start/end/step=5/latency_offset=1s/nocache=1은 기존 처리량 조회 규약을 사용한다. counter, timestamp(counter), count_over_time(counter[1m])도 같은 시각·라벨로 확인한다. 원천·표준을 합산하지 않는다. 최신성/표본 부족/중복/결측/실패 처리는 처리량과 같다.

로컬 참조 어댑터 `/testbed-api/storage-ops`를 추가했으나 새 제품 API가 아니다. 고정 scope·조회만 허용하며 기존 선택 옵션 `--vm-url`/`--storage-cluster`를 사용한다. J에 설치하지 않았다. 지연·용량은 live 모드에서 미구성으로 표시하고 저장 표본을 현재 데이터로 대체 표시하지 않는다.

## 실측 결과

RPC 구간 최대(1분 평균 rate): A fetch **1.600000**, update **1.166667**; B fetch/update 각각 **1.266667 RPC/s**. 장비 최대 성능이나 순간 피크가 아니다. 4시리즈 × 181지점의 counter/rate **1,448개 값**이 VM 원본과 표준 사이에서 일치하고, 원천 exporter 전후 경계 8값도 인접 VM 지점(±5초)과 일치한다.

| 노드 | RPC / I/O 크기 | 표본 증가 | 지연 참고 평균(ms) |
|---|---|---:|---:|
| A | fetch / 1MB | 52 | 3.812135 |
| A | fetch / 256B | 60 | 0.040883 |
| A | update / 1MB | 52 | 3.120096 |
| A | update / 256B | 18 | 0.183667 |
| B | fetch / 1MB | 76 | 6.695697 |
| B | update / 1MB | 76 | 5.568145 |

이 수치는 **전후 차분 기반 참고 평균**이다. 중간 counter reset은 검증하지 않았고, 58개 크기 분류는 새 표본이 없어 0ms로 표시하지 않았다. counter 감소는 평균 산출을 보류한다. 지연 원천에 Pool 라벨이 없으므로 Pool 필터를 적용하지 않으며 워크로드·Pool에 귀속하지 않는다. node/rank/target/size는 보존한다.

VOS 캡처: A/B 각각 NVMe used=48 MiB / total=4 GiB(1.171875%). SCM total은 각 512 MiB, used는 A 884,888bytes, B 875,256bytes. 전후 모두 시험 데이터 정리 밖의 경계 캡처이므로 중간 최대 사용량을 보여주지 않는다. NVMe라는 원천 매체 라벨만으로 물리 NVMe 성능을 주장하지 않는다.

## 검증과 남은 작업

- Node 117개 / Python 19개 / 생성 매핑 7개 정합성.
- RPC 단위·방향, 전후 지연 계산·미표본/감소/누락, 용량 분모·매체 분리·필터, live에서 저장 원천 사용 금지 검증.
- 기존 13화면 관측/시나리오·데스크톱/모바일 회귀 및 새 영역 브라우저 점검.
- 단위·이름·라벨·타입은 원본 가이드나 toolkit 카탈로그에서 바꾸지 않았다. 내부 미리보기 evidence 필드만 추가했다.

다음 단계는 [지연·용량 native 수집 설계](STORAGE_NATIVE_COLLECTION_PLAN.md) 검토와 J 적용 전 검증이다. 표준 histogram 계약 변경이나 기관별 제어 API 구현을 이 변경에 포함하지 않는다. 원천 DB화·집계·제품 API 연결 전에는 온라인파워스에 지연·용량의 실시간 제공을 완료했다고 안내하지 않는다.
