#!/usr/bin/env bash
#
# nginx-proxy 서버에 프론트 정적 배포
# 사용법: ./scripts/deploy-to-nginx-proxy.sh [user@host] [원격경로]
#   user@host: SSH 대상 (필수)
#   원격경로: 기본값 /opt/nginx-proxy/static
#
# 예: ./scripts/deploy-to-nginx-proxy.sh ubuntu@133.186.219.101
#     ./scripts/deploy-to-nginx-proxy.sh ubuntu@133.186.219.101 /opt/nginx-proxy/static
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

SSH_TARGET="${1:?Usage: $0 user@host [remote_path]}"
REMOTE_PATH="${2:-/opt/nginx-proxy/static}"

echo "=== nginx-proxy 정적 배포 ==="
echo "  대상: $SSH_TARGET"
echo "  경로: $REMOTE_PATH"
echo ""

echo "[1/2] 빌드 (VITE_API_BASE_URL=/api)..."
npm run build:proxy

echo "[2/2] rsync dist/ -> ${SSH_TARGET}:${REMOTE_PATH}/"
rsync -avz --delete dist/ "${SSH_TARGET}:${REMOTE_PATH}/"

echo ""
echo "배포 완료. 서버에서 nginx reload는 필요 없음 (정적만 갱신됨)."
