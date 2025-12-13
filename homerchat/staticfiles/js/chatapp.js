
document.addEventListener("DOMContentLoaded", () => {

    // ======================================================
    // GLOBAL STATE
    // ======================================================
    let activeMode = null;
    let activeTarget = null;
    let chatSocket = null;

    let isReconnecting = false;   // Prevent reconnect spam

    const username = window.CHAT_USERNAME;
    const scheme = location.protocol === "https:" ? "wss" : "ws";


    // ======================================================
    // DOM REFERENCES
    // ======================================================
    const chatHeader = document.getElementById("chat-header");
    const chatLog = document.getElementById("chat-log");
    const welcomeBox = document.getElementById("welcome-text");
    const chatInputRow = document.getElementById("chat-input-row");
    const msgInput = document.getElementById("chat-message-input");
    const msgBtn = document.getElementById("chat-message-submit");

    const roomList = document.getElementById("room-list");
    const userList = document.getElementById("user-list");
    const createRoomBtn = document.getElementById("create-room-btn");

    const roomSearch = document.getElementById("room-search");
    const userSearch = document.getElementById("user-search");

    // Room Info Panel
    const infoPanel = document.getElementById("room-info-panel");
    const infoCreatedBy = document.getElementById("room-created-by");
    const infoUsers = document.getElementById("room-users-combined");
    const closeInfoBtn = document.getElementById("close-info-btn");


    // ======================================================
    // JSON FETCH HELPER
    // ======================================================
    function jsonFetch(url, options = {}) {
        return fetch(url, options)
            .then(r => r.text())
            .then(t => {
                try { return JSON.parse(t); }
                catch {
                    console.warn("Invalid JSON:", t);
                    return null;
                }
            });
    }


    // ======================================================
    // INITIAL SCREEN
    // ======================================================
    function showWelcomeScreen() {
        welcomeBox.classList.remove("hidden");
        chatLog.classList.add("hidden");
        chatInputRow.classList.add("hidden");
    }
    showWelcomeScreen();


    // ======================================================
    // LOAD ROOMS WITH ℹ️ BUTTON
    // ======================================================
    function loadRooms() {
        jsonFetch("/chat/rooms/").then(data => {
            roomList.innerHTML = "";
            (data || []).forEach(room => {
                roomList.innerHTML += `
                    <div class="room-item" data-room="${room.name}">
                        <span>${room.name}</span>
                        <button class="room-info-btn" data-room-info="${room.name}" onclick="event.stopPropagation()">ℹ️</button>
                    </div>`;
            });
        });
    }


    // ======================================================
    // LOAD USERS (AVATARS ONLY)
    // ======================================================
    function loadUsers() {
        jsonFetch("/chat/users/").then(data => {
            userList.innerHTML = "";

            (data || []).forEach(u => {
                if (u.username === username) return;

                userList.innerHTML += `
                    <button class="user-item" data-dm="${u.username}">
                        <img src="${u.profile_image}" class="chat-avatar-small">
                        <span>${u.username}</span>
                    </button>`;
            });
        });
    }

    loadRooms();
    loadUsers();


    // ======================================================
    // SEARCH FILTERS
    // ======================================================
    roomSearch.addEventListener("input", () => {
        const term = roomSearch.value.toLowerCase();
        document.querySelectorAll("#room-list .room-item").forEach(item => {
            item.style.display = item.dataset.room.toLowerCase().includes(term) ? "flex" : "none";
        });
    });

    userSearch.addEventListener("input", () => {
        const term = userSearch.value.toLowerCase();
        document.querySelectorAll("#user-list .user-item").forEach(item => {
            item.style.display = item.dataset.dm.toLowerCase().includes(term) ? "flex" : "none";
        });
    });


    // ======================================================
    // ENTER ROOM
    // ======================================================
    function switchRoom(room) {
        activeMode = "room";
        activeTarget = room;

        chatHeader.innerText = `Room: ${room}`;
        welcomeBox.classList.add("hidden");

        chatLog.innerHTML = "";
        enableChat();

        loadRoomHistory(room);
        openWebSocket();
    }


    // ======================================================
    // ENTER DM
    // ======================================================
    function startDM(user) {
        activeMode = "dm";
        activeTarget = user;

        chatHeader.innerText = `DM with ${user}`;
        welcomeBox.classList.add("hidden");

        chatLog.innerHTML = "";
        enableChat();

        loadDMHistory(user);
        openWebSocket();
    }


    // ======================================================
    // CHAT VISIBILITY
    // ======================================================
    function enableChat() {
        chatLog.classList.remove("hidden");
        chatInputRow.classList.remove("hidden");
    }


    // ======================================================
    // LOAD ROOM HISTORY
    // ======================================================
    function loadRoomHistory(room) {
        jsonFetch(`/chat/history/${room}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m =>
                appendMessage(m.username, m.message, m.profile_image)
            );
        });
    }


    // ======================================================
    // LOAD DM HISTORY
    // ======================================================
    function loadDMHistory(user) {
        jsonFetch(`/chat/dm/history/${user}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m =>
                appendMessage(m.username, m.message, m.profile_image)
            );
        });
    }


    // ======================================================
    // APPEND CHAT MESSAGE
    // ======================================================
    function appendMessage(sender, text, avatarUrl) {
        if (!sender || !text) return;

        const isSelf = sender === username ? "self" : "";
        const avatar = avatarUrl || "/media/profile_images/default.jpg";

        chatLog.innerHTML += `
            <div class="chat-message ${isSelf}">
                <img src="${avatar}" class="chat-avatar">
                <div class="chat-bubble">
                    <strong>${sender}</strong><br>${text}
                </div>
            </div>`;

        chatLog.scrollTop = chatLog.scrollHeight;
    }


    // ======================================================
    // OPEN WEBSOCKET + SAFE RECONNECT
    // ======================================================
    function openWebSocket() {

        const wsUrl = activeMode === "room"
            ? `${scheme}://${location.host}/ws/chat/${activeTarget}/`
            : `${scheme}://${location.host}/ws/dm/${activeTarget}/`;

        // Prevent unnecessary reopen
        if (chatSocket && chatSocket.url === wsUrl) {
            console.log("Already connected. Skip reopen.");
            return;
        }

        // Close previous socket if exists
        if (chatSocket) chatSocket.close();

        chatSocket = new WebSocket(wsUrl);

        // OPEN
        chatSocket.onopen = () => {
            console.log("WebSocket connected.");
            isReconnecting = false;
        };

        // MESSAGE
        chatSocket.onmessage = (e) => {
            const d = JSON.parse(e.data);

            if (!d || !d.username || !d.message) return;

            appendMessage(d.username, d.message, d.profile_image);
        };

        // CLOSE (reconnect safely)
        chatSocket.onclose = () => {
            console.warn("WebSocket closed.");

            if (!activeTarget) return;
            if (isReconnecting) return;

            isReconnecting = true;
            console.warn("Attempting reconnect in 2 seconds...");

            setTimeout(() => {
                isReconnecting = false;
                openWebSocket();
            }, 2000);
        };
    }


    // ======================================================
    // SEND MESSAGE
    // ======================================================
    function sendMessage() {
        if (!msgInput.value.trim()) return;
        if (!chatSocket || chatSocket.readyState !== 1) return;

        chatSocket.send(JSON.stringify({
            message: msgInput.value.trim()
        }));

        msgInput.value = "";
    }

    msgBtn.addEventListener("click", sendMessage);
    msgInput.addEventListener("keyup", e => e.key === "Enter" && sendMessage());


    // ======================================================
    // CLICK HANDLERS (ORDER FIXED!)
    // ======================================================
    document.addEventListener("click", (event) => {

        // 1️⃣ INFO BUTTON FIRST
        const infoBtn = event.target.closest("[data-room-info]");
        if (infoBtn) {
            return openRoomInfo(infoBtn.dataset.roomInfo);
        }

        // 2️⃣ DM BUTTON
        const dmBtn = event.target.closest("[data-dm]");
        if (dmBtn) return startDM(dmBtn.dataset.dm);

        // 3️⃣ ROOM BUTTON
        const roomBtn = event.target.closest("[data-room]");
        if (roomBtn) return switchRoom(roomBtn.dataset.room);
    });


    // ======================================================
    // ROOM INFO PANEL
    // ======================================================
    function openRoomInfo(roomName) {
        jsonFetch(`/chat/room/info/${roomName}/`).then(data => {
            if (!data) return;

            infoCreatedBy.innerText = data.created_by || "Unknown";

            infoUsers.innerHTML = "";
            (data.users || []).forEach(u => {
                infoUsers.innerHTML += `<li>${u}</li>`;
            });

            infoPanel.classList.remove("hidden");
        });
    }

    closeInfoBtn.addEventListener("click", () => {
        infoPanel.classList.add("hidden");
    });


    // ======================================================
    // CREATE ROOM
    // ======================================================
    createRoomBtn.addEventListener("click", () => {
        const name = document.getElementById("new-room-name").value.trim();
        if (!name) return;

        jsonFetch("/chat/rooms/create/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        }).then(() => {
            loadRooms();
            switchRoom(name);
        });
    });

});

