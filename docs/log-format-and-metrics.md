# Nginx 로그 포맷 및 엔드포인트별 메트릭

## 1. Access 로그 (metrics_json)

- **경로**: `/var/log/nginx/nginx-proxy-access.log`
- **형식**: 한 줄당 JSON (NDJSON)
- **용도**: 사용자 응답 지연 추이, HTTP 상태 코드 분포, 엔드포인트별 시각화

### 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `request_id` | string | 요청 추적 ID (photo-api와 동일 값, 헤더 `X-Request-ID`로 전달) |
| `time` | string | ISO 8601 |
| `service` | string | `"nginx"` (서비스 필터용) |
| `method` | string | HTTP 메서드 |
| `uri` | string | 정규화 경로 (API는 rewrite 후 경로, 예: `/photos/123`) |
| `request_uri` | string | 클라이언트 요청 URI (예: `/api/photos/123`) |
| `status` | number | HTTP 상태 코드 |
| `request_time` | number | 총 처리 시간(초) — 사용자 관점 지연 |
| `upstream_response_time` | string | 백엔드 응답 시간(초), 프록시가 아닌 경우 `""` |
| `remote_addr` | string | 클라이언트 IP |
| `bytes_sent` | number | 응답 바이트 |

### request_id 통일

- Nginx가 `$request_id`로 생성해 API/health로 `X-Request-ID` 헤더로 전달.
- photo-api는 동일 헤더를 읽어 로그에 `request_id`로 출력.
- Loki/Grafana에서 `request_id`로 nginx 로그와 photo-api 로그를 한 요청으로 연관 조회 가능.

---

## 2. Promtail → Loki

- `conf/promtail-config.yaml`의 `nginx-proxy-access` job이 위 JSON을 파싱해 Loki로 전송.
- **라벨**  
  - `instance_ip`: `${INSTANCE_IP}` — 인스턴스별 필터 (photo-api와 동일 라벨명)  
  - `status`, `service`: 본문에서 추출 (엔드포인트는 `uri`로 조회)

---

## 3. Loki에 로그가 안 올라갈 때 점검

### 3.1 로그가 아예 안 보일 때 (체크 순서)

1. **LOKI_URL이 설정돼 있는가**  
   `apply-env-and-restart.sh`는 **LOKI_URL이 비어 있으면 Promtail을 enable하지 않고** "Promtail disabled (LOKI_URL not set)"만 출력합니다.  
   → `/opt/nginx-proxy/.env`에 `LOKI_URL="http://<Loki주소>:3100"` 설정 후 다시 `sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh` 실행.

2. **Promtail이 실제로 떠 있는가**  
   nginx-proxy 인스턴스에서 `sudo systemctl status promtail` 로 확인.  
   → `inactive`면 위 1번 확인. `failed`면 `journalctl -u promtail -n 50` 으로 에러 확인.

3. **Loki가 배포돼 있고, nginx-proxy에서 접근 가능한가**  
   같은 VPC/네트워크에서 `curl -s "${LOKI_URL}/ready"` 등으로 연결 테스트.  
   → Loki 미배포·방화벽·보안 그룹이면 로그가 전송돼도 도달하지 않음.

4. **Grafana에서 Loki 데이터 소스를 쓰고 있는가**  
   Grafana → Configuration → Data sources 에서 Loki 추가, URL이 Loki 서버 주소(예: `http://loki:3100`)인지 확인.

5. **Explore에서 올바른 쿼리를 쓰는가**  
   Grafana Explore에서 데이터 소스 **Loki** 선택 후 예:  
   `{job="nginx-proxy"}` 또는 `{app="nginx-proxy"}`  
   access 로그만 보려면 `{job="nginx-proxy", log_type="access"}`.

6. **트래픽이 있어야 access 로그가 쌓인다**  
   한 번도 요청이 없으면 `nginx-proxy-access.log`가 비어 있고, Loki에도 전송할 내용이 없음.  
   → 브라우저나 `curl`로 해당 nginx-proxy에 요청을 보낸 뒤 다시 Explore에서 조회.

### 3.2 Loki에 로그가 안 올라갈 때 (상세)

| 원인 | 확인 방법 | 조치 |
|------|-----------|------|
| **환경변수 미치환** | Promtail 설정에 `url: ${LOKI_URL}/...` 그대로 있는지, 실제로 치환됐는지 확인 | **conf/promtail.service** 사용 시: `.env` 로드 후 `-config.expand-env=true`로 치환하므로, `.env`에 `LOKI_URL`, `INSTANCE_IP`만 있으면 됨. 다른 방식으로 기동할 때는 envsubst 등으로 미리 치환. |
| **LOKI_URL / INSTANCE_IP 미설정** | `echo $LOKI_URL`, `echo $INSTANCE_IP` | `/opt/nginx-proxy/.env` 또는 systemd `EnvironmentFile`에 설정 |
| **라벨 값 타입** | Promtail 로그에 invalid label 등 에러 여부 | `status`는 JSON에서 숫자이므로 파이프라인에서 문자열로 변환 후 라벨로 사용 (이미 반영됨) |
| **타임스탬프 파싱 실패** | Promtail 로그에서 timestamp 관련 에러 | nginx `$time_iso8601`은 RFC3339와 호환. 형식 바뀌면 `timestamp` stage 포맷 조정 |
| **로그 파일/위치** | Promtail가 읽는 경로와 실제 로그 경로 일치 여부 | `__path__: /var/log/nginx/nginx-proxy-access.log` 권한(읽기), positions 파일 경로 쓰기 가능 여부 확인 |
| **Promtail 로그 레벨** | 상세 에러 확인 | 일시적으로 `log_level: debug`로 올린 뒤 기동해 push 실패/파싱 에러 메시지 확인 |

---

## 4. Grafana 시각화 예시

- **엔드포인트별 지연 추이**: LogQL  
  `sum by (uri) (rate({job="nginx-proxy", log_type="access"} | json | unwrap request_time [5m]))`  
  또는 Loki에서 `uri`, `request_time` 추출 후 시계열/히스토그램.
- **상태 코드 분포**: 라벨 `status`로 그룹 집계 (예: count by status).
- **요청 추적**: `request_id`로 검색해 nginx + photo-api 로그 함께 보기.

---

## 5. Promtail 기동 시 환경변수

- **conf/promtail.service 사용 시**: ExecStart에서 `/opt/nginx-proxy/.env`를 로드한 뒤 `-config.expand-env=true`로 설정 내 `${LOKI_URL}`, `${INSTANCE_IP}`를 치환합니다. 따라서 `apply-env-and-restart.sh`로 `.env`를 갱신해 두면 별도 envsubst 없이 동작합니다.
- **수동 기동** 등 systemd 유닛을 쓰지 않을 때는 아래처럼 envsubst로 치환한 설정을 넘기세요.

```bash
export LOKI_URL="http://loki:3100"
export INSTANCE_IP="10.0.0.1"
envsubst '$LOKI_URL $INSTANCE_IP' < /opt/nginx-proxy/conf/promtail-config.yaml > /tmp/promtail.yaml
promtail -config.file=/tmp/promtail.yaml
```
