const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, "http://localhost:3000"]
  : "*";

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// In-memory room store
// rooms[code] = { host, videoId, state: { playing, currentTime, updatedAt }, users: Map }
const rooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getRoomPublicData(room) {
  return {
    code: room.code,
    videoId: room.videoId,
    state: room.state,
    userCount: room.users.size,
    users: Array.from(room.users.values()).map((u) => ({ id: u.id, name: u.name, isHost: u.isHost, peerId: u.peerId })),
  };
}

// REST: health check
app.get("/health", (req, res) => res.json({ status: "ok", rooms: rooms.size }));

// REST: create room
app.post("/api/rooms", (req, res) => {
  const { hostName, videoId } = req.body;
  if (!hostName) return res.status(400).json({ error: "hostName required" });

  let code;
  do { code = generateRoomCode(); } while (rooms.has(code));

  rooms.set(code, {
    code,
    host: null, // will be set on socket connect
    videoId: videoId || null,
    state: { playing: false, currentTime: 0, updatedAt: Date.now() },
    users: new Map(),
    pendingHost: hostName,
  });

  res.json({ code });
});

// REST: check room exists
app.get("/api/rooms/:code", (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ code: room.code, userCount: room.users.size, videoId: room.videoId });
});

// Socket.io
io.on("connection", (socket) => {
  let currentRoom = null;
  let currentUser = null;

  // Join room
  socket.on("join_room", ({ code, userName }, callback) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return callback?.({ error: "Room not found" });

    const isHost = room.users.size === 0 || room.pendingHost === userName;
    const user = { id: socket.id, name: userName, isHost };

    room.users.set(socket.id, user);
    if (isHost) {
      room.host = socket.id;
      room.pendingHost = null;
    }

    currentRoom = room;
    currentUser = user;
    socket.join(code);

    // Send current state to joining user
    callback?.({
      success: true,
      room: getRoomPublicData(room),
      isHost,
      userId: socket.id,
    });

    // Notify others
    socket.to(code).emit("user_joined", {
      user: { id: user.id, name: user.name, isHost: user.isHost, peerId: user.peerId },
      userCount: room.users.size,
    });
  });

  // Voice ready
  socket.on("voice_ready", ({ peerId }) => {
    if (!currentRoom || !currentUser) return;
    currentUser.peerId = peerId;
    socket.to(currentRoom.code).emit("user_voice_ready", { userId: currentUser.id, peerId });
  });

  // Host sets video
  socket.on("set_video", ({ videoId }) => {
    if (!currentRoom || currentUser?.id !== currentRoom.host) return;
    currentRoom.videoId = videoId;
    currentRoom.state = { playing: false, currentTime: 0, updatedAt: Date.now() };
    io.to(currentRoom.code).emit("video_changed", { videoId, state: currentRoom.state });
  });

  // Sync: play/pause/seek
  socket.on("sync_event", ({ type, currentTime, playing }) => {
    if (!currentRoom || currentUser?.id !== currentRoom.host) return;
    currentRoom.state = { playing: playing ?? currentRoom.state.playing, currentTime: currentTime ?? currentRoom.state.currentTime, updatedAt: Date.now() };
    socket.to(currentRoom.code).emit("sync_event", { type, currentTime: currentRoom.state.currentTime, playing: currentRoom.state.playing });
  });

  // Non-host requests current time (on join/reconnect)
  socket.on("request_sync", () => {
    if (!currentRoom) return;
    socket.emit("sync_event", { type: "seek", currentTime: currentRoom.state.currentTime, playing: currentRoom.state.playing });
  });

  // Chat message
  socket.on("chat_message", ({ message }) => {
    if (!currentRoom || !currentUser) return;
    if (!message || message.trim().length === 0) return;
    io.to(currentRoom.code).emit("chat_message", {
      userId: currentUser.id,
      userName: currentUser.name,
      message: message.trim().substring(0, 300),
      timestamp: Date.now(),
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (!currentRoom || !currentUser) return;
    currentRoom.users.delete(socket.id);
    io.to(currentRoom.code).emit("user_left", {
      userId: currentUser.id,
      userName: currentUser.name,
      userCount: currentRoom.users.size,
    });

    // Transfer host if host left
    if (currentRoom.host === socket.id && currentRoom.users.size > 0) {
      const newHost = currentRoom.users.values().next().value;
      newHost.isHost = true;
      currentRoom.host = newHost.id;
      io.to(currentRoom.code).emit("host_changed", { newHostId: newHost.id, newHostName: newHost.name });
    }

    // Clean up empty rooms after 10 min
    if (currentRoom.users.size === 0) {
      setTimeout(() => {
        if (rooms.get(currentRoom.code)?.users.size === 0) {
          rooms.delete(currentRoom.code);
        }
      }, 600000);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`SyncTube backend running on port ${PORT}`));
