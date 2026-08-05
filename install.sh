#!/bin/bash
# install.sh - Dependency installation and build script for AnantYatra

echo "======================================"
echo "Installing AnantYatra Dependencies"
echo "======================================"

# 1. Install Backend Dependencies
echo "Installing Backend Dependencies..."
cd server
npm install

# 2. Generate Prisma Client
echo "Generating Prisma Client..."
npx prisma generate

# 3. Build Backend (if needed, currently runs via ts-node but good practice if you compile)
# npm run build 
cd ..

# 4. Install Frontend Dependencies
echo "Installing Frontend Dependencies..."
cd client
npm install

# 5. Build Frontend
echo "Building Frontend..."
npm run build
cd ..

echo "======================================"
echo "Installation Complete!"
echo "You can now run ./start.sh to launch the application."
echo "======================================"
