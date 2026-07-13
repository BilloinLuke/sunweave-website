#!/bin/zsh
# 一键重启 node server.js
# 用法：
#   1) 首次给执行权限： chmod +x restart.sh
#   2) 以后重启直接：   ./restart.sh
#   3) 或任意位置：     /Users/Luke/WorkBuddy/2026-07-11-22-16-10/restart.sh

set -e

# 无论在哪里执行，都切到本脚本所在目录
cd "$(dirname "$0")"

echo "==> 项目目录: $(pwd)"

# 1. 停掉旧进程
if pgrep -f "node server.js" >/dev/null 2>&1; then
  echo "==> 停止旧 node server.js 进程..."
  pkill -f "node server.js"
  sleep 1
else
  echo "==> 没有发现正在运行的 node server.js"
fi

# 2. 启动新进程（后台运行，日志写入 server.log）
echo "==> 启动 node server.js ..."
nohup node server.js > server.log 2>&1 &

# 3. 等一秒，检查是否真起来了
sleep 1
if pgrep -f "node server.js" >/dev/null 2>&1; then
  echo "✅ 已启动 (PID: $(pgrep -f 'node server.js' | head -1))"
  echo "📄 实时日志: tail -f server.log"
  URL=$(grep -oE 'http://localhost:[0-9]+' server.log 2>/dev/null | head -1)
  echo "🌐 访问:    ${URL:-http://localhost:8123}"
else
  echo "❌ 启动失败，最近日志："
  tail -n 20 server.log 2>/dev/null || echo "(无日志)"
  exit 1
fi
