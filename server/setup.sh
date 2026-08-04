#!/usr/bin/env bash
set -e

echo "========================================"
echo "   AnantYatra Server Setup Script       "
echo "========================================"

# 1. Create a dedicated directory for SQLite database storage
DB_DIR="./db"
if [ ! -d "$DB_DIR" ]; then
  echo "[INFO] Creating database directory at $DB_DIR..."
  mkdir -p "$DB_DIR"
fi

# 2. Setup .env file if it doesn't exist
if [ ! -f ".env" ]; then
  echo "[INFO] Creating .env file from .env.example..."
  cp .env.example .env
  
  # Generate a random 64-char hex JWT secret key
  JWT_GEN_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/JWT_SECRET=.*/JWT_SECRET=\"$JWT_GEN_SECRET\"/" .env
  
  # Point DATABASE_URL to the dedicated ./db directory
  sed -i 's|DATABASE_URL=.*|DATABASE_URL="file:./db/anantyatra.db"|' .env
else
  # Ensure DATABASE_URL in existing .env points to ./db directory
  if ! grep -q "file:./db/" .env; then
    echo "[INFO] Updating DATABASE_URL in .env to point to ./db/anantyatra.db..."
    sed -i 's|DATABASE_URL=.*|DATABASE_URL="file:./db/anantyatra.db"|' .env
  fi
fi

# 3. Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "[INFO] Installing npm dependencies..."
  npm install
fi

# 4. Prisma Client Generation & Database Migration
echo "[INFO] Generating Prisma Client..."
npx prisma generate

echo "[INFO] Applying database migrations..."
npx prisma migrate dev --name init

# 5. Build TypeScript code to dist/ (if src contains .ts files)
if [ -d "src" ] && [ "$(ls -A src/*.ts 2>/dev/null)" ]; then
  echo "[INFO] Building server (TypeScript compilation)..."
  npm run build
else
  echo "[INFO] Skipping TypeScript compilation (no .ts files in src/ yet)."
fi

echo "========================================"
echo "[SUCCESS] Server setup complete!"
echo "Database location: ./db/anantyatra.db"
echo "Start dev server:  npm run dev"
echo "Start prod server: npm start"
echo "========================================"
