# 식별자 치환 실측 샘플

`batch-observation.redacted.json`은 실제 반복 DAOS 읽기·CUDA XOR 커널 실증의 성공/지연/실패 3개 기록입니다. 수치·실행 시각·체크섬은 유지하고 작업/클러스터/POD/노드/GPU/시스템/Pool/Container 식별자를 일관되게 치환했습니다. 시계열·이벤트 원본·접속 정보·인증·프로세스 정보는 포함하지 않습니다.

- sample-batch-normal: 8/8, 256 MiB.
- sample-batch-delayed: 8/8, 256 MiB, 입력 지연 1초/배치.
- sample-batch-failed: 2/6, 64 MiB, 입력 지연 3초/배치, 3번째 DAOS 읽기 실패.

과거 관측이며 현재 실행 상태가 아닙니다. `schema_version` 등 최상위는 미리보기용 snapshot 형식이고 제품 API 응답을 새로 정의하지 않습니다. workload/topology 레코드는 선택 필드 발췌입니다. source provenance와 치환 여부는 별도 개념이며 `redacted`/`sample_notice`를 제거하지 않습니다.
