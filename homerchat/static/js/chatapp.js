document.addEventListener("DOMContentLoaded", () => {

    // ======================================================
    // GLOBAL STATE
    // ======================================================
    let activeMode = null;        // "room" | "dm"
    let activeTarget = null;      // room name or username
    let chatSocket = null;
    let intentionalClose = false;

    const username = window.CHAT_USERNAME;
    const scheme = location.protocol === "https:" ? "wss" : "ws";

    // ======================================================
    // DOM REFERENCES
    // ======================================================
    const chatHeader = document.getElementById("chat-header");
    const chatLog = document.getElementById("chat-log");
    const welcomeBox = document.getElementById("welcome-text");
    const joinBanner = document.getElementById("join-banner");
    const chatInputRow = document.getElementById("chat-input-row");
    const msgInput = document.getElementById("chat-message-input");
    const msgBtn = document.getElementById("chat-message-submit");

    const roomList = document.getElementById("room-list");
    const userList = document.getElementById("user-list");
    const createRoomBtn = document.getElementById("create-room-btn");

    // ======================================================
    // JSON FETCH HELPER
    // ======================================================
    function jsonFetch(url, options = {}) {
        return fetch(url, options)
            .then(r => r.text())
            .then(t => {
                try { return JSON.parse(t); }
                catch {
                    console.error("Invalid JSON:", t);
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
        if (joinBanner) joinBanner.classList.add("hidden");
        chatHeader.innerText = "Chat";
    }
    showWelcomeScreen();

    // ======================================================
    // LOAD ROOMS
    // ======================================================
    function loadRooms() {
        jsonFetch("/chat/rooms/").then(data => {
            roomList.innerHTML = "";
            (data || []).forEach(room => {
                roomList.innerHTML += `
                    <div class="room-item">
                        <span class="room-name" data-room="${room.name}">
                            ${room.name}
                        </span>
                        ${room.is_user ? "" : `<button data-join="${room.name}">Join</button>`}
                    </div>
                `;
            });
        });
    }
    loadRooms();

    // ======================================================
    // LOAD USERS
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
                    </button>
                `;
            });
        });
    }
    loadUsers();

    // ======================================================
    // UI HELPERS
    // ======================================================
    function enableChat() {
        chatLog.classList.remove("hidden");
        chatInputRow.classList.remove("hidden");
        if (joinBanner) joinBanner.classList.add("hidden");
    }

    function disableChat() {
        chatLog.classList.add("hidden");
        chatInputRow.classList.add("hidden");
        if (joinBanner) joinBanner.classList.remove("hidden");
    }

    // ======================================================
    // SWITCH ROOM
    // ======================================================
    function switchRoom(room) {
        activeMode = "room";
        activeTarget = room;

        chatHeader.innerText = `Room: ${room}`;
        welcomeBox.classList.add("hidden");

        jsonFetch("/chat/rooms/").then(list => {
            const rm = (list || []).find(r => r.name === room);
            if (rm && rm.is_user) {
                enableChat();
                loadRoomHistory(room);
            } else {
                disableChat();
            }
            openWebSocket();
        });
    }

    // ======================================================
    // START DM
    // ======================================================
    function startDM(user) {
        activeMode = "dm";
        activeTarget = user;

        chatHeader.innerText = `DM with ${user}`;
        welcomeBox.classList.add("hidden");

        enableChat();
        loadDMHistory(user);
        openWebSocket();
    }

    // ======================================================
    // LOAD HISTORY
    // ======================================================
    function loadRoomHistory(room) {
        jsonFetch(`/chat/history/${room}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m => {
                chatLog.innerHTML += `<div><b>${m.username}:</b> ${m.message}</div>`;
            });
        });
    }

    function loadDMHistory(user) {
        jsonFetch(`/chat/dm/history/${user}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m => {
                chatLog.innerHTML += `<div><b>${m.username}:</b> ${m.message}</div>`;
            });
        });
    }

    // ======================================================
    // WEBSOCKET (STABLE + SAFE)
    // ======================================================
    function openWebSocket() {
        if (!activeTarget) return;

        intentionalClose = true;
        if (chatSocket) {
            chatSocket.onclose = null;
            chatSocket.close();
        }
        intentionalClose = false;

        const wsUrl =
            activeMode === "room"
                ? `${scheme}://${location.host}/ws/chat/${encodeURIComponent(activeTarget)}/`
                : `${scheme}://${location.host}/ws/dm/${encodeURIComponent(activeTarget)}/`;

        console.log("Connecting:", wsUrl);
        chatSocket = new WebSocket(wsUrl);

        chatSocket.onopen = () => {
            console.log("Connected:", wsUrl);
        };

        chatSocket.onmessage = e => {
            const d = JSON.parse(e.data || "{}");
            if (!d || !d.username) return;

            if (d.message) {
                chatLog.innerHTML += `<div><b>${d.username}:</b> ${d.message}</div>`;
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        };

        chatSocket.onclose = () => {
            if (intentionalClose) return;
            console.warn("WebSocket Closed. Reconnecting...");
            setTimeout(openWebSocket, 2000);
        };

        chatSocket.onerror = () => {
            console.warn("WebSocket error");
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
    // CLICK HANDLERS
    // ======================================================
    document.addEventListener("click", event => {

        const roomBtn = event.target.closest("[data-room]");
        if (roomBtn) {
            switchRoom(roomBtn.dataset.room);
            return;
        }

        const joinBtn = event.target.closest("[data-join]");
        if (joinBtn) {
            const room = joinBtn.dataset.join;
            jsonFetch(`/chat/rooms/join/${room}/`).then(() => {
                loadRooms();
                switchRoom(room);
            });
            return;
        }

        const dmBtn = event.target.closest("[data-dm]");
        if (dmBtn) {
            startDM(dmBtn.dataset.dm);
            return;
        }
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
            body: JSON.stringify({ name }),
        }).then(() => {
            loadRooms();
            switchRoom(name);
        });
    });

});

