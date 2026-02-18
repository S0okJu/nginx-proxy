# nginx-proxy 검토 체크리스트

배포·운영 전에 확인하면 좋은 항목입니다.

---

## 1. 로그·Promtail

| 항목 | 상태 | 비고 |
|------|------|------|
| **로그 로테이트** | ⚠️ 미구성 시 검토 | nginx 기본은 로테이트 없음. `/var/log/nginx/nginx-proxy-access.log`가 무한 증가할 수 있음. `logrotate`로 일별/크기 제한 권장 (예: `conf/logrotate.nginx-proxy` 참고). |
| **Promtail 환경변수** | ✅ | `conf/promtail.service`는 `/opt/nginx-proxy/.env` 로드 후 `-config.expand-env=true`로 `${LOKI_URL}`, `${INSTANCE_IP}` 치환. 별도 envsubst 불필요. |
| **positions 디렉터리** | ✅ | CI에서 ` /var/lib/promtail` 생성. Promtail 기동 사용자(보통 root)가 쓰기 가능한지만 확인. |
| **access 로그 형식** | ✅ | `metrics_json` (JSON 한 줄). 파이프라인에서 `status` 문자열 변환 적용됨. |

---

## 2. 배포·스크립트

| 항목 | 상태 | 비고 |
|------|------|------|
| **verify-after-deploy.sh** | ⚠️ 없음 | `deploy/README.md`에서 참조하지만 레포에 없음. 필요 시 `curl`로 `/`, `/health`, `/_nginx_health` 검증 스크립트 추가하거나 README에서 해당 문구 제거/수정. |
| **Promtail 설정 경로** | ✅ | CI는 `conf/promtail-config.yaml` → `/opt/promtail/promtail-config.yaml` 복사. `promtail.service`도 해당 경로 사용. |
| **apply-env-and-restart.sh** | ✅ | `.env` 병합, backend.upstream 생성, nginx reload, Promtail enable/start (LOKI_URL 있을 때) 처리. |

---

## 3. 보안·노출

| 항목 | 상태 | 비고 |
|------|------|------|
| **stub_status** | ✅ | `allow 127.0.0.1; deny all;` — localhost만. |
| **/_nginx_health** | ⚠️ | 접근 로그 끄고 200 반환. 외부 노출 시 부하 검사용으로 쓰일 수 있음. LB 헬스만 쓰면 괜찮음. |
| **실제 IP 전달** | 주석 | `set_real_ip_from` / `real_ip_header` 는 LB 신뢰 시 주석 해제해 사용. |

---

## 4. SSL·HTTPS

| 항목 | 상태 | 비고 |
|------|------|------|
| **HTTPS** | 추후 | `nginx-proxy.conf` 하단 주석 블록. 인증서 경로 설정 후 적용. |

---

## 5. 문서 링크

- **로그 형식·Loki·점검**: [log-format-and-metrics.md](log-format-and-metrics.md)
- **배포**: [../deploy/README.md](../deploy/README.md)
