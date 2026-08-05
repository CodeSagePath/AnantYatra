#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Deploying AnantYatra Backend to VPS..."

echo "Pulling latest changes from Git..."
git pull origin master

echo "Installing backend dependencies..."
cd server
npm install

echo "Generating Prisma Client and applying schema changes..."
npx prisma generate
npx prisma db push --accept-data-loss

echo "Building the backend TypeScript code..."
npm run build

echo "Restarting the backend service via PM2..."
# Try to restart the existing PM2 process. If it doesn't exist, start a new one.
pm2 restart anantyatra-api 2>/dev/null || pm2 start dist/server.js --name "anantyatra-api"

echo "Backend deployment complete! The API is live."
