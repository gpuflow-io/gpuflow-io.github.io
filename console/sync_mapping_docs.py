"""Generate mapping handoff views from review-contracts.json (stdlib only)."""
import argparse
import csv
import io
import json
from pathlib import Path

def table(headers, rows):
    def cell(x):return str(x).replace('|','\\|').replace('\n','<br>')
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join('---' for _ in headers)+' |']+['| '+' | '.join(cell(x) for x in row)+' |' for row in rows])+'\n'

def csv_text(headers,rows):
    output=io.StringIO(newline='');writer=csv.writer(output);writer.writerow(headers);writer.writerows(rows);return output.getvalue().replace("\r\n","\n")

def generated(c):
    stamp='2026-11-10 · 매핑 보완판 2 · 검토 초안. 담당·제품 주기·평가 조건은 미팅 확정.\n\n'
    cadence=c['widgets'][0]['cadence']
    apis='# 기존 API 4개 화면 매핑\n\n'+stamp+table(['화면','요청','필드','응답·표시 상태'],[(a['screen'],a['method']+' '+a['path'],', '.join(a['fields']),'LLM: 고정 mock, 정상/근거 없음/HTTP504. 목록: items[].data/provenance/quality, next_cursor, backend. API 존재·UI 연결·실측 검증은 별도.') for a in c['review_apis'].values()])
    apis+='\n정책 주키는 `policy`이며 스코어카드 연결 필드는 `indicator`입니다. workload_id를 키로 한 새 상세 API를 가정하지 않습니다. 목록은 같은 page_size/조건으로 cursor 끝까지 읽고 반복 cursor·중간 오류·조회 상한 초과는 완전한 결과로 처리하지 않습니다. HTTP 401/400/5xx와 빈 정상 응답을 구분합니다.\n\n저장된 HTML의 정책·스코어카드 응답은 **합성 계약 fixture**이며 DB 캡처가 아닙니다. LLM은 기존 고정 fixture입니다. 기존 11/07 API 호출 검증 기록은 당시 이력이며 현재 상태를 증명하지 않습니다.\n\n'+cadence+'\n'
    full='# 원본 화면–위젯–API 전체 매핑\n\n'+stamp+'기준: '+json.dumps(c['baselines'],ensure_ascii=False)+'\n\n'
    full+=table(['ID·화면','원본 표시 항목','지표·이벤트','API·필드','표시·결정 사항'],[(w['id']+' '+','.join(w['screens']),w['title'],', '.join(w['metrics']+w.get('events',[])), '; '.join(w['api'])+' / '+w['response_fields'],w['meaning']+' '+('미확정 계약: '+','.join(w['pending_contracts']) if w.get('pending_contracts') else '')) for w in c['widgets']])
    full+='\n## 원본 요소와 잔여 작업\n\n'+table(['화면','위젯','잔여 작업'],[(x['screen'],', '.join(x['widgets']),x['residual']) for x in c['screen_inventory']])
    if c.get('role_matrix'):
        full+='\n## 원본 역할별 화면 권한 제안\n\n'+table(['화면']+c['role_matrix']['roles'],[[r['screen']]+r['permissions'] for r in c['role_matrix']['rows']])+'\nF 전체 / S 자기 범위 / R 조회 / X 숨김. 서버 권한 구현·확정 계약이 아닌 원본 검토안입니다.\n'
    full+='\n'+cadence+'\n\n매핑 완료는 실측·제품 인수 완료가 아닙니다. 화면별로 계약 매핑/합성 샘플 표시/온라인 중계 검증/실장비 실측을 나누어 보고합니다.\n'
    kpis='# KPI 10개 행별 매핑\n\n'+stamp+table(['ID·KPI','원본 목표·단위','산식','원천','조건·증거','검증 주체 후보'],[(k['widget_id']+' '+k['title'],k['target']+' / '+k['unit'],k['formula'],'GET /v1/scorecard-runs; '+', '.join(k['metrics']+k['events']),k['evidence'],k['validators']) for k in c['kpis']])
    kpis+='\n기존 `indicator` 문자열에 명시적 별칭으로 연결합니다. 현재 별칭은 합성 예시용이며 실제 DB indicator 확인이 필요합니다. 매칭 없음은 미확정, 복수 run은 사용자 선택 필요로 표시합니다. 측정값·목표·단위·run·출처·조건이 없으면 달성 판정을 하지 않습니다. GB/s와 GiB/s를 구분하며 합성값은 평가 미확정입니다.\n'
    alignment='# 문서 정합성·적용 상태\n\n'+stamp
    alignment+=table(['항목','정리 기준'],[
        ('갱신',cadence),('카탈로그','gpuflow-kit e27f81f의 내장 catalog를 이번 매핑의 검수 기준으로 고정. telemetry-spec af28385와의 차이는 별도 동기화 검토.'),
        ('신규 후보','policy.recommend, gpuflow_host_prefetch_accuracy_ratio는 지정 카탈로그에 없음. 기관 native 또는 추가 RFC로 확인하며 확정 심볼로 등록하지 않음.'),
        ('지연 지표 이름','원본 콘솔 문구의 gpuflow_storage_target_read_seconds를 등록된 gpuflow_storage_target_latency_seconds로 정정. 읽기 전용 해석은 op 라벨·원본 의미 확인 필요.'),
        ('원본 요소 누락','① Max wait/Alerts/Uplink는 POD 타일 내부 항목. 수치·필터 미구현을 잔여 작업에 기록. Top nodes·유형별 점유는 미산출 카드 표시.'),
        ('등록 CSV','13행 api-screens는 사전 작성 초안. metrics/mappings는 확인된 표준 카탈로그 참조만 포함하며 기관 구현 완료·승인으로 간주하지 않음.'),
        ('기관 제어','AWSM/HCI는 원본의 KETI 제공 제안. 실제 제공 버전·인증·필드는 기관 확인 대기. Rebuild/Rebalance 진행 조회와 실행 제어 분리.'),
        ('이전 문서','11/07 matrix·query evidence는 당시 검증 기록으로 보존. 현재 화면 범위는 매핑 보완판과 생성된 최신 matrix 사용.'),
        ('중계','로컬 reference adapter는 목록·LLM UI 연결 시험용. 기존 J 중계 교체·운영 배포 없음. GPU 시계열 endpoint는 reference에서 미구성으로 명시.'),
    ])
    alignment+='\n카탈로그·이벤트 이름 존재는 실제 계측·발행·화면 표시 가능성의 증거가 아닙니다. 카탈로그 변경·J guard 변경·새 공용 proto/DB 스키마 변경은 이번 범위에 포함하지 않습니다.\n'
    return {'EXISTING_API_MAP.md':apis,'FULL_SCREEN_WIDGET_MAP.md':full,'KPI_ROW_MAP.md':kpis,'MAPPING_ALIGNMENT.md':alignment}

