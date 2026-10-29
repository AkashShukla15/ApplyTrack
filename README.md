# ApplyTrack — Organized Main Files

This folder contains the main source files provided for the ApplyTrack job application tracker.

## Project structure

```text
applytrack/
├── client/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── style.css
└── server/
    ├── index.js
    ├── package.json
    └── .env.example
```

## Run locally

Prerequisites: Node.js and a running MongoDB instance, or a MongoDB Atlas connection string.

### 1. Backend
Open a terminal in `server/`:

```bash
npm install
```

Copy `.env.example` to `.env`, then set a strong `JWT_SECRET` and the correct `MONGODB_URI`.

```bash
npm start
```

Health check: `http://localhost:5000/api/health`

### 2. Frontend
Open a second terminal in `client/`:

```bash
npm install
```

Optional: copy `.env.example` to `.env` if you need to set the API URL.

```bash
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173`.

## Deployment settings

- Frontend: set `VITE_API_URL` to the deployed backend API base URL ending in `/api`.
- Backend: set `PORT`, `MONGODB_URI`, `JWT_SECRET`, and `CLIENT_ORIGIN` in your hosting provider's environment variables.
- Do not commit `.env` files or production secrets to GitHub.

## Important
This package organizes and formats the provided files and adjusts the backend start script to run `server/index.js`. The application has not been executed end-to-end here; verify database connectivity and API requests before deployment.
