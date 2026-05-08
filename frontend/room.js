// ============= Syncora Connect — Room Page =============
const API = window.SYNCORA_CONFIG.BACKEND_URL;

// Parse query params
const params = new URLSearchParams(window.location.search);
const ROOM_CODE = (params.get("code") || "").toUpperCase();
const USER_NAME = sessionStorage.getItem("syncora_name") || "Guest";

if (!ROOM_CODE) { window.location.href = "index.html"; }

// Avatar colors
const AV_COLORS = ["av-0","av-1","av-2","av-3","av-4","av-5"];
function avatarClass(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return AV_COLORS[h % AV_COLORS.length];
}
function initials(name) { return name.slice(0,2).toUpperCase(); }

// State
let socket, player, isHost = false, isPlayerReady = false;
let isSyncing = false; // suppress echo events
let isYoutubeApiReady = false;
let currentRoomState = null;

// ---- Socket Setup ----
socket = io(API, { transports: ["websocket", "polling"] });

socket.on("connect", () => {
  setStatus("Connected", "green");
  socket.emit("join_room", { code: ROOM_CODE, userName: USER_NAME }, (res) => {
    if (res.error) {
      alert("Could not join room: " + res.error);
      window.location.href = "index.html";
      return;
    }
    isHost = res.isHost;
    currentRoomState = res.room;
    applyRoomState(res.room);
    initYouTubePlayer(); // Init player if API is ready
    if (!isHost) socket.emit("request_sync");
    
    // Once joined, check if Peer is ready to emit ID
    if (peer && peer.id) {
      socket.emit("voice_ready", { peerId: peer.id });
    }
  });
});

socket.on("disconnect", () => setStatus("Disconnected", "red"));
socket.on("connect_error", () => setStatus("Connection error", "red"));

socket.on("video_changed", ({ videoId, state }) => {
  if (currentRoomState) currentRoomState.videoId = videoId;
  loadYTVideo(videoId);
  addSystemMsg(`Host loaded a new video.`);
});

socket.on("sync_event", ({ type, currentTime, playing }) => {
  if (!isPlayerReady || isHost) return;
  if (!currentRoomState || !currentRoomState.videoId) return; // Wait for video to be loaded

  isSyncing = true;
  if (typeof player.getCurrentTime === "function") {
    if (Math.abs(player.getCurrentTime() - currentTime) > 1.5) player.seekTo(currentTime, true);
  }
  
  if (playing && typeof player.playVideo === "function") player.playVideo(); 
  else if (!playing && typeof player.pauseVideo === "function") player.pauseVideo();
  
  setTimeout(() => isSyncing = false, 500);
});

socket.on("user_joined", ({ user, userCount }) => {
  addSystemMsg(`${user.name} joined.`);
  document.getElementById("userCountNum").textContent = userCount;
  if (currentRoomState && currentRoomState.users) {
    currentRoomState.users.push(user);
  }
});

socket.on("user_left", ({ userName, userCount, userId }) => {
  addSystemMsg(`${userName} left.`);
  document.getElementById("userCountNum").textContent = userCount;
  if (currentRoomState && currentRoomState.users) {
    currentRoomState.users = currentRoomState.users.filter(u => u.id !== userId);
  }
});

socket.on("host_changed", ({ newHostName }) => {
  addSystemMsg(`${newHostName} is now the host.`);
});

socket.on("chat_message", ({ userName, message, timestamp }) => {
  appendChatMsg(userName, message, timestamp, userName === USER_NAME);
});

// ---- Room UI Setup ----
function applyRoomState(room) {
  document.getElementById("roomCodeDisplay").textContent = room.code;
  document.getElementById("userCountNum").textContent = room.userCount;
  document.title = `Syncora — ${room.code}`;

  if (isHost) {
    document.getElementById("hostBadge").classList.remove("hidden");
    document.getElementById("videoControls").classList.remove("hidden");
  }

  if (room.videoId) loadYTVideo(room.videoId);
}

// ---- YouTube IFrame API ----
window.onYouTubeIframeAPIReady = function() {
  isYoutubeApiReady = true;
  initYouTubePlayer();
};

function initYouTubePlayer() {
  if (isYoutubeApiReady && currentRoomState && !player) {
    player = new YT.Player("ytPlayer", {
      height: "100%",
      width: "100%",
      videoId: "",
      playerVars: { autoplay: 0, controls: isHost ? 1 : 0, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => { 
          isPlayerReady = true; 
          if (currentRoomState.videoId) {
            loadYTVideo(currentRoomState.videoId);
          }
        },
        onStateChange: onPlayerStateChange,
      },
    });
  }
}

function loadYTVideo(videoId) {
  document.getElementById("playerPlaceholder").classList.add("hidden");
  if (isPlayerReady && videoId) {
    player.loadVideoById(videoId);
  }
}

function onPlayerStateChange(event) {
  if (!isHost || isSyncing) return;
  const t = player.getCurrentTime();
  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit("sync_event", { type: "play", currentTime: t, playing: true });
  } else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit("sync_event", { type: "pause", currentTime: t, playing: false });
  }
}

