#!/bin/bash
# Kill processes on common dev ports (3000, 3001, 3002, 8000)
# Usage: ./scripts/kill_ports.sh
for port in 3000 3001 3002 8000; do
  pids=$(lsof -t -i :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing process(es) on port $port: $pids"
    kill -9 $pids 2>/dev/null
  else
    echo "Port $port: free"
  fi
done
