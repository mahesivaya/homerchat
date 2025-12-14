import json
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model

from .models import Room, Message, DirectMessage
from .views import active_rooms

User = get_user_model()


# ============================================================
# HELPER: SAFE PROFILE IMAGE LOADER
# ============================================================
@sync_to_async
def get_profile_image(user):
    try:
        return user.userprofile.profile_image.url
    except Exception as e:
        print("PROFILE IMAGE ERROR:", e)
        return "/media/profile_images/default.jpg"


# ============================================================
#                     CHAT ROOM CONSUMER
# ============================================================
class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        try:
            self.user = self.scope["user"]

            if self.user.is_anonymous:
                await self.close()
                return

            self.room_name = self.scope["url_route"]["kwargs"].get("room_name")
            self.room_group = f"chat_{self.room_name}"

            # Track presence in memory
            active_rooms.setdefault(self.room_name, set()).add(self.user.username)

            # Ensure room exists & add user
            await self.add_user_to_room(self.room_name, self.user)

            # Join channel group
            await self.channel_layer.group_add(self.room_group, self.channel_name)
            await self.accept()

            # Presence broadcast (SAFE)
            await self.safe_group_send(
                {
                    "type": "presence_event",
                    "username": self.user.username,
                    "status": "online",
                    "profile_image": await get_profile_image(self.user),
                }
            )

        except Exception as e:
            print("WS CONNECT ERROR:", e)
            await self.close()

    async def disconnect(self, close_code):
        if not hasattr(self, "room_name"):
            return

        active_rooms.get(self.room_name, set()).discard(self.user.username)

        try:
            await self.channel_layer.group_discard(self.room_group, self.channel_name)
        except Exception as e:
            print("GROUP DISCARD ERROR:", e)

        await self.safe_group_send(
            {
                "type": "presence_event",
                "username": self.user.username,
                "status": "offline",
                "profile_image": await get_profile_image(self.user),
            }
        )

    async def receive(self, text_data=None):
        try:
            data = json.loads(text_data or "{}")
            msg_type = data.get("type")

            # -----------------------------
            # TYPING EVENT
            # -----------------------------
            if msg_type == "typing":
                await self.safe_group_send(
                    {
                        "type": "typing_event",
                        "username": self.user.username,
                        "typing": data.get("typing", True),
                    }
                )
                return

            # -----------------------------
            # CHAT MESSAGE
            # -----------------------------
            message = data.get("message", "").strip()
            if not message:
                return

            await self.save_message(self.room_name, self.user, message)

            await self.safe_group_send(
                {
                    "type": "chat_message",
                    "username": self.user.username,
                    "message": message,
                    "profile_image": await get_profile_image(self.user),
                }
            )

        except Exception as e:
            print("RECEIVE ERROR:", e)

    # ======================================================
    # OUTGOING EVENTS
    # ======================================================
    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def presence_event(self, event):
        await self.send(text_data=json.dumps(event))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps(event))

    # ======================================================
    # SAFE GROUP SEND (NEVER CRASH WS)
    # ======================================================
    async def safe_group_send(self, payload):
        try:
            await self.channel_layer.group_send(self.room_group, payload)
        except Exception as e:
            print("GROUP SEND FAILED:", e)

    # ======================================================
    # DB HELPERS
    # ======================================================
    @sync_to_async
    def save_message(self, room_name, user, text):
        room = Room.objects.get(name=room_name)
        Message.objects.create(room=room, user=user, content=text)

    @sync_to_async
    def add_user_to_room(self, room_name, user):
        room, _ = Room.objects.get_or_create(
            name=room_name,
            defaults={"created_by": user}
        )
        room.users.add(user)


# ============================================================
#                 DIRECT MESSAGE CONSUMER
# ============================================================
class DMConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        try:
            self.user = self.scope["user"]
            self.other_username = self.scope["url_route"]["kwargs"].get("username")

            if self.user.is_anonymous:
                await self.close()
                return

            self.room_group = await self.get_dm_key(self.user.username, self.other_username)

            await self.channel_layer.group_add(self.room_group, self.channel_name)
            await self.accept()

            await self.safe_group_send(
                {
                    "type": "presence_event",
                    "username": self.user.username,
                    "status": "online",
                    "profile_image": await get_profile_image(self.user),
                }
            )

        except Exception as e:
            print("DM CONNECT ERROR:", e)
            await self.close()

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.room_group, self.channel_name)
        except Exception as e:
            print("DM DISCARD ERROR:", e)

        await self.safe_group_send(
            {
                "type": "presence_event",
                "username": self.user.username,
                "status": "offline",
                "profile_image": await get_profile_image(self.user),
            }
        )

    async def receive(self, text_data=None):
        try:
            data = json.loads(text_data or "{}")
            msg_type = data.get("type")

            # -----------------------------
            # TYPING EVENT
            # -----------------------------
            if msg_type == "typing":
                await self.safe_group_send(
                    {
                        "type": "typing_event",
                        "username": self.user.username,
                        "typing": data.get("typing", True),
                    }
                )
                return

            # -----------------------------
            # DM MESSAGE
            # -----------------------------
            message = data.get("message", "").strip()
            if not message:
                return

            other_user = await self.get_user(self.other_username)
            if not other_user:
                return

            await self.save_dm(self.user, other_user, message)

            await self.safe_group_send(
                {
                    "type": "dm_message",
                    "username": self.user.username,
                    "message": message,
                    "profile_image": await get_profile_image(self.user),
                }
            )

        except Exception as e:
            print("DM RECEIVE ERROR:", e)

    # ======================================================
    # OUTGOING EVENTS
    # ======================================================
    async def dm_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def presence_event(self, event):
        await self.send(text_data=json.dumps(event))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps(event))

    # ======================================================
    # SAFE GROUP SEND
    # ======================================================
    async def safe_group_send(self, payload):
        try:
            await self.channel_layer.group_send(self.room_group, payload)
        except Exception as e:
            print("DM GROUP SEND FAILED:", e)

    # ======================================================
    # DB HELPERS
    # ======================================================
    @sync_to_async
    def get_dm_key(self, u1, u2):
        a, b = sorted([u1, u2])
        return f"dm_{a}_{b}"

    @sync_to_async
    def get_user(self, username):
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            return None

    @sync_to_async
    def save_dm(self, sender, receiver, text):
        DirectMessage.objects.create(
            sender=sender,
            receiver=receiver,
            content=text
        )

