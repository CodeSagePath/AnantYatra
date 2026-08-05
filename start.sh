#!/bin/bash
# start.sh - Interactive launcher for AnantYatra

echo "======================================"
echo "AnantYatra Launch Menu"
echo "======================================"
echo "1) Start Everything (Frontend + Backend concurrently)"
echo "2) Start Backend Only (API Server)"
echo "3) Start Frontend Only (React Vite Dev Server)"
echo "4) Exit"
echo "======================================"
read -p "Select an option [1-4]: " option

case $option in
  1)
    echo "Starting both Frontend and Backend..."
    # Kill background jobs on exit
    trap 'kill %1; kill %2' SIGINT
    cd server && npm run dev &
    cd client && npm run dev &
    wait
    ;;
  2)
    echo "Starting Backend..."
    cd server && npm run dev
    ;;
  3)
    echo "Starting Frontend..."
    cd client && npm run dev
    ;;
  4)
    echo "Exiting..."
    exit 0
    ;;
  *)
    echo "Invalid option selected."
    exit 1
    ;;
esac
