# AnantYatra — Infinite Journey Planner

AnantYatra is a full-stack route planning application that allows users to add unlimited waypoints to a single trip. It utilizes Ola Maps for location search and a self-hosted OSRM server for route calculation.

## Features

- **Place Search** – Autocomplete-powered location search using the Ola Maps API.
- **Unlimited Waypoints** – Add, reorder, or remove any number of stops.
- **Dynamic Routing** – Real-time route display with total distance and duration calculation.
- **User Authentication** – JWT authentication with SQLite persistence.
- **Save and Load Routes** – Store routes per user in a local SQLite database.
- **MVC Architecture** – Modular structure separating models, controllers, and services.

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Shadcn UI, React Leaflet
- **Backend:** Node.js, Express, Prisma ORM, SQLite
- **Mapping:** Ola Maps API, OSRM (Open Source Routing Machine)
- **Authentication:** JWT, bcrypt

## Getting Started

```bash
# Clone repository
git clone https://github.com/your-username/anantyatra.git

# Backend setup
cd server
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run dev

# Frontend setup (in a separate terminal)
cd client
npm install
npm run dev
```
