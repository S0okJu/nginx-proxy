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

## 3. Grafana 시각화 예시

- **엔드포인트별 지연 추이**: LogQL  
  `sum by (uri) (rate({job="nginx-proxy", log_type="access"} | json | unwrap request_time [5m]))`  
  또는 Loki에서 `uri`, `request_time` 추출 후 시계열/히스토그램.
- **상태 코드 분포**: 라벨 `status`로 그룹 집계 (예: count by status).
- **요청 추적**: `request_id`로 검색해 nginx + photo-api 로그 함께 보기.
