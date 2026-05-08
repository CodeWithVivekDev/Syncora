# 🎬 SyncTube Connect

Real-time YouTube watch party app. Create a room, share the code, and watch videos in perfect sync with friends.

## Features

- 🎬 **Synchronized YouTube playback** — play, pause, seek stay in sync for all viewers
- 🔑 **Room codes** — 6-character codes to invite friends
- 👑 **Host controls** — only the host controls playback & video selection
- 💬 **Live chat** — built-in chat sidebar
- ⚡ **Real-time** — powered by WebSockets (Socket.io)
- 📱 **Responsive** — works on mobile and desktop

---

## Project Structure

```
synctube-connect/
├── frontend/          # Static files → deploy to GitHub Pages
│   ├── index.html     # Landing page (create/join room)
│   ├── room.html      # Watch room
│   ├── style.css      # Styles
│   ├── config.js      # ← SET YOUR BACKEND URL HERE
│   ├── app.js         # Landing page logic
│   └── room.js        # Room sync logic
└── backend/           # Node.js server → deploy to Railway/Render
    ├── src/
    │   └── server.js  # Express + Socket.io server
    └── package.json
```

---

## 🚀 Deployment Guide

### Step 1 — Deploy the Backend (Railway — Free Tier)

1. Go to [railway.app](https://railway.app) and sign up / log in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your repo, then click **Add Service → From repo**
4. Set the **Root Directory** to `backend`
5. Railway auto-detects Node.js and runs `npm start`
6. Once deployed, copy the public URL (e.g. `https://synctube-backend-production.up.railway.app`)

> **Alternative:** [Render.com](https://render.com) → New Web Service → Root dir: `backend` → Build: `npm install` → Start: `node src/server.js`

#### Set Environment Variables (optional)

| Variable | Value |
|---|---|
| `PORT` | `4000` (auto-set by Railway) |
| `FRONTEND_URL` | Your GitHub Pages URL |

---

### Step 2 — Configure the Frontend

Open `frontend/config.js` and set your backend URL:

```javascript
window.SYNCTUBE_CONFIG = {
  BACKEND_URL: "https://your-backend.up.railway.app",
};
```

---

### Step 3 — Deploy Frontend to GitHub Pages

1. Push your repo to GitHub
2. Go to **Settings → Pages**
3. Set source to: **Deploy from a branch**
4. Branch: `main`, folder: `/frontend`
5. Click Save → your site will be live at `https://yourusername.github.io/synctube-connect/`

---

## 🖥️ Local Development

### Backend

```bash
cd backend
npm install
npm run dev        # uses nodemon for auto-reload
# Runs on http://localhost:4000
```

### Frontend

Just open `frontend/index.html` in a browser (no build step needed).

Make sure `frontend/config.js` has:
```javascript
BACKEND_URL: "http://localhost:4000"
```

---

## How It Works

```
User A (Host)                    Server                    User B (Viewer)
─────────────                  ─────────                  ───────────────
Create room ──► POST /api/rooms
                                ← room code
Join via socket ──────────────► join_room event
                                                  Join via socket ──► join_room event
                                ◄── sync current state ──────────────
Load video ──► set_video ──────► broadcast video_changed ──────────► load video
Play ──────► sync_event ───────► broadcast sync_event ─────────────► play
Pause ─────► sync_event ───────► broadcast sync_event ─────────────► pause
```

- Host controls all playback; viewers receive events and mirror them
- Every 5 seconds, host sends a drift-correction tick
- Viewers seeking >1.5s out of sync are corrected automatically

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS |
| Backend | Node.js, Express, Socket.io |
| Video | YouTube IFrame Player API |
| Hosting (frontend) | GitHub Pages |
| Hosting (backend) | Railway / Render |

---

## License

MIT
