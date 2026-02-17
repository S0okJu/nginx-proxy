# 배포 가이드

> 이 프론트엔드는 **nginx-proxy 레포에 통합**되었습니다. (`nginx-proxy/frontend/`)  
> 인스턴스 이미지 빌드 시 함께 빌드되어 nginx가 정적 파일로 서빙합니다.

## 환경 변수 (빌드 시)

프론트엔드에서 **꼭 설정해야 하는** 환경 변수는 없습니다.  
같은 도메인에서 `/api`로 백엔드를 쓰는 경우 기본값이 `/api`라서 그대로 두면 됩니다.

| 변수 | 필수 | 설명 | 기본값 |
|------|------|------|--------|
| **VITE_API_BASE_URL** | 배포 방식에 따라 다름 | 백엔드 API Base URL. nginx-proxy와 같은 도메인이면 `/api` 사용. | 개발: `http://localhost:8000` / 프로덕션: `/api` |
| **VITE_USE_HASH_ROUTER** | 선택 | `'true'`면 HashRouter 사용 (공유 URL: `/#/share/토큰`). 서버 라우팅 없이 쓸 때. | 없음 (BrowserRouter) |

**설정이 필요한 경우**

- **nginx-proxy와 같은 도메인**: 설정 안 해도 됨. (`npm run build:proxy`는 내부적으로 `VITE_API_BASE_URL=/api` 사용)
- **Object Storage 등 다른 오리진에서 프론트 서빙**: `VITE_API_BASE_URL`을 **절대 URL**로 설정 (예: `https://프록시주소/api`). 그렇지 않으면 `/api` 요청이 스토리지 도메인으로 나감.
- **런타임에 API URL 바꾸기**: 빌드 시 변수 대신 `index.html`에 `window.APP_CONFIG = { apiBaseUrl: '...' };` 로 넣어도 됨. (`src/config/api.js` 참고)

---

## NHN Deploy 배포 (예정)

이 프론트엔드는 **nginx-proxy 레포에 통합**되어 **NHN Deploy**로 배포됩니다.

- 이미지 빌드: `nginx-proxy/.github/workflows/build-and-test-image.yml`이 `frontend/`를 빌드해 이미지에 포함
- 배포: NHN Deploy User Command에서 `../deploy/apply-env-and-restart.sh` 실행 시 `BACKEND_UPSTREAM` 등 환경 변수 반영
- 서비스: 한 도메인에서 `/`(프론트) + `/api`(백엔드) 제공

### Observability 무조건 전송 (필수)

NHN Deploy 배포 시 **Promtail, Pushgateway, node-exporter, nginx 메트릭**이 반드시 전송되도록 해야 합니다.  
nginx-proxy 배포 스크립트(`apply-env-and-restart.sh`)는 아래 변수가 비어 있으면 **실패**합니다.

| 변수 | 역할 |
|------|------|
| **LOKI_URL** | Promtail → Loki 로그 전송 |
| **PROMETHEUS_PUSHGATEWAY_URL** | node_exporter / nginx 메트릭 → Pushgateway 푸시 |

User Command 또는 `.env`에 반드시 설정하세요. (예: GitHub Secrets에서 주입)  
자세한 설정: `../deploy/README.md` 참고.

## 필수 요구사항: Client IP 전달

**Client IP는 무조건 백엔드까지 전달되어야 합니다.** (로그/감사/보안 등)

- 프론트·API 앞단에는 **nginx-proxy**를 두고, **모든** 백엔드로 가는 요청에 아래 헤더가 설정되어 있어야 합니다.
  - **X-Forwarded-For** (프록시 체인 포함)
  - **X-Real-IP** (직접 연결된 클라이언트 IP)
- nginx-proxy의 `conf/nginx-proxy.conf`에는 이미 모든 `location`(예: `/api/`, `/share/`, `/health`)에 `proxy_set_header X-Forwarded-For`, `proxy_set_header X-Real-IP`가 설정되어 있습니다.
- NHN Deploy 또는 다른 로드밸런서/프록시를 추가로 사용할 경우에도, **최종 사용자 IP**가 nginx-proxy → 백엔드로 넘어가도록 구성해야 합니다. (신뢰할 수 있는 프록시 IP는 nginx `set_real_ip_from` 등으로 처리)

## 현재 배포 방식

| 방식 | 설명 |
|------|------|
| **nginx-proxy 이미지** (권장) | 레포 루트의 워크플로(`../.github/workflows/build-and-test-image.yml`)가 frontend를 빌드해 `/opt/nginx-proxy/static`에 포함. 한 도메인에서 프론트+API 서빙. |
| **로컬 → 서버** | `npm run build:proxy` 후 `./scripts/deploy-to-nginx-proxy.sh user@host` 로 정적만 반영. |
| **Object Storage** | `.github/workflows/deploy-to-object-storage.yml`로 빌드 후 NHN Cloud Object Storage에 업로드 (별도 CDN/도메인). |
