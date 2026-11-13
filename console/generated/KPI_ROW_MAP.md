# KPI 10개 행별 매핑

2026-11-10 · 목업·소스·가공·화면 연결판 · revision 2026-11-14.1 · 검토 초안. 담당·제품 주기·평가 조건은 미팅 확정.

| ID·KPI | 원본 목표·단위 | 산식 | 원천 | 조건·증거 | 검증 주체 후보 |
| --- | --- | --- | --- | --- | --- |
| W13-01 I/O 성능 향상 | ≥20% / % | (시험값−기준값)/기준값×100; 기준값>0·동일 조건 | GET /v1/scorecard-runs; bench.result | TTA 기준 시스템·시험 원본·구성·반복 | TTA·글루시스·시험 수행기관 (후보·미팅 확정) |
| W13-02 노드별 순차 읽기 | ≥200 GB/s / GB/s | 읽기 bytes/초/1e9; 노드별 원본 집계. 전체값 임의 나눗셈 금지 | GET /v1/scorecard-runs; bench.result | IO500 easy-read·참여 노드·시험 구간 | TTA·글루시스·스토리지 시험기관 (후보·미팅 확정) |
| W13-03 노드별 순차 쓰기 | ≥140 GB/s / GB/s | 쓰기 bytes/초/1e9; 노드별 원본 집계 | GET /v1/scorecard-runs; bench.result | IO500 easy-write·동일 조건 | TTA·글루시스·스토리지 시험기관 (후보·미팅 확정) |
| W13-04 체크포인트 읽기 | ≥40 GiB/s / GiB/s | 체크포인트 읽기 bytes/초/2^30 | GET /v1/scorecard-runs; bench.result | MLPerf 관련 원본 시험·checkpoint 범위·구간 | TTA·글루시스·워크로드 시험기관 (후보·미팅 확정) |
| W13-05 체크포인트 쓰기 | ≥20 GiB/s / GiB/s | 체크포인트 쓰기 bytes/초/2^30 | GET /v1/scorecard-runs; bench.result | MLPerf 관련 쓰기 원본·동기화 완료 기준 | TTA·글루시스·워크로드 시험기관 (후보·미팅 확정) |
| W13-06 피드백 지연 | ≤200 ms / ms | 동일 span 분석 완료→정책 적용 완료 시각 차이; ns→ms /1e6 | GET /v1/scorecard-runs; predict.bottleneck, policy.change | 분석/적용 상태·span·정밀 시각. API 수신시각 대체 금지 | 글루시스·KETI·TTA (후보·미팅 확정) |
| W13-07 호스트 CPU 사용률 | ≤5% / % | 대상 학습 노드의 시간 가중 평균 ratio×100; CPU 정규화 합의 | GET /v1/scorecard-runs; gpuflow_host_cpu_util_ratio | gpuflow_host_cpu_util_ratio·대상·기간·DPU 조건 | 글루시스·망고부스트·KETI·TTA (후보·미팅 확정) |
| W13-08 원격 복구 RTO | ≤30 s / s | 장애/전환 시작→서비스 복구 완료. event 한 건만으로 계산 금지 | GET /v1/scorecard-runs; dr.failover | 복구 시작·완료의 실제 상태·검증 로그 | 글루시스·TTA·복구 시험기관 (후보·미팅 확정) |
| W13-09 격리 기법 수 | ≥6 / count | 구현·검증된 고유 기법의 개수. 목업 Active 개수 제외 | GET /v1/scorecard-runs;  | ⑩ 격리 기법별 증거·중복 제거 기준 | 글루시스·관련 기관·TTA (후보·미팅 확정) |
| W13-10 프로비저닝 자동화 | 지원 / boolean | 자동 요청→생성·연결·사용 성공 증거. demo 클릭 수 제외 | GET /v1/scorecard-runs; csi.provision | PVC/volume/Container 연결·성공 결과·사용 검증 | KETI·글루시스·TTA (후보·미팅 확정) |

기존 `indicator` 문자열에 명시적 별칭으로 연결합니다. 현재 별칭은 합성 예시용이며 실제 DB indicator 확인이 필요합니다. 매칭 없음은 미확정, 복수 run은 사용자 선택 필요로 표시합니다. 측정값·목표·단위·run·출처·조건이 없으면 달성 판정을 하지 않습니다. GB/s와 GiB/s를 구분하며 합성값은 평가 미확정입니다.
