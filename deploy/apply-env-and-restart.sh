#!/usr/bin/env bash
#
# NHN Deploy User Command용: BACKEND_UPSTREAM + Observability 변수 반영 후 nginx/Promtail/Pushgateway 재시작.
# 환경 변수 또는 /opt/nginx-proxy/.env 에서 읽어 backend.upstream.conf 생성·.env 병합·서비스 reload.
#
set -euo pipefail

OPT_DIR="${OPT_DIR:-/opt/nginx-proxy}"
ENV_FILE="${ENV_FILE:-$OPT_DIR/.env}"
CONF_DIR="${CONF_DIR:-$OPT_DIR/conf.d}"
TEMPLATE="${TEMPLATE:-$OPT_DIR/conf/backend.upstream.conf.template}"
BACKEND_CONF="${BACKEND_CONF:-$CONF_DIR/backend.upstream.conf}"
# 기본값 (수정 시 여기만 바꾸면 됨)
DEFAULT_BACKEND="${DEFAULT_BACKEND:-192.168.2.55:80}"
DEFAULT_LOKI_URL="${DEFAULT_LOKI_URL:-http://192.168.4.73:3100}"
DEFAULT_PUSHGATEWAY_URL="${DEFAULT_PUSHGATEWAY_URL:-http://192.168.4.73:9091}"

# .env에 쓸 수 있는 변수 (export 후 실행 시 병합됨)
ENV_KEYS=(
  BACKEND_UPSTREAM
  LOKI_URL
  PROMETHEUS_PUSHGATEWAY_URL
  INSTANCE_IP
  PUSHGATEWAY_JOB
)

# .env를 먼저 로드 (있으면) — 이후 스크립트 기본값이 비어 있는 것만 채움
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE" 2>/dev/null || true
  set +a
fi

# .env에 없거나 비어 있으면 상단 DEFAULT_* 변수 사용
BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-$DEFAULT_BACKEND}"
# 127.0.0.1:8000은 CI/이미지 빌드용. 실제 배포 시에는 기본 백엔드(api-lb)로 덮어쓴다.
[[ "${BACKEND_UPSTREAM}" == "127.0.0.1:8000" ]] && BACKEND_UPSTREAM="$DEFAULT_BACKEND"
LOKI_URL="${LOKI_URL:-$DEFAULT_LOKI_URL}"
PROMETHEUS_PUSHGATEWAY_URL="${PROMETHEUS_PUSHGATEWAY_URL:-$DEFAULT_PUSHGATEWAY_URL}"
INSTANCE_IP="${INSTANCE_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
export BACKEND_UPSTREAM LOKI_URL PROMETHEUS_PUSHGATEWAY_URL INSTANCE_IP

