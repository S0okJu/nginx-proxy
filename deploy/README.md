# nginx-proxy NHN Deploy

이 디렉터리는 **NHN Deploy**에서 User Command로 사용할 스크립트를 포함합니다.

## 전제

- 서버에는 **nginx-proxy 인스턴스 이미지**로 생성된 인스턴스가 있으며, `/opt/nginx-proxy`에 설정이 설치되어 있음.
- nginx 서비스는 `nginx.service`로 동작하며, 백엔드 업스트림은 `/opt/nginx-proxy/conf.d/backend.upstream.conf`에서 정의됨.

## User Command 설정 (NHN Deploy)

- **Run As**: nginx reload 권한이 있는 계정 (예: `root`).
- **User Command** 예시:
  - **스크립트 안에서 export**: `apply-env-and-restart.sh` 상단의 `# === 여기서 환경변수 export (선택) ===` 아래 주석을 해제하고 값을 넣은 뒤 실행.
  - **파일로 한 번에 로드** (export 없이):
    ```bash
    sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh --env-file /path/to/deploy.env
    ```
  - **셸에서 export 후 실행**:
    ```bash
    export BACKEND_UPSTREAM="로드밸런서IP:포트"
    export LOKI_URL="http://loki:3100"
    export PROMETHEUS_PUSHGATEWAY_URL="http://pushgateway:9091"
    sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh
    ```
  - **stdin으로 .env 전체 덮어쓰기**:
    ```bash
    sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh --stdin
    ```
  - **설정 변경 없이 재시작만**:
    ```bash
    sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh --restart-only
    ```

## 환경 변수 (저장 위치: `/opt/nginx-proxy/.env`)

Promtail·Pushgateway·Prometheus 관련 변수는 **같은 .env**에 두고, `apply-env-and-restart.sh` 실행 시 병합·반영됩니다.

| 변수 | 필수 | 설명 | 기본값 |
|------|------|------|--------|
| `BACKEND_UPSTREAM` | ✓ | 백엔드 주소 (IP 또는 호스트:포트) | `127.0.0.1:8000` |
| `LOKI_URL` | - | Loki URL (Promtail → 로그 전송) | - |
| `PROMETHEUS_PUSHGATEWAY_URL` | - | Pushgateway URL (node_exporter/nginx 메트릭 푸시) | - |
| `INSTANCE_IP` | - | 인스턴스 식별용 (메트릭/로그 라벨, 비우면 hostname -I 사용) | - |
| `PUSHGATEWAY_JOB` | - | Pushgateway job 라벨 | `nginx-proxy` |
| `OPT_DIR` | - | 설치 경로 | `/opt/nginx-proxy` |
| `ENV_FILE` | - | .env 경로 | `/opt/nginx-proxy/.env` |

## 배포 후 검증

같은 서버에서:

```bash
sudo /opt/nginx-proxy/deploy/verify-after-deploy.sh
```

원격에서 (프록시 IP로):

```bash
BASE_URL=http://프록시IP:80 ./deploy/verify-after-deploy.sh
```

## 502 Bad Gateway 나올 때

502는 **nginx가 백엔드(photo-api)에 연결하지 못하거나, 연결 후 유효한 응답을 받지 못할 때** 발생합니다. 프록시 서버에 SSH 접속한 뒤 아래 순서로 확인하세요.

### web-lb / api-lb 둘 다 쓰는 경우 (둘 다 ACTIVE인데 502 나올 때)

구조가 보통 이렇게 됩니다:

```
클라이언트 → web-lb → nginx-proxy 인스턴스 → api-lb → photo-api 인스턴스
                         (여기서 /api 요청을 백엔드로 넘김)
```

- **web-lb**: nginx-proxy 인스턴스 앞에 있음. 정적(/) + /api 프록시 요청이 여기로 들어옴.
- **api-lb**: photo-api 인스턴스 앞에 있음. nginx-proxy가 **이쪽으로** /api 요청을 보내야 함.

**반드시 확인할 것:**

| 확인 항목 | 설명 |
|-----------|------|
| **BACKEND_UPSTREAM이 api-lb를 가리키는지** | nginx-proxy는 **api-lb VIP:포트**로 보내야 합니다. **web-lb VIP를 넣으면 안 됩니다.** (web-lb는 nginx-proxy한테 오는 입구일 뿐) |
| **어디서 curl 해봤는지** | `curl api-lb/health`는 **nginx-proxy가 떠 있는 인스턴스(web-lb 멤버)** 에서 실행해야 합니다. 다른 PC나 web-lb VIP에서 하면 의미가 다름. |
| **api-lb 쪽 보안 그룹** | **nginx-proxy 인스턴스 → api-lb VIP** 로의 인바운드가 허용돼 있어야 합니다. api-lb 멤버(photo-api)만 ACTIVE라서는 부족하고, nginx-proxy가 api-lb에 접속 가능해야 합니다. |

**점검 순서 (nginx-proxy 인스턴스에 SSH 접속한 뒤):**

```bash
# 1) 지금 백엔드로 잡혀 있는 주소 확인
cat /opt/nginx-proxy/conf.d/backend.upstream.conf
# → server 뒤가 api-lb VIP:리스너포트 인지 확인 (web-lb 아님)

# 2) 이 인스턴스에서 api-lb로 직접 요청
curl -v --connect-timeout 5 "http://<api-lb_VIP>:<리스너_포트>/health"
# 200이 나와야 함. 실패하면 위 보안 그룹/네트워크 확인

# 3) nginx 에러 로그 (원인 메시지 확인)
sudo tail -50 /var/log/nginx/nginx-proxy-error.log
# "connection refused", "timed out" 등으로 어디에서 끊기는지 확인
```

