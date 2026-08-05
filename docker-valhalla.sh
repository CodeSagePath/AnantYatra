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

patch_valhalla_json() {
  echo "Patching valhalla.json configuration files..."
  python3 -c "
import json, glob, os
ALLOWED_MODES = {'auto', 'bicycle', 'bikeshare', 'bus', 'motor_scooter', 'motorcycle', 'multimodal', 'pedestrian', 'taxi', 'transit', 'truck', 'route'}
for path in glob.glob('**/valhalla.json', recursive=True):
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        if 'service_limits' in data:
            for mode in data['service_limits']:
                if mode in ALLOWED_MODES and isinstance(data['service_limits'][mode], dict):
                    if 'max_locations' in data['service_limits'][mode]:
                        data['service_limits'][mode]['max_locations'] = 2000
                    if 'max_distance' in data['service_limits'][mode]:
                        data['service_limits'][mode]['max_distance'] = 999999999.0
            # Ensure centroid is reset to safe C++ limit (<= 100)
            if 'centroid' in data['service_limits'] and isinstance(data['service_limits']['centroid'], dict):
                data['service_limits']['centroid']['max_locations'] = 100
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        print('Successfully patched limits in:', path)
    except Exception as e:
        print('Error patching', path, ':', e)
"
}

case $option in
  1)
    patch_valhalla_json
    echo "Checking for existing container..."
    if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
        echo "Starting existing container..."
        docker start $CONTAINER_NAME
    else
        echo "Spinning up new Valhalla container..."
        docker run -d --name $CONTAINER_NAME -p 5005:8002 \
            -v $(pwd)/custom_files:/custom_files \
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
    patch_valhalla_json
    echo "Recreating Valhalla container to apply new limits..."
    docker rm -f $CONTAINER_NAME 2>/dev/null || true
    echo "Spinning up new Valhalla container..."
    docker run -d --name $CONTAINER_NAME -p 5005:8002 \
        -v $(pwd)/custom_files:/custom_files \
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
