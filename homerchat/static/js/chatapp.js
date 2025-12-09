document.addEventListener("DOMContentLoaded", () => {

    // ======================================================
    // GLOBAL VARIABLES
    // ======================================================
    let activeMode = null;     // "room" or "dm"
    let activeTarget = null;   // room name or username
    let chatSocket = null;

    const username = window.CHAT_USERNAME;
    const scheme = location.protocol === "https:" ? "wss" : "ws";

    // DOM references
    const chatHeader = document.getElementById("chat-header");
    const chatLog = document.getElementById("chat-log");
    const welcomeBox = document.getElementById("welcome-text");
    const joinBanner = document.getElementById("join-banner");
    const joinRoomBtn = document.getElementById("join-room-btn");
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
                catch (e) { console.error("Bad JSON:", t); }
            });
    }

    // ======================================================
    // INITIAL UI STATE
    // ======================================================
    function showWelcomeScreen() {
        welcomeBox.classList.remove("hidden");
        chatLog.classList.add("hidden");
        joinBanner.classList.add("hidden");
        chatInputRow.classList.add("hidden");
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
                        <span class="room-name" data-room="${room.name}">${room.name}</span>
                        ${room.is_user ? "" : `<button data-join="${room.name}">Join</button>`}
                    </div>`;
            });
        });
    }

    // ======================================================
    // LOAD USERS
    // ======================================================
    function loadUsers() {
        jsonFetch("/chat/users/").then(data => {
            userList.innerHTML = "";
            (data || []).forEach(u => {
                if (u !== username) {
                    userList.innerHTML += `
                        <button class="user-btn" data-dm="${u}">${u}</button>
                    `;
                }
            });
        });
    }

    loadRooms();
    loadUsers();

    // ======================================================
    // SWITCH ROOM
    // ======================================================
    function switchRoom(room) {
        activeMode = "room";
        activeTarget = room;

        chatHeader.innerText = "Room: " + room;
        welcomeBox.classList.add("hidden");

        jsonFetch(`/chat/rooms/`).then(list => {
            const rm = list.find(r => r.name === room);
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
    // DM MODE
    // ======================================================
    function startDM(user) {
        activeMode = "dm";
        activeTarget = user;

        chatHeader.innerText = "DM with " + user;
        welcomeBox.classList.add("hidden");

        enableChat();
        loadDMHistory(user);
        openWebSocket();
    }

    // ======================================================
    // ENABLE / DISABLE CHAT UI
    // ======================================================
    function disableChat() {
        joinBanner.classList.remove("hidden");
        chatLog.classList.add("hidden");
        chatInputRow.classList.add("hidden");
    }

    function enableChat() {
        joinBanner.classList.add("hidden");
        chatLog.classList.remove("hidden");
        chatInputRow.classList.remove("hidden");
    }

    // ======================================================
    // LOAD HISTORY
    // ======================================================
    function loadRoomHistory(room) {
        jsonFetch(`/chat/history/${room}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m =>
                chatLog.innerHTML += `<div><b>${m.username}:</b> ${m.message}</div>`
            );
        });
    }

    function loadDMHistory(user) {
        jsonFetch(`/chat/dm/history/${user}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m =>
                chatLog.innerHTML += `<div><b>${m.username}:</b> ${m.message}</div>`
            );
        });
    }

    // ======================================================
    // WEBSOCKET
    // ======================================================
    function openWebSocket() {
        if (chatSocket) chatSocket.close();

        const wsUrl =
            activeMode === "room"
                ? `${scheme}://${location.hostname}/ws/chat/${activeTarget}/`
                : `${scheme}://${location.hostname}/ws/dm/${activeTarget}/`;

        chatSocket = new WebSocket(wsUrl);

        chatSocket.onmessage = (e) => {
            const d = JSON.parse(e.data);
            if (d.message) {
                chatLog.innerHTML += `<div><b>${d.username}:</b> ${d.message}</div>`;
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        };
    }

    // ======================================================
    // SEND MESSAGE
    // ======================================================
    function sendMessage() {
        if (!msgInput.value.trim() || !chatSocket || chatSocket.readyState !== 1) return;

        chatSocket.send(JSON.stringify({
            message: msgInput.value.trim(),
            username
        }));

        msgInput.value = "";
    }

    msgBtn.addEventListener("click", sendMessage);
    msgInput.addEventListener("keyup", (e) => e.key === "Enter" && sendMessage());

    // ======================================================
    // CLICK EVENTS — ROOMS + USERS
    // ======================================================
    document.addEventListener("click", (event) => {
        if (event.target.dataset.room) {
            switchRoom(event.target.dataset.room);
        }
        if (event.target.dataset.join) {
            jsonFetch(`/chat/rooms/join/${event.target.dataset.join}/`).then(() => {
                loadRooms();
                switchRoom(event.target.dataset.join);
            });
        }
        if (event.target.dataset.dm) {
            startDM(event.target.dataset.dm);
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
            body: JSON.stringify({ name })
        }).then(() => {
            loadRooms();
            switchRoom(name);
        });
    });

});

