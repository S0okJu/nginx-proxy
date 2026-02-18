#!/usr/bin/env bash
#
# node_exporter(:9100) + nginx-exporter(:9113) 메트릭을 Pushgateway로 푸시.
# pushgateway-push.timer에서 30초마다 호출.
# 환경변수: PROMETHEUS_PUSHGATEWAY_URL (필수), INSTANCE_IP (선택, 미설정 시 hostname -I)
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/nginx-proxy/.env}"
if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE" 2>/dev/null || true
  set +a
fi

PUSHGATEWAY_URL="${PROMETHEUS_PUSHGATEWAY_URL:-}"
INSTANCE_IP="${INSTANCE_IP:-$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'unknown')}"

if [[ -z "$PUSHGATEWAY_URL" ]]; then
  exit 0
fi
PUSHGATEWAY_URL="${PUSHGATEWAY_URL%/}"

# Pushgateway: PUT = 해당 job/instance 그룹 전체 교체 (이전 푸시 덮어씀)
push_metrics() {
  local job="$1"
  local url="$2"
  local body
  body=$(curl -sf --max-time 5 "$url" 2>/dev/null) || true
  if [[ -n "$body" ]]; then
    echo "$body" | curl -sf --max-time 10 -X PUT --data-binary @- \
      "${PUSHGATEWAY_URL}/metrics/job/${job}/instance/${INSTANCE_IP}" || true
  fi
}

push_metrics "node_exporter" "http://127.0.0.1:9100/metrics"
push_metrics "nginx_exporter" "http://127.0.0.1:9113/metrics"