usage() {
  echo "Usage: export BACKEND_UPSTREAM=ip:port [LOKI_URL=...] ... && $0"
  echo "       $0 --env-file <파일>  # 파일 내용을 export 후 .env에 병합"
  echo "       $0 --stdin           # .env 전체를 stdin으로 덮어쓴 뒤 적용"
  echo "       $0 --restart-only   # 설정 변경 없이 서비스만 재시작"
  echo "       $0 --check-backend  # 백엔드(api-lb) 연결만 테스트 (502 원인 확인용)"
  echo "       $0 --debug          # 각 명령 출력하며 실행 (오류 위치 확인용)"
  exit 0
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
fi

# --debug: 실행되는 명령 그대로 출력 (set -x)
if [[ "${1:-}" == "--debug" ]]; then
  set -x
  shift
fi

# --env-file: 해당 파일을 source 한 뒤 .env 병합 (export 없이 파일로 설정 가능)
if [[ "${1:-}" == "--env-file" ]] && [[ -n "${2:-}" ]]; then
  if [[ -f "$2" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$2" 2>/dev/null || true
    set +a
    echo "Loaded env from $2"
  else
    echo "Error: file not found: $2" >&2
    exit 1
  fi
  shift 2
fi

if [[ "${1:-}" == "--restart-only" ]]; then
  echo "Reload only (no upstream rewrite)"
  sudo nginx -t && sudo systemctl reload nginx
  echo "Reloaded nginx"
  exit 0
fi

if [[ "${1:-}" == "--check-backend" ]]; then
  echo "=== 백엔드 연결 점검 (BACKEND_UPSTREAM=$BACKEND_UPSTREAM) ==="
  echo "  적용된 설정: $(sudo cat "$BACKEND_CONF" 2>/dev/null || echo '없음')"
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${BACKEND_UPSTREAM}/health" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "  curl http://${BACKEND_UPSTREAM}/health → HTTP $code (정상)"
    echo "  → 이 주소로 연결되는데 502면 nginx 캐시/재시작 또는 리스너 포트 재확인."
  else
    echo "  curl http://${BACKEND_UPSTREAM}/health → HTTP $code (실패)"
    echo "  → 연결 거부/타임아웃이면: BACKEND_UPSTREAM이 api-lb VIP:리스너포트인지, 보안 그룹(nginx-proxy→api-lb) 허용인지 확인."
    exit 1
  fi
  exit 0
fi

if [[ "${1:-}" == "--stdin" ]]; then
  sudo tee "$ENV_FILE" > /dev/null
  echo "Written .env from stdin to $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE" 2>/dev/null || true
  set +a
  BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-$DEFAULT_BACKEND}"
else
  # export된 값 + 기존 .env 병합하여 .env 갱신
  echo "[1/5] .env 병합 중..."
  tmp=$(mktemp)
  for key in "${ENV_KEYS[@]}"; do
    val="${!key:-}"
    if [[ -z "$val" ]] && [[ -f "$ENV_FILE" ]]; then
      line=$(sudo grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1) || true
      if [[ -n "$line" ]]; then
        val="${line#*=}"
        val="${val#\"}"; val="${val%\"}"
      fi
    fi
    if [[ -n "$val" ]]; then
      val_escaped="${val//$'\n'/ }"
      val_escaped="${val_escaped//\"/\\\"}"
      echo "${key}=\"${val_escaped}\"" >> "$tmp"
    fi
  done
  if [[ -s "$tmp" ]]; then
    sudo cp -f "$tmp" "$ENV_FILE"
    echo "  Written env to $ENV_FILE"
  fi
  rm -f "$tmp"
fi

echo "[2/5] backend.upstream.conf 생성..."
sudo mkdir -p "$CONF_DIR"
# 템플릿에서 placeholder 치환
if [[ -f "$TEMPLATE" ]]; then
  sed "s|__BACKEND_UPSTREAM__|$BACKEND_UPSTREAM|g" "$TEMPLATE" | sudo tee "$BACKEND_CONF" > /dev/null
  echo "Written $BACKEND_CONF (backend $BACKEND_UPSTREAM)"
else
  # 템플릿 없으면 최소 upstream만 작성
  echo "upstream photo_api_backend { server $BACKEND_UPSTREAM; keepalive 32; }" | sudo tee "$BACKEND_CONF" > /dev/null
  echo "  Written $BACKEND_CONF (no template)"
fi

echo "[3/5] nginx 설정 검사 및 reload..."
sudo nginx -t
sudo systemctl reload nginx
echo "  Nginx reloaded with BACKEND_UPSTREAM=$BACKEND_UPSTREAM"
sudo systemctl status nginx --no-pager || true

echo "[4/5] Promtail/Pushgateway 타이머 재시작..."
# Promtail: 먼저 disable → .env는 이미 [1/5]에서 반영됨 → LOKI_URL 있으면 enable+start
if systemctl list-unit-files --full promtail.service 2>/dev/null | grep -q promtail.service; then
  sudo systemctl stop promtail 2>/dev/null || true
  sudo systemctl disable promtail 2>/dev/null || true
  if [[ -n "${LOKI_URL:-}" ]]; then
    sudo systemctl enable promtail 2>/dev/null || true
    sudo systemctl start promtail 2>/dev/null || true
    echo "  Promtail enabled and started"
  else
    echo "  Promtail disabled (LOKI_URL not set)"
  fi
fi
if systemctl list-unit-files --full pushgateway-push.timer 2>/dev/null | grep -q pushgateway-push.timer; then
  sudo systemctl restart pushgateway-push.timer 2>/dev/null || true
  echo "  Restarted pushgateway-push.timer"
fi

echo "[5/5] 완료."
