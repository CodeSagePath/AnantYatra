#!/bin/bash
# docker-valhalla.sh - Helper script for Valhalla Routing Engine

CONTAINER_NAME="valhalla_routing"

echo "======================================"
echo "Valhalla Docker Manager"
echo "======================================"
echo "1) Start Valhalla (Port 5005)"
echo "2) Stop Valhalla"
echo "3) View Valhalla Logs"
echo "4) Recreate Container (Apply new limits)"
echo "5) Exit"
echo "======================================"
read -p "Select an option [1-5]: " option

case $option in
  1)
    echo "Checking for existing container..."
    if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
        echo "Starting existing container..."
        docker start $CONTAINER_NAME
    else
        echo "Spinning up new Valhalla container..."
        # NOTE: Make sure your custom_files directory exists or adjust volume binding as needed.
        docker run -d --name $CONTAINER_NAME -p 5005:8002 \
            -v $(pwd)/custom_files:/custom_files \
            -e valhalla_service_limits_auto_max_distance=50000000.0 \
            -e valhalla_service_limits_bicycle_max_distance=50000000.0 \
            -e valhalla_service_limits_pedestrian_max_distance=50000000.0 \
            -e valhalla_service_limits_motorcycle_max_distance=50000000.0 \
            -e valhalla_service_limits_truck_max_distance=50000000.0 \
            ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    fi
    echo "Valhalla should now be accessible on http://localhost:5005"
    ;;
  2)
    echo "Stopping Valhalla..."
    docker stop $CONTAINER_NAME
    ;;
  3)
    echo "Following logs... (Press Ctrl+C to exit)"
    docker logs -f $CONTAINER_NAME
    ;;
  4)
    echo "Recreating Valhalla container to apply new limits..."
    docker rm -f $CONTAINER_NAME 2>/dev/null || true
    echo "Spinning up new Valhalla container..."
    docker run -d --name $CONTAINER_NAME -p 5005:8002 \
        -v $(pwd)/custom_files:/custom_files \
        -e valhalla_service_limits_auto_max_distance=999999999.0 \
        -e valhalla_service_limits_bicycle_max_distance=999999999.0 \
        -e valhalla_service_limits_pedestrian_max_distance=999999999.0 \
        -e valhalla_service_limits_motorcycle_max_distance=999999999.0 \
        -e valhalla_service_limits_truck_max_distance=999999999.0 \
        ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    echo "Valhalla should now be accessible on http://localhost:5005"
    ;;
  5)
    exit 0
    ;;
  *)
    echo "Invalid option."
    exit 1
    ;;
esac
