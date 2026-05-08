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
