# AnantYatra - Infinite Journey Planner

AnantYatra is a full-stack, responsive route planning application designed to allow users to construct complex journeys with an unlimited number of waypoints. It features a map-first architecture with a floating, responsive UI. 

The application utilizes Nominatim (OpenStreetMap) for robust location search and a self-hosted Valhalla routing engine via Docker for unlimited distance route calculations.

## Architecture and Tech Stack

### Frontend
- Framework: React 19 with TypeScript and Vite
- Styling: Tailwind CSS, Shadcn UI conventions
- Mapping: React Leaflet, OpenStreetMap tiles
- State Management: Zustand (Auth and Theme)

### Backend
- Server: Node.js with Express
- Database: SQLite (via Prisma ORM)
- Authentication: JWT (JSON Web Tokens) and bcrypt for password hashing

### Infrastructure
- Routing Engine: Valhalla (containerized via Docker)
- Deployment Automation: Custom bash scripts for zero-downtime updates

## Prerequisites

Before setting up the project, ensure you have the following installed on your system:
- Node.js (v18 or higher)
- npm (Node Package Manager)
- Docker (for the Valhalla routing engine)
- Git

## Local Development Setup

### 1. Database and Backend Server

Navigate to the server directory and install dependencies:
```bash
cd server
npm install
```

Set up your environment variables:
```bash
cp .env.example .env
```
Edit the `server/.env` file to include a secure `JWT_SECRET`. The default SQLite database path and routing host are already configured.

Initialize the SQLite database and generate the Prisma Client:
```bash
npx prisma db push
```

Start the backend development server:
```bash
npm run dev
```
The server will run on `http://localhost:5005` by default.

### 2. Frontend Client

Open a new terminal window, navigate to the client directory, and install dependencies:
```bash
cd client
npm install
```

Set up your environment variables:
```bash
cp .env.example .env
```
The default `.env` will point `VITE_API_URL` to your local backend server.

Start the frontend development server:
```bash
npm run dev
```
The client will be available on `http://localhost:5173`.

### 3. Valhalla Routing Engine

AnantYatra requires a running instance of Valhalla to calculate routes. A bash script is provided in the root directory to automatically pull and run the Valhalla Docker container with global routing limits unlocked.

Run the provided setup script:
```bash
./docker-valhalla.sh
```
Follow the prompts to download the necessary mapping data (PBF files) and start the container. The routing engine will bind to `http://localhost:8002`.

## Production Deployment

AnantYatra includes automated deployment scripts designed for a Linux Virtual Private Server (VPS) environment running PM2 and Nginx.

### Backend Deployment
To update the backend API to the latest Git commit:
```bash
./backend-update.sh
```
This script will:
1. Pull the latest master branch.
2. Install new dependencies.
3. Apply any Prisma database schema changes.
4. Compile the TypeScript codebase.
5. Restart the Node application via PM2 with zero downtime.

### Frontend Deployment
To update the React application:
```bash
./frontend-update.sh
```
This script will:
1. Pull the latest master branch.
2. Install new dependencies.
3. Build the production static bundle using Vite.
4. Copy the compiled assets into your Nginx `/var/www/` directory.

## Contributing & Support

Contributions are highly welcome! If you would like to improve AnantYatra, please follow these steps:
1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Commit your changes with clear, descriptive messages.
4. Submit a pull request detailing your proposed changes.

If you find this project useful, please consider giving it a star on GitHub. It helps others discover the project and supports continued development.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
