# DAOS 실제 읽기·쓰기 → ⑥ 화면 검증

revision **2026-11-13.2**. 기존 유휴 연결에 이어 **16 MiB × 8파일, 쓰기·읽기 각각 128 MiB**를 실제 DAOS에서 수행했다. 8파일 모두 전체 SHA-256이 일치했다. 원천 exporter → node-agent 표준 counter → VM rate → 저장된 미리보기에서 증가와 유휴 복귀를 확인했다.

## 실행 범위

- 시험: 2026-11-13 **13:49:23~13:52:15 KST** (04:49:23~04:52:15 UTC).
- 차트: 13:37:35~13:52:35 KST의 15분. 1분 rate, 5초 step, 4시리즈 × 181지점.
- 기존 DAOS 2.8.1 클라이언트·agent를 재사용. 전용 임시 POSIX 컨테이너 하나, file class SX / directory S1 / rd_fac 0. 복제·최대 성능 검증용 구성이 아니다.
- 15초 유휴 → 쓰기 8회(4초 간격) → 15초 대기 → 읽기 8회(4초 간격) → 75초 대기. 실제 명령의 시작·종료·해시 결과는 표본 `storage_telemetry.experiment`에 있다.
- 임시 로컬 파일은 메모리 디스크, 최대 파일 16 MiB 두 개. 파일·전용 DAOS 컨테이너 삭제 확인. 기존 컨테이너 보존, pool Ready·구성원 동일 확인.
- GPU 작업·설치·서비스 재배포·guard 수정·방화벽 변경·collector 중단은 수행하지 않았다. J Docker 27개와 DAOS 관련 Pod 3개의 실행 상태·시작 시각·재시작 횟수가 시험 전후 동일했다. A의 기존 DAOS agent PID/시작 시각도 동일했다.

## 확인 결과

| 노드 / 방향 | 전후 counter 증가(bytes) | 1분 rate 구간 최대(MiB/s) | 관측 |
|---|---:|---:|---|
| A 읽기 | 54,530,632 | 0.866719 | 증가 후 유휴 복귀 |
| A 쓰기 | 54,527,012 | 0.866684 | 증가 후 유휴 복귀 |
| B 읽기 | 79,691,776 | 1.266667 | 증가 후 유휴 복귀 |
| B 쓰기 | 79,691,776 | 1.266667 | 증가 후 유휴 복귀 |

**구간 최대는 이 제한된 시험의 1분 평균 rate 최댓값이다. 장비 최대 성능·순간 피크가 아니다.** 끝 시각의 최신값은 정상적으로 0이다. 미리보기는 최신값과 구간 최대를 나란히 표시한다.

읽기 counter 합계는 애플리케이션 읽기보다 4,680bytes, 쓰기는 1,060bytes 많다. 이 지표는 **공유 Pool**의 I/O로, 메타데이터·다른 I/O를 포함할 수 있다. 위 차이를 임의 보정하거나 특정 워크로드에 독점 귀속하지 않는다. 노드별 편중을 장애나 skew 문제로 단정하지 않는다.

## 대조 방법

1. A/B 원천 Prometheus exporter를 시험 전후 각 2회 읽었다. 두 번의 경계 값이 안정적인지 확인했다.
2. 원천 HTTP 완료 시각(ns 문자열)을 보존하고 ±5초 이내 가장 가까운 VM 평가 지점과 비교했다. 4시리즈 × 전후 **8개 경계 값 일치**. 두 조회가 동일 시각의 원자적 스냅샷이라는 뜻은 아니다.
3. 같은 VM 범위와 평가 시각으로 원본 `engine_pool_xferred_fetch/update` 및 표준 `gpuflow_storage_target_read/write_bytes_total`를 조회했다. 각 counter와 rate **1,448개 값이 모두 일치**했다. 라벨을 제거해 합산하지 않았다.
4. 실제 VM 응답을 HTML에 내장했다. 구간 최대 MiB/s를 VM 값 ÷ 1,048,576으로 비교하고 네 차트 모두 비영 구간이 있는지 브라우저에서 확인했다.
5. 724개 rate 지점의 원천 시각 차이는 최대 약 0.604초, 1분 창의 표본 수는 모두 60이었다. 시작·끝 구간에서 유휴값 확인.

15분 차트의 첫 값은 전후 캡처의 시작값과 다를 수 있다. 차트에는 사전 조회도 포함되므로 **counter 증가량은 실제 경계 시각의 값끼리 계산**한다. 원천 경계/VM 대조 시각은 `storage-load-validation.redacted.json`에 보존했다.

## 미리보기와 검증

```bash
python3 console/build_review_preview.py output/storage-load-review.html \
  --snapshot console/samples/storage-load-observation.redacted.json --screen storage
node --test console/tests/*-unit.cjs console/tests/redacted-sample.cjs
python3 -m unittest discover -s console/tests -p 'test_*.py' -v
python3 console/sync_mapping_docs.py --check
```

⑥ DAOS 영역에서 시험 요약 → 최신값/구간 최대 → 차트 → 단계 시각 → 원천/가공/화면 연결을 순서대로 확인한다. node/rank/target/pool 필터와 기존 13화면을 유지한다. 데이터는 실측이지만 식별자를 치환했으며 현재 상태가 아니다. 기존 등록/배치 표본과 다른 관측이므로 자동 조인하지 않는다.

- Node 108개, Python 16개, 문서 생성 정합성 통과.
- 저장된 실제 부하·기존 유휴, 필터, 빈 조합, live 조회 실패 시 이전 수치 제거, 데스크톱/모바일 검증.
- 13화면 × 관측/시나리오 × 데스크톱/모바일 회귀.
- 표본: `storage-load-observation.redacted.json`, 원본 VM 응답: `storage-load-native-vm.redacted.json`, 대조 결과: `storage-load-validation.redacted.json`.
- [조회 규약·품질 처리](STORAGE_OBSERVATION.md), [수동 재현 도구](experiments/README.md).

## 남은 범위

counter reset·부하 중 수집 중단·장시간 누락률, IOPS·지연·용량·Lustre·DPU·전체 장비 건강 상태, 워크로드별 귀속은 별도 검증 대상이다. 이번 결과로 GPU data wait나 제품 성능 목표 달성을 주장하지 않는다. 기존 [Draft PR #2](https://github.com/gpuflow-io/gpuflow-io.github.io/pull/2) 위의 후속 변경이며 J 운영 배포와 구분한다.