// Periodic sync for drift correction (every 5s)
setInterval(() => {
  if (isHost && isPlayerReady && typeof player.getPlayerState === "function" && player.getPlayerState() === YT.PlayerState.PLAYING) {
    socket.emit("sync_event", { type: "tick", currentTime: player.getCurrentTime(), playing: true });
  }
}, 5000);

// ---- Host: Load Video ----
document.getElementById("loadVideoBtn").addEventListener("click", () => {
  const url = document.getElementById("videoUrlInput").value.trim();
  const videoId = extractVideoId(url);
  if (!videoId) return showToast("Couldn't parse YouTube URL");
  socket.emit("set_video", { videoId });
  loadYTVideo(videoId);
  document.getElementById("videoUrlInput").value = "";
});

document.getElementById("videoUrlInput").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("loadVideoBtn").click();
});

// ---- Copy Room Code ----
document.getElementById("copyCodeBtn").addEventListener("click", () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?code=${ROOM_CODE}`;
  navigator.clipboard.writeText(shareUrl).then(() => showToast("Room link copied!")).catch(() => {
    navigator.clipboard.writeText(ROOM_CODE).then(() => showToast("Room code copied!"));
  });
});

// ---- Chat ----
document.getElementById("sendBtn").addEventListener("click", sendChat);
document.getElementById("chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter") sendChat();
});

function sendChat() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit("chat_message", { message: msg });
  input.value = "";
}

function appendChatMsg(userName, message, timestamp, isSelf) {
  const el = document.createElement("div");
  el.className = "chat-msg";
  const t = new Date(timestamp);
  const timeStr = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-name ${isSelf ? "" : ""}">${escHtml(userName)}</span>
      <span class="chat-msg-time">${timeStr}</span>
    </div>
    <div class="chat-msg-text">${escHtml(message)}</div>
  `;
  const container = document.getElementById("chatMessages");
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function addSystemMsg(text) {
  const el = document.createElement("div");
  el.className = "chat-system-msg";
  el.textContent = text;
  const container = document.getElementById("chatMessages");
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ---- Helpers ----
function setStatus(text, color) {
  document.getElementById("syncStatusText").textContent = text;
  const dot = document.querySelector(".ss-dot");
  dot.className = "ss-dot" + (color === "yellow" ? " yellow" : color === "red" ? " red" : "");
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ==========================================
// WebRTC Voice Calling (PeerJS)
// ==========================================
let peer = null;
let localStream = null;
let isMuted = true;
const connectedPeers = new Map();

// Initialize PeerJS
peer = new Peer();
peer.on("open", (id) => {
  if (socket && socket.connected && currentRoomState) {
    socket.emit("voice_ready", { peerId: id });
  }
});

peer.on("call", (call) => {
  call.answer(localStream || undefined); // Answer with or without stream
  call.on("stream", (remoteStream) => {
    addAudioElement(call.peer, remoteStream);
  });
  call.on("close", () => removeAudioElement(call.peer));
  connectedPeers.set(call.peer, call);
});

socket.on("user_voice_ready", ({ userId, peerId }) => {
  // Update user peerId in local state
  if (currentRoomState && currentRoomState.users) {
    const u = currentRoomState.users.find(x => x.id === userId);
    if (u) u.peerId = peerId;
  }
  
  // Call them if we are unmuted
  if (!isMuted && localStream && peerId && peerId !== peer.id) {
    const call = peer.call(peerId, localStream);
    if (call) {
      call.on("stream", (remoteStream) => addAudioElement(peerId, remoteStream));
      call.on("close", () => removeAudioElement(peerId));
      connectedPeers.set(peerId, call);
    }
  }
});

function callAllPeers() {
  if (!currentRoomState || !localStream) return;
  const users = currentRoomState.users || [];
  for (const u of users) {
    if (u.peerId && u.peerId !== peer.id) {
      const call = peer.call(u.peerId, localStream);
      if (call) {
        call.on("stream", (remoteStream) => addAudioElement(u.peerId, remoteStream));
        call.on("close", () => removeAudioElement(u.peerId));
        connectedPeers.set(u.peerId, call);
      }
    }
  }
}

document.getElementById("voiceToggleBtn").addEventListener("click", async () => {
  const btn = document.getElementById("voiceToggleBtn");
  if (isMuted) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      isMuted = false;
      btn.textContent = "🎙️ Mute";
      btn.classList.add("active");
      
      callAllPeers();
    } catch (err) {
      showToast("Microphone access denied.");
    }
  } else {
    // Mute
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    isMuted = true;
    btn.textContent = "🎤 Unmute";
    btn.classList.remove("active");
    
    // Close existing calls so we don't send empty audio
    for (const call of connectedPeers.values()) {
      call.close();
    }
    connectedPeers.clear();
  }
});

function addAudioElement(peerId, stream) {
  let el = document.getElementById(`audio-${peerId}`);
  if (!el) {
    el = document.createElement("audio");
    el.id = `audio-${peerId}`;
    el.autoplay = true;
    document.getElementById("audioContainer").appendChild(el);
  }
  el.srcObject = stream;
}

function removeAudioElement(peerId) {
  const el = document.getElementById(`audio-${peerId}`);
  if (el) el.remove();
}
