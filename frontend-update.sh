#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Deploying AnantYatra Frontend to VPS..."

echo "Pulling latest changes from Git..."
git pull origin master

echo "Installing client dependencies..."
cd client
npm install

echo "Building the frontend..."
npm run build

echo "Copying built files to Nginx web directory..."
sudo cp -r ./dist/* /var/www/anantyatra.codesagepath.dev/html/

echo "Frontend deployment complete! The live website has been updated."