def outputs(c,dest):
    out={dest/'docs/handoff/2026-11-10'/name:text for name,text in generated(c).items()}
    # New latest matrix; the 11/07 meeting snapshot remains immutable.
    rows=[]
    for s in c['screen_inventory']:
        ws=[w for w in c['widgets'] if s['screen'] in w['screens']]
        apis=list(dict.fromkeys(a for w in ws for a in w['api']))
        rows.append([s['screen'],'; '.join(w['title'] for w in ws),'; '.join(apis),'제품 미정; 현재 미리보기 목록 5초','미정 — 화면/API 미팅','빈 목록/표본 미포함/조회 실패 분리','매핑 초안; 실측 인수 별도'])
    out[dest/'registration/api-screens.csv']=csv_text(['screen','required_data','api_candidate','refresh_interval','history_range','empty_error_behavior','status'],rows)
    out[dest/'docs/handoff/2026-11-10/screen-data-matrix.csv']=csv_text(['screen','required_data','api_candidate','refresh_interval','history_range','empty_error_behavior','status'],rows)
    metrics=[];maps=[]
    for name in sorted({x for w in c['widgets'] for x in w['metrics']}):
        spec=c['metric_specs'][name];screens=','.join(sorted({s for w in c['widgets'] if name in w['metrics'] for s in w['screens']}))
        metrics.append([name,spec.get('description',''),spec.get('type',''),spec.get('unit',''),','.join(['cluster','node','source','pod']+spec.get('labels',[])),'원본 카탈로그 범위','미정','미정','미정','원천 확인 필요','미정',screens,'미제공','기관 검토 필요 · 구현 확인 아님'])
        maps.append([name,name,'변환 없음(동일 표준 이름 제공 시)','원본 라벨 확인 필요','표준 참조 초안. 기관 native 이름은 회신 후 별도 추가.','기관 검토 대기'])
    out[dest/'registration/metrics.csv']=csv_text(['original_name','description','type','unit','labels','target','numerator','denominator','interval_seconds','data_origin','quality','desired_screen','sample_path','availability'],metrics)
    out[dest/'registration/mappings.csv']=csv_text(['original_name','standard_candidate','unit_conversion','label_conversion','semantic_notes','review_status'],maps)
    return out

def main():
    p=argparse.ArgumentParser();p.add_argument('--handoff-root',type=Path);p.add_argument('--check',action='store_true');a=p.parse_args();root=Path(__file__).parent;c=json.loads((root/'review-contracts.json').read_text())
    out={root/'generated'/n:t for n,t in generated(c).items()}
    if a.handoff_root:out.update(outputs(c,a.handoff_root))
    for path,text in out.items():
        if a.check:
            if not path.exists() or path.read_text()!=text:raise SystemExit('stale generated file: '+str(path))
        else:path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
    print(('Verified' if a.check else 'Generated'),len(out),'mapping views')
if __name__=='__main__':main()
