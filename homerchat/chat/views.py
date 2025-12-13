# chat/views.py
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import get_user_model
import json

from .models import Room, Message, DirectMessage

User = get_user_model()


# ======================================================
# MAIN CHAT PAGE
# ======================================================
@login_required
def chatapp(request):
    return render(request, "chat/chatapp.html")


# ======================================================
# USER LIST (with profile images)
# ======================================================
@login_required
def user_list(request):
    users = User.objects.exclude(id=request.user.id)

    data = []
    for u in users:
        try:
            profile_img = u.userprofile.profile_image.url
        except:
            profile_img = "/media/profile_images/default.jpg"

        data.append({
            "username": u.username,
            "profile_image": profile_img,
        })

    return JsonResponse(data, safe=False)


# ======================================================
# ROOM CHAT HISTORY (includes avatars)
# ======================================================
@login_required
def chat_history(request, room_name):
    room = get_object_or_404(Room, name=room_name)

    messages = (
        Message.objects.filter(room=room)
        .select_related("user")
        .order_by("timestamp")
    )

    data = []
    for m in messages:
        try:
            img = m.user.userprofile.profile_image.url
        except:
            img = "/media/profile_images/default.jpg"

        data.append({
            "username": m.user.username,
            "message": m.content,
            "timestamp": m.timestamp.isoformat(),
            "profile_image": img,
        })

    return JsonResponse(data, safe=False)


# ======================================================
# DIRECT MESSAGE HISTORY (includes avatars)
# ======================================================
@login_required
def dm_history(request, username):
    other = get_object_or_404(User, username=username)

    msgs = (
        DirectMessage.objects.filter(
            Q(sender=request.user, receiver=other)
            | Q(sender=other, receiver=request.user)
        )
        .order_by("timestamp")
    )

    data = []
    for m in msgs:
        try:
            img = m.sender.userprofile.profile_image.url
        except:
            img = "/media/profile_images/default.jpg"

        data.append({
            "username": m.sender.username,
            "message": m.content,
            "timestamp": m.timestamp.isoformat(),
            "profile_image": img,
        })

    return JsonResponse(data, safe=False)


# ======================================================
# ROOM LIST
# ======================================================
@login_required
def room_list(request):
    rooms = Room.objects.all()
    data = []

    for room in rooms:
        data.append({
            "name": room.name,
            "is_user": room.users.filter(id=request.user.id).exists()
        })

    return JsonResponse(data, safe=False)


# ======================================================
# CREATE ROOM
# ======================================================
@login_required
@csrf_exempt
def create_room(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)

    data = json.loads(request.body)
    name = data.get("name", "").strip().lower()

    if not name:
        return JsonResponse({"error": "Room name required"}, status=400)

    if Room.objects.filter(name=name).exists():
        return JsonResponse({"error": "Room already exists"}, status=400)

    room = Room.objects.create(name=name, created_by=request.user)
    room.users.add(request.user)

    return JsonResponse({"success": True, "room": name})


# ======================================================
# JOIN ROOM
# ======================================================
@login_required
def join_room(request, room_name):
    room = get_object_or_404(Room, name=room_name)
    room.users.add(request.user)
    return JsonResponse({"joined": True})


# ======================================================
# ROOM USERS
# ======================================================
@login_required
def room_users(request, room_name):
    room = get_object_or_404(Room, name=room_name)

    users = list(room.users.values_list("username", flat=True))
    creator = room.created_by.username if room.created_by else None

    return JsonResponse({
        "created_by": creator,
        "users": users,
    })

# ======================================================
# ROOM INFO PANEL — FINAL FIXED VERSION
# ======================================================
active_rooms = {}  # updated by WebSocket consumers

@login_required
def room_info(request, room_name):
    room = get_object_or_404(Room, name=room_name)

    users_all = list(room.users.values_list("username", flat=True))
    users_active = list(active_rooms.get(room_name, []))

    return JsonResponse({
        "room": room.name,
        "created_by": room.created_by.username if room.created_by else None,

        # ⭐ The field your JS expects
        "users": users_all,

        # Optional fields (can be used by advanced UI)
        "users_all": users_all,
        "users_active": users_active,
    })

