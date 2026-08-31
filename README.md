# AnantYatra — Infinite Journey Planner

[![Live App](https://img.shields.io/badge/Live_App-anantyatra.codesagepath.dev-042A2B?logo=google-maps&logoColor=white&style=for-the-badge)](https://anantyatra.codesagepath.dev/)
[![Release](https://img.shields.io/github/v/release/CodeSagePath/AnantYatra?color=FF6B6B&label=Latest_Release&style=for-the-badge)](https://github.com/CodeSagePath/AnantYatra/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

[![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react&logoColor=black&style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white&style=flat-square)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=nodedotjs&logoColor=white&style=flat-square)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=Prisma&logoColor=white&style=flat-square)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white&style=flat-square)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white&style=flat-square)](https://www.docker.com/)

AnantYatra (Infinite Journeys) is a full-stack, map-first route planning platform designed for calculating complex multi-stop road trips without artificial waypoint limits. It combines a responsive floating interface with a self-hosted C++ Valhalla routing engine for high-performance navigation across multiple vehicle transport modes.

**Live Application**: [anantyatra.codesagepath.dev](https://anantyatra.codesagepath.dev/)

---

## Interface Preview

![AnantYatra Interface Preview](docs/preview.png)

---

## Core Capabilities

- **Unlimited Waypoint Planning**: Construct itineraries with any number of stops, bypassing the artificial location limits common in public routing APIs.
- **Smart Date Scheduling**: Dynamic day-wise itinerary planning with automatic start and end date recalculations based on waypoint stay durations.
- **Contextual Rest-Stop Prompts**: Intelligent monitoring of driving segments that proactively recommends rest stops for long-distance legs exceeding 150 km.
- **Drag-and-Drop Itinerary Management**: Reorder stops dynamically on the fly using interactive drag-and-drop handles powered by `@dnd-kit`.
- **Google Maps-Style Transport Selector**: Switch vehicle profiles to recalculate real-time routes instantly:
  - **Drive** (`auto`): Optimized for automobile highway and standard road networks.
  - **Two-Wheeler** (`motorcycle`): Tailored for motorcycles and scooters.
  - **Cycle** (`bicycle`): Uses designated bike paths and lower-speed secondary roads.
  - **Walk** (`pedestrian`): Direct pedestrian paths, footbridges, and walking routes.
  - **Truck** (`truck`): Routing tailored for commercial heavy-duty transport.
- **Advanced Export Engine**: Download high-fidelity, Valhalla-traced route polylines as geographical SVG maps or stylized PDF documents.
- **Live Check-in & Public Sharing**: Generate unique share links for your trips and track real-time check-in map trails.
- **Geocoding & Location Search**: Instant place lookup using OpenStreetMap Nominatim with local search history caching.
- **Mobile-Optimized Interface**: Gesture-driven bottom sheet drawer, touch-friendly interactive targets, and unobscured map controls for handheld devices.
- **Theme Support**: Seamless Dark and Light UI themes with customized HSL color palettes, high-contrast inputs, and glassmorphism styling.
- **Itinerary Persistence**: Save, load, and overwrite custom routes securely with robust JWT-based authentication and global session interception.

---

## Architecture & Tech Stack

### Frontend
- **Framework**: React 19, TypeScript, Vite
- **Mapping & Visuals**: React-Leaflet, OpenStreetMap tiles
- **Styling & UI**: Tailwind CSS, Lucide Icons, Custom HSL Design Tokens
- **State Management**: Zustand (Auth, Theme, Route State)
- **Interactivity**: `@dnd-kit` for drag-and-drop waypoint sorting

### Backend API
- **Runtime & Server**: Node.js with Express
- **Database & ORM**: SQLite managed via Prisma ORM
- **Security & Auth**: JSON Web Tokens (JWT) with Bcrypt password hashing

### Routing Infrastructure
- **Engine**: Containerized Valhalla C++ routing engine running via Docker
- **Automation**: Custom shell scripts for zero-downtime container management and limit patching

---

## Quick Start Guide

### Prerequisites
Before running the application locally, ensure your machine has:
- Node.js (version 18 or higher)
- npm (version 9 or higher)
- Docker (required for the Valhalla C++ routing service)
- Git

---

### Step 1: Clone the Repository
Clone the codebase to your local machine:
```bash
git clone https://github.com/CodeSagePath/AnantYatra.git
cd AnantYatra
```

To check out a specific release version (for example, v1.0.0):
```bash
git clone --branch v1.0.0 https://github.com/CodeSagePath/AnantYatra.git
cd AnantYatra
```

---

### Step 2: Start the Valhalla Routing Engine
AnantYatra uses a containerized Valhalla routing engine. Run the interactive Docker manager script:
```bash
./docker-valhalla.sh
```
Select option 1 to start the Valhalla container on port 5005.

---

### Step 3: Configure and Start the Backend Server
Navigate to the server directory, install dependencies, configure environment variables, and initialize the database:

```bash
cd server
npm install
cp .env.example .env
npx prisma db push
npm run dev
```
The backend API server will listen on `http://localhost:5005`.

---

### Step 4: Configure and Start the Frontend Client
In a new terminal window, navigate to the client directory, install dependencies, and launch Vite:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```
Open `http://localhost:5173` in your browser to access the application.

---

## Environment Configuration

### Backend Server (`server/.env`)
```env
PORT=5005
DATABASE_URL="file:./dev.db"
JWT_SECRET="your_secure_jwt_secret"
ROUTING_HOST="http://localhost:5005"
```

### Frontend Client (`client/.env`)
```env
VITE_API_URL="http://localhost:5005"
```

---

## Production Deployment Automation

For Linux VPS deployments (using PM2 and Nginx), helper scripts are provided in the project root:

- **Deploy Backend Updates**:
  ```bash
  ./backend-update.sh
  ```
- **Deploy Frontend Updates**:
  ```bash
  ./frontend-update.sh
  ```
- **Manage Docker Routing Container**:
  ```bash
  ./docker-valhalla.sh
  ```

---

## Contributing

Contributions are welcome. If you would like to report a bug or propose a feature:
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/new-feature`).
3. Commit your changes (`git commit -m 'Add new feature'`).
4. Push to the branch (`git push origin feature/new-feature`).
5. Open a Pull Request with a clear description of your changes.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
