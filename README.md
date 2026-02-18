# nginx-proxy (프론트 + 프록시 통합)

**프론트엔드 정적(SPA) 서빙** + 백엔드 API(photo-api 등) 앞단 **리버스 프록시** 통합 서비스입니다.

이 레포에는:
- **React 프론트엔드** (`frontend/`): 사진 앨범 공유 웹 애플리케이션
- **nginx 프록시 설정** (`conf/`, `deploy/`): 리버스 프록시 + 정적 서빙
- **Observability** (`conf/*.service`, `scripts/`): Promtail, node-exporter, nginx-exporter, Pushgateway

이미지 빌드 시 `frontend`를 빌드해 `/opt/nginx-proxy/static`에 넣고 루트(/)에서 서빙합니다.

## 역할

- **/** → 프론트엔드 정적 (SPA, `try_files` → `/index.html`)
- **/api/** → 백엔드로 prefix 제거 후 전달 (`/api/auth/login` → `/auth/login`)
- **/share/** → photo-api 공유 링크 (인증 없이 앨범 공유)
- **/health** → 백엔드 헬스체크
- **클라이언트 IP**: `X-Forwarded-For`, `X-Real-IP` 등으로 무조건 전달

## 디렉터리 구조

```
nginx-proxy/                    ← 이 레포 루트 (프론트 + 프록시 통합)
├── .github/workflows/
│   └── build-and-test-image.yml   # 인스턴스 이미지 자동 빌드
├── frontend/                      # React 프론트엔드 (SPA)
│   ├── src/
│   ├── scripts/
│   │   └── deploy-to-nginx-proxy.sh
│   ├── package.json
│   ├── DEPLOY.md
│   └── README.md
├── conf/
│   ├── nginx-proxy.conf
│   ├── backend.upstream.conf.template
│   ├── promtail-config.yaml
│   └── *.service
├── deploy/
│   ├── apply-env-and-restart.sh   # NHN Deploy User Command
│   ├── verify-after-deploy.sh
│   └── README.md
├── scripts/
│   ├── ci/                        # GitHub Actions CI 스크립트
│   └── push-metrics-to-gateway.sh
└── README.md
```

## 인스턴스 이미지 자동 빌드 (GitHub Actions)

**워크플로**: `.github/workflows/build-and-test-image.yml`

### 동작 흐름

1. **frontend 빌드** (Node.js)
   - 레포의 `frontend/` 디렉터리를 `npm ci && npm run build` (VITE_API_BASE_URL=/api)
   - `frontend/dist/` → 인스턴스의 `/opt/nginx-proxy/static/`에 복사
   - frontend가 없으면 placeholder HTML 사용

2. **NHN Cloud 인스턴스 생성** (Python CI 스크립트)
   - Ubuntu 베이스 인스턴스 생성 (KR1)
   - SSH 키 임시 생성 후 접속

3. **nginx-proxy 설정**
   - nginx 설치 + 트래픽 효율 설정 (`worker_connections 65535`, `worker_processes auto`)
   - `/opt/nginx-proxy/` 배치: conf, deploy, scripts, static
   - `backend.upstream.conf` 생성 (기본값: 127.0.0.1:8000)
   - nginx 설정 적용 + 검증

4. **Observability 구성**
   - **Promtail**: nginx access/error 로그 → Loki (LOKI_URL 설정 시)
   - **node_exporter**: 호스트 리소스 메트릭 (9100)
   - **nginx-prometheus-exporter**: nginx stub_status 메트릭 (9113)
   - **pushgateway-push.timer**: 30초마다 node + nginx 메트릭 푸시 (PROMETHEUS_PUSHGATEWAY_URL 설정 시)

5. **이미지 생성**
   - `cloud-init clean` 후 인스턴스 중지
   - 이미지 생성: `nginx-proxy-YYYYMMDD-HHMMSS`
   - 리소스 정리

### 필수 GitHub Secrets

| Secret | 설명 |
|--------|------|
| `NHN_AUTH_URL` | NHN Cloud Identity URL |
| `NHN_TENANT_ID` | 테넌트 ID |
| `NHN_USERNAME` | API 사용자 |
| `NHN_PASSWORD` | API 비밀번호 |
| `NHN_FLAVOR_NAME` | 인스턴스 타입 (예: `m2.c2m4`) |
| `NHN_IMAGE_NAME` | 베이스 이미지 (예: `Ubuntu Server 22.04.3 LTS`) |
| `NHN_SECURITY_GROUP_ID` | 보안 그룹 ID |
| `NHN_FLOATING_IP_POOL` | 플로팅 IP 풀 |
| `NHN_NETWORK_ID_KR1` | KR1 네트워크 ID (선택) |

## NHN Deploy

- User Command: `sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh`
- 배포 시 `BACKEND_UPSTREAM`(백엔드 로드밸런서 IP:포트)을 설정하면 `conf.d/backend.upstream.conf`가 갱신된 뒤 nginx가 reload 됨.
- 자세한 사용법: [deploy/README.md](deploy/README.md)

## 트래픽 효율

- **버퍼**: `proxy_buffer_size` 128k, `proxy_buffers` 4×256k, `proxy_busy_buffers_size` 256k
- **업스트림**: `keepalive 32` (backend.upstream.conf)
- **메인 nginx**: 이미지 빌드 시 `worker_connections` 65535, `worker_processes auto` 적용

## 로그 형식·Loki

- Access 로그: JSON 한 줄(NDJSON). `request_id`, `uri`, `request_time`, `status` 등 — Promtail → Loki 전송.
- 상세·점검: [docs/log-format-and-metrics.md](docs/log-format-and-metrics.md)
- 검토 체크리스트: [docs/REVIEW-CHECKLIST.md](docs/REVIEW-CHECKLIST.md)

## Observability (Promtail, Pushgateway)

이미지에는 다음이 포함됩니다.

| 구성요소 | 역할 |
|----------|------|
| **Promtail** | nginx access/error 로그 → Loki (`LOKI_URL` 설정 시 기동) |
| **node_exporter** | 호스트 메트릭 (9100) |
| **nginx-prometheus-exporter** | nginx stub_status 메트릭 (9113) |
| **pushgateway-push.timer** | 30초마다 node + nginx 메트릭을 Pushgateway로 푸시 (`PROMETHEUS_PUSHGATEWAY_URL` 설정 시) |

NHN Deploy 또는 `.env`에 `LOKI_URL`, `PROMETHEUS_PUSHGATEWAY_URL`, `INSTANCE_IP`를 설정하면 로그·메트릭이 전송됩니다.

## SSL (추후)

- `conf/nginx-proxy.conf` 하단에 HTTPS 서버 블록이 주석으로 포함되어 있음.
- 인증서 경로 설정 후 주석 해제하고, 필요 시 HTTP→HTTPS 리다이렉트 적용.
