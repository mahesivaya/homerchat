// ======================================================
// GLOBAL VARIABLES
// ======================================================
let activeMode = "room";
let activeTarget = "chatapp";
let chatSocket = null;
let allRooms = [];
let allUsers = [];

const username = window.USERNAME || "";  // safer
const scheme = location.protocol === "https:" ? "wss" : "ws";

const chatLog = document.getElementById("chat-log");
const chatHeader = document.getElementById("chat-header");
const joinBanner = document.getElementById("join-banner");
const msgInput = document.getElementById("chat-message-input");
const msgBtn = document.getElementById("chat-message-submit");
const roomInfoBtn = document.getElementById("show-users-btn");

// ======================================================
// JSON WRAPPER
// ======================================================
function jsonFetch(url, options){
    return fetch(url, options)
        .then(r => r.text())
        .then(t => {
            try { return JSON.parse(t); }
            catch(e){ console.error("Invalid JSON:", t); throw e; }
        });
}

// ======================================================
// ROOM LIST
// ======================================================
function loadRooms(){
    jsonFetch("/chat/rooms/").then(data=>{
        allRooms = data;
        renderRooms();
    });
}

function renderRooms(){
    const term = document.getElementById("room-search").value.toLowerCase();
    const list = document.getElementById("room-list");
    list.innerHTML = "";

    allRooms
      .filter(r => r.name.toLowerCase().includes(term))
      .forEach(r => {

        const joinBtn = r.is_user ? "" : `<button onclick="joinRoomFromList('${r.name}')">Join</button>`;

        list.innerHTML += `
            <div class="room-item">
                <span onclick="switchRoom('${r.name}')">${r.name}</span>
                ${joinBtn}
            </div>`;
      });
}

// ======================================================
// JOIN ROOM
// ======================================================
function joinRoomFromList(room){
    jsonFetch(`/chat/rooms/join/${room}/`).then(()=>{
        loadRooms();
        switchRoom(room);
    });
}

function joinActiveRoom(){
    jsonFetch(`/chat/rooms/join/${activeTarget}/`).then(()=>{
        loadRooms();
        enableChat();
        loadRoomHistory(activeTarget);
    });
}

// ======================================================
// USER LIST
// ======================================================
function loadUsers(){
    jsonFetch("/chat/users/").then(data=>{
        allUsers = data.filter(u => u !== username);
        renderUsers();
    });
}

function renderUsers(){
    const term = document.getElementById("user-search").value.toLowerCase();
    const list = document.getElementById("user-list");
    list.innerHTML = "";

    allUsers
        .filter(u => u.toLowerCase().includes(term))
        .forEach(u => {
            list.innerHTML += `<button class="user-btn" onclick="startDM('${u}')">${u}</button>`;
        });
}

// ======================================================
// SWITCH ROOM
// ======================================================
function switchRoom(room){
    activeMode="room";
    activeTarget=room.toLowerCase();
    chatHeader.innerText=`Room: ${activeTarget}`;
    roomInfoBtn.classList.remove("hidden");

    jsonFetch("/chat/rooms/").then(rList=>{
        const rm = rList.find(x => x.name === room);

        if(rm && rm.is_user){
            enableChat();
            loadRoomHistory(activeTarget);
        } else {
            disableChat();
        }
        connectWS();
    });
}

// ======================================================
// CHAT ENABLE/DISABLE
// ======================================================
function disableChat(){
    joinBanner.classList.remove("hidden");
    chatLog.classList.add("hidden");
    msgInput.disabled = true;
    msgBtn.disabled = true;
}

function enableChat(){
    joinBanner.classList.add("hidden");
    chatLog.classList.remove("hidden");
    msgInput.disabled = false;
    msgBtn.disabled = false;
}

// ======================================================
// HISTORY
// ======================================================
function loadRoomHistory(room){
    jsonFetch(`/chat/history/${room}/`).then(msgs=>{
        chatLog.innerHTML="";
        msgs.forEach(m=>{
            chatLog.innerHTML+=`<div class="message"><b>${m.username}:</b> ${m.message}</div>`;
        });
        chatLog.scrollTop = chatLog.scrollHeight;
    });
}

function loadDMHistory(user){
    jsonFetch(`/chat/dm/history/${user}/`).then(msgs=>{
        chatLog.innerHTML="";
        msgs.forEach(m=>{
            chatLog.innerHTML+=`<div class="message"><b>${m.username}:</b> ${m.message}</div>`;
        });
        chatLog.scrollTop = chatLog.scrollHeight;
    });
}

// ======================================================
// DM MODE
// ======================================================
function startDM(user){
    activeMode="dm";
    activeTarget=user.toLowerCase();
    chatHeader.innerText="DM with "+activeTarget;
    roomInfoBtn.classList.add("hidden");

    enableChat();
    loadDMHistory(activeTarget);
    connectWS();
}

// ======================================================
// WEBSOCKET
// ======================================================
function connectWS(){
    if(chatSocket) chatSocket.close();

    const wsUrl = activeMode==="room"
        ? `${scheme}://${location.hostname}:8000/ws/chat/${activeTarget}/`
        : `${scheme}://${location.hostname}:8000/ws/dm/${activeTarget}/`;

    chatSocket = new WebSocket(wsUrl);

    chatSocket.onmessage = e => {
        const d = JSON.parse(e.data);
        if(d.message){
            chatLog.innerHTML += `<div class="message"><b>${d.username}:</b> ${d.message}</div>`;
            chatLog.scrollTop = chatLog.scrollHeight;
        }
    };
}

// ======================================================
// SEND MESSAGE
// ======================================================
function sendMessage(){
    if(!msgInput.value.trim() || !chatSocket || chatSocket.readyState !== 1) return;
    chatSocket.send(JSON.stringify({message:msgInput.value.trim(), username}));
    msgInput.value="";
}

msgBtn.onclick = sendMessage;
msgInput.onkeyup = e => e.key==="Enter" && sendMessage();

// ======================================================
// CREATE ROOM
// ======================================================
function createRoom(){
    const name=document.getElementById("new-room-name").value.trim();
    if(!name) return alert("Room name required");

    jsonFetch("/chat/rooms/create/",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name})
    }).then(()=>{
        loadRooms();
        switchRoom(name);
    });
}

// ======================================================
// ROOM INFO PANEL
// ======================================================
document.getElementById("show-users-btn").onclick = ()=>{
    jsonFetch(`/chat/room/info/${activeTarget}/`).then(data=>{
        const panel = document.getElementById("room-info-panel");
        document.getElementById("room-created-by").innerText = data.created_by || "Unknown";

        const active = new Set(data.users_active);
        const all = new Set(data.users_all);
        const combined = new Set([...active, ...all]);

        document.getElementById("room-users-combined").innerHTML =
            [...combined].map(u =>
                `<li>${active.has(u) ? "🟢" : "⚪"} ${u}</li>`
            ).join("");

        panel.classList.remove("hidden");
    });
};

function hideRoomInfo(){
    document.getElementById("room-info-panel").classList.add("hidden");
}

// ======================================================
// INIT
// ======================================================
window.onload = function(){
    loadRooms();
    loadUsers();
    disableChat();
    chatHeader.innerText = "Select a room…";

    document.getElementById("room-search").oninput = renderRooms;
    document.getElementById("user-search").oninput = renderUsers;
};