**정리**: web-lb·api-lb 둘 다 ACTIVE여도, **nginx-proxy가 BACKEND_UPSTREAM으로 api-lb를 바라보고 있고**, **nginx-proxy 인스턴스에서 api-lb VIP로 curl이 성공해야** /api 요청이 502 없이 동작합니다.

---

### 로드밸런서(photo-api)로 라우팅할 때 502 — 멤버는 ACTIVE인데 502가 나는 경우

로드밸런서 콘솔에서 멤버가 ACTIVE라도 **nginx-proxy → 로드밸런서(VIP) 구간**에서 실패하면 502가 납니다. 아래를 순서대로 점검하세요.

1. **포트 일치 여부**  
   `BACKEND_UPSTREAM`의 포트는 **로드밸런서 리스너 포트**와 같아야 합니다.  
   - photo-api 인스턴스는 **8000** 포트에서 동작합니다 (`uvicorn --port 8000`).  
   - LB 리스너가 **80**이면 `BACKEND_UPSTREAM=LB_VIP:80`, 리스너가 **8000**이면 `BACKEND_UPSTREAM=LB_VIP:8000`으로 설정해야 합니다.  
   - 잘못된 포트(예: LB는 8000인데 nginx만 80으로 연결)면 연결 거부/타임아웃 → 502입니다.

2. **nginx-proxy → LB VIP 연결 테스트**  
   nginx-proxy가 떠 있는 **같은 인스턴스**에서:
   ```bash
   # BACKEND_UPSTREAM에 넣은 값 그대로 사용 (예: LB VIP 10.0.0.100, 리스너 80)
   curl -v --connect-timeout 5 "http://<LB_VIP>:<리스너_포트>/health"
   ```
   - **200**이 나오면: nginx 설정(업스트림/타임아웃 등) 또는 keepalive 등 추가 점검.  
   - **연결 거부/타임아웃(000)**이면: **네트워크/보안 그룹** 문제입니다.  
     - “멤버 ACTIVE”는 **LB → 멤버(photo-api 인스턴스)** 통신만 의미합니다.  
     - **nginx-proxy 인스턴스 → LB VIP** 방향은 별도로 허용돼 있어야 합니다.  
     - ACG/보안 그룹에서 nginx-proxy 인스턴스(또는 해당 서브넷)가 **LB VIP의 리스너 포트**로 접근 가능한지 확인하세요.

3. **현재 적용된 업스트림 확인**
   ```bash
   cat /opt/nginx-proxy/conf.d/backend.upstream.conf
   grep BACKEND_UPSTREAM /opt/nginx-proxy/.env
   ```
   LB VIP와 리스너 포트가 위에서 확인한 값과 일치하는지 봅니다.

4. **수정 후 적용**
   ```bash
   export BACKEND_UPSTREAM="LB_VIP:리스너포트"   # 예: 10.0.0.100:80 또는 10.0.0.100:8000
   sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh
   ```

**요약**:  
- `BACKEND_UPSTREAM` = **로드밸런서 VIP:리스너포트** (photo-api 인스턴스 IP가 아님).  
- 멤버 ACTIVE ≠ nginx-proxy → LB 연결 성공. **프록시 서버에서 `curl http://LB_VIP:포트/health`** 가 성공해야 합니다.

---

### 직접 백엔드(인스턴스) IP로 연결할 때

1. **백엔드 주소가 올바른지**
   ```bash
   cat /opt/nginx-proxy/conf.d/backend.upstream.conf
   ```
   `server` 뒤에 **실제 FastAPI가 떠 있는 IP:포트**가 있어야 합니다 (예: `10.0.0.5:8000`). `__BACKEND_UPSTREAM__` 그대로면 설정이 적용된 적이 없음.

2. **.env에 설정된 값**
   ```bash
   grep BACKEND_UPSTREAM /opt/nginx-proxy/.env
   ```

3. **프록시 → 백엔드 연결 테스트**  
   위에서 확인한 IP와 포트(예: 8000)로:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://백엔드IP:8000/health
   # 또는
   curl -s -o /dev/null -w "%{http_code}" http://백엔드IP:8000/
   ```
   `200`이 나와야 합니다. 연결 실패(000, timeout)면 **네트워크/방화벽** 문제(서브넷·ACG·보안 그룹에서 프록시 → 백엔드 포트 허용 여부) 또는 **백엔드 서버에서 FastAPI 미기동**을 의심하세요.

4. **수정 후 적용**
   ```bash
   export BACKEND_UPSTREAM="실제_백엔드_IP:8000"
   sudo /opt/nginx-proxy/deploy/apply-env-and-restart.sh
   ```

**요약**: `BACKEND_UPSTREAM`이 FastAPI가 실제로 떠 있는 서버의 IP:포트를 가리키고, 프록시 서버에서 그 주소로 접속 가능해야 합니다.

---

## 참고

- **photo-api** 공유 링크: `/share/{token}` 경로가 그대로 백엔드(photo-api)로 프록시됨.
- **클라이언트 IP**: `X-Forwarded-For`, `X-Real-IP` 헤더로 무조건 전달됨.
- **SSL**: 추후 `conf/nginx-proxy.conf` 하단의 HTTPS 블록 주석 해제 후 인증서 경로 설정.
