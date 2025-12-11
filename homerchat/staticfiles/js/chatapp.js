document.addEventListener("DOMContentLoaded", () => {

    // ======================================================
    // GLOBAL STATE
    // ======================================================
    let activeMode = null;          // "room" | "dm"
    let activeTarget = null;        // room_name | username
    let chatSocket = null;

    const username = window.CHAT_USERNAME;
    const scheme = location.protocol === "https:" ? "wss" : "ws";

    // DOM refs
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

    const roomSearch = document.getElementById("room-search");
    const userSearch = document.getElementById("user-search");

    // Room Info Panel
    const roomInfoPanel = document.getElementById("room-info-panel");
    const roomCreatedBy = document.getElementById("room-created-by");
    const roomUsersCombined = document.getElementById("room-users-combined");
    const closeInfoBtn = document.getElementById("close-info-btn");


    // ======================================================
    // JSON Helper
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
    // INITIAL VIEW
    // ======================================================
    function showWelcome() {
        welcomeBox.classList.remove("hidden");
        chatLog.classList.add("hidden");
        chatInputRow.classList.add("hidden");
        joinBanner.classList.add("hidden");
        chatHeader.innerText = "Chat";
    }
    showWelcome();


    // ======================================================
    // LOAD ROOMS
    // ======================================================
    let allRooms = [];

    function loadRooms() {
        jsonFetch("/chat/rooms/").then(data => {
            allRooms = data || [];
            renderRooms(allRooms);
        });
    }

    function renderRooms(list) {
        roomList.innerHTML = "";
        list.forEach(room => {
            roomList.innerHTML += `
                <div class="room-item" data-room="${room.name}">
                    <span>${room.name}</span>
                    <button class="info-btn" data-info="${room.name}">Info</button>
                </div>
            `;
        });
    }


    // ======================================================
    // LOAD USERS WITH PROFILE IMAGE
    // ======================================================
    let allUsers = [];

    function loadUsers() {
        jsonFetch("/chat/users/").then(data => {
            allUsers = data || [];
            renderUsers(allUsers);
        });
    }

    function renderUsers(list) {
        userList.innerHTML = "";

        list.forEach(u => {
            if (u.username === username) return;

            userList.innerHTML += `
                <button class="user-item" data-dm="${u.username}">
                    <img src="${u.profile_image}" class="chat-avatar-small">
                    <span>${u.username}</span>
                </button>
            `;
        });
    }


    loadRooms();
    loadUsers();


    // ======================================================
    // ROOM SEARCH
    // ======================================================
    roomSearch.addEventListener("input", () => {
        const q = roomSearch.value.toLowerCase();
        const filtered = allRooms.filter(r => r.name.toLowerCase().includes(q));
        renderRooms(filtered);
    });

    // ======================================================
    // USER SEARCH
    // ======================================================
    userSearch.addEventListener("input", () => {
        const q = userSearch.value.toLowerCase();
        const filtered = allUsers.filter(u => u.username.toLowerCase().includes(q));
        renderUsers(filtered);
    });


    // ======================================================
    // SWITCH ROOM
    // ======================================================
    function switchRoom(room) {
        activeMode = "room";
        activeTarget = room;

        chatHeader.innerText = "Room: " + room;
        welcomeBox.classList.add("hidden");

        jsonFetch("/chat/rooms/").then(list => {
            const rm = list.find(r => r.name === room);

            if (rm && rm.is_user) {
                joinBanner.classList.add("hidden");
                enableChat();
                loadRoomHistory(room);
            } else {
                joinBanner.classList.remove("hidden");
                disableChat();
            }

            openWebSocket();
        });

        updateRoomInfo(room);
    }


    // ======================================================
    // START DIRECT MESSAGE
    // ======================================================
    function startDM(user) {
        activeMode = "dm";
        activeTarget = user;  // string ALWAYS

        chatHeader.innerText = "DM with " + user;
        welcomeBox.classList.add("hidden");
        joinBanner.classList.add("hidden");

        enableChat();
        loadDMHistory(user);
        openWebSocket();

        closeRoomInfo();
    }


    // ======================================================
    // ENABLE / DISABLE CHAT UI
    // ======================================================
    function enableChat() {
        chatLog.classList.remove("hidden");
        chatInputRow.classList.remove("hidden");
    }

    function disableChat() {
        chatLog.classList.add("hidden");
        chatInputRow.classList.add("hidden");
    }


    // ======================================================
    // LOAD HISTORY
    // ======================================================
    function loadRoomHistory(room) {
        jsonFetch(`/chat/history/${room}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m => appendMessage(m.username, m.message));
        });
    }

    function loadDMHistory(user) {
        jsonFetch(`/chat/dm/history/${user}/`).then(msgs => {
            chatLog.innerHTML = "";
            (msgs || []).forEach(m => appendMessage(m.username, m.message));
        });
    }


    // ======================================================
    // APPEND MESSAGE
    // ======================================================
    function appendMessage(sender, text) {
        const self = sender === username ? "self" : "";

        chatLog.innerHTML += `
            <div class="chat-message ${self}">
                <div class="chat-bubble"><strong>${sender}</strong><br>${text}</div>
            </div>
        `;
        chatLog.scrollTop = chatLog.scrollHeight;
    }


    // ======================================================
    // WEBSOCKET OPEN
    // ======================================================
    function openWebSocket() {
        if (!activeTarget) return;

        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.close();
        }

        const wsUrl =
            activeMode === "room"
                ? `${scheme}://${location.host}/ws/chat/${activeTarget}/`
                : `${scheme}://${location.host}/ws/dm/${activeTarget}/`;

        chatSocket = new WebSocket(wsUrl);

        chatSocket.onmessage = (e) => {
            const d = JSON.parse(e.data);

            if (d.message) appendMessage(d.username, d.message);

            if (d.type === "typing") showTyping(d.username, d.typing);
        };
    }


    // ======================================================
    // SEND MESSAGE
    // ======================================================
    function sendMessage() {
        if (!msgInput.value.trim() || !chatSocket || chatSocket.readyState !== 1) return;

        chatSocket.send(JSON.stringify({ message: msgInput.value.trim() }));
        msgInput.value = "";

        showTyping(username, false);
    }

    msgBtn.addEventListener("click", sendMessage);
    msgInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") sendMessage();

        // Send typing event
        if (chatSocket?.readyState === 1) {
            chatSocket.send(JSON.stringify({
                type: "typing",
                typing: msgInput.value.length > 0
            }));
        }
    });


    // Typing indicator
    function showTyping(user, isTyping) {
        const el = document.getElementById("typing-indicator");

        if (user === username) return;

        if (isTyping) {
            el.innerText = `${user} is typing…`;
            el.classList.remove("hidden");
        } else {
            el.classList.add("hidden");
        }
    }


    // ======================================================
    // HANDLE CLICKS (ROOMS / DM / INFO / JOIN)
    // ======================================================
    document.addEventListener("click", (event) => {
        const dmBtn = event.target.closest("[data-dm]");
        if (dmBtn) return startDM(dmBtn.dataset.dm);

        const roomBtn = event.target.closest("[data-room]");
        if (roomBtn) return switchRoom(roomBtn.dataset.room);

        const joinBtn = event.target.closest("[data-join]");
        if (joinBtn) {
            jsonFetch(`/chat/rooms/join/${joinBtn.dataset.join}/`).then(() => {
                loadRooms();
                switchRoom(joinBtn.dataset.join);
            });
            return;
        }

        const infoBtn = event.target.closest("[data-info]");
        if (infoBtn) return updateRoomInfo(infoBtn.dataset.info);
    });


    // ======================================================
    // ROOM INFO PANEL
    // ======================================================
    function updateRoomInfo(room) {
        jsonFetch(`/chat/rooms/info/${room}/`).then(data => {
            if (!data) return;

            roomCreatedBy.innerText = data.created_by || "—";
            roomUsersCombined.innerHTML = "";

            data.users_all.forEach(u => {
                roomUsersCombined.innerHTML += `<li>${u}</li>`;
            });

            roomInfoPanel.classList.remove("hidden");
        });
    }

    function closeRoomInfo() {
        roomInfoPanel.classList.add("hidden");
    }

    closeInfoBtn.addEventListener("click", closeRoomInfo);


    // ======================================================
    // CREATE ROOM + ENTER KEY
    // ======================================================
    createRoomBtn.addEventListener("click", createRoomNow);

    document.getElementById("new-room-name").addEventListener("keyup", (e) => {
        if (e.key === "Enter") createRoomNow();
    });

    function createRoomNow() {
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
    }

});

