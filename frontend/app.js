// ============= SyncTube Connect — Landing Page =============
const API = window.SYNCTUBE_CONFIG.BACKEND_URL;

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Create room
document.getElementById("createBtn").addEventListener("click", async () => {
  const hostName = document.getElementById("hostName").value.trim();
  const videoUrl = document.getElementById("createVideoUrl").value.trim();
  if (!hostName) return showError("Please enter your name.");

  const videoId = videoUrl ? extractVideoId(videoUrl) : null;
  if (videoUrl && !videoId) return showError("Couldn't parse that YouTube URL. Try again.");

  const btn = document.getElementById("createBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Creating…";

  try {
    const res = await fetch(`${API}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName, videoId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create room");

    sessionStorage.setItem("synctube_name", hostName);
    sessionStorage.setItem("synctube_host", "true");
    window.location.href = `room.html?code=${data.code}`;
  } catch (e) {
    showError(e.message);
    btn.disabled = false;
    btn.querySelector("span").textContent = "Create Room";
  }
});

// Join room
document.getElementById("joinBtn").addEventListener("click", async () => {
  const name = document.getElementById("joinName").value.trim();
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  if (!name) return showError("Please enter your name.");
  if (!code || code.length !== 6) return showError("Please enter a 6-character room code.");

  const btn = document.getElementById("joinBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Joining…";

  try {
    const res = await fetch(`${API}/api/rooms/${code}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Room not found");

    sessionStorage.setItem("synctube_name", name);
    sessionStorage.setItem("synctube_host", "false");
    window.location.href = `room.html?code=${code}`;
  } catch (e) {
    showError(e.message);
    btn.disabled = false;
    btn.querySelector("span").textContent = "Join Room";
  }
});

// Allow Enter key
["hostName","createVideoUrl"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("createBtn").click();
  });
});
["joinName","joinCode"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("joinBtn").click();
  });
});

// Auto-uppercase room code input
document.getElementById("joinCode").addEventListener("input", function() {
  this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g,"");
});
