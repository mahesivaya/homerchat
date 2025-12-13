import json
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model

from .models import Room, Message, DirectMessage
from .views import active_rooms

User = get_user_model()


# ------------------------------------------------------------
# HELPER: SAFE PROFILE IMAGE LOADER
# ------------------------------------------------------------
@sync_to_async
def get_profile_image(user):
    """Returns profile image URL or default placeholder."""
    try:
        return user.userprofile.profile_image.url
    except:
        return "/media/profile_images/default.jpg"


# ============================================================
#                     CHAT ROOM CONSUMER
# ============================================================
class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group = f"chat_{self.room_name}"
        self.user = self.scope["user"]

        if self.user.is_anonymous:
            await self.close()
            return

        # Track presence in memory
        active_rooms.setdefault(self.room_name, set()).add(self.user.username)

        # Add user to room DB ManyToMany
        await self.add_user_to_room(self.room_name, self.user)

        # Join WS channel group
        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

        # ONLINE presence broadcast (with avatar)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "presence_event",
                "username": self.user.username,
                "status": "online",
                "profile_image": await get_profile_image(self.user),
            }
        )

    async def disconnect(self, close_code):
        active_rooms.get(self.room_name, set()).discard(self.user.username)

        await self.channel_layer.group_discard(self.room_group, self.channel_name)

        # OFFLINE presence broadcast
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "presence_event",
                "username": self.user.username,
                "status": "offline",
                "profile_image": await get_profile_image(self.user),
            }
        )

    async def receive(self, text_data=None):
        data = json.loads(text_data or "{}")
        msg_type = data.get("type")

        # -----------------------------------------
        # USER TYPING INDICATOR
        # -----------------------------------------
        if msg_type == "typing":
            await self.channel_layer.group_send(
                self.room_group,
                {
                    "type": "typing_event",
                    "username": self.user.username,
                    "typing": data.get("typing", True),
                }
            )
            return

        # -----------------------------------------
        # MESSAGE SEND
        # -----------------------------------------
        message = data.get("message", "").strip()
        if not message:
            return

        await self.save_message(self.room_name, self.user, message)

        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "chat_message",
                "username": self.user.username,
                "message": message,
                "profile_image": await get_profile_image(self.user),
            }
        )

    # OUTGOING EVENTS
    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def presence_event(self, event):
        await self.send(text_data=json.dumps(event))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps(event))

    # DB HELPERS
    @sync_to_async
    def save_message(self, room_name, user, text):
        room = Room.objects.get(name=room_name)
        Message.objects.create(room=room, user=user, content=text)

    @sync_to_async
    def add_user_to_room(self, room_name, user):
        Room.objects.get(name=room_name).users.add(user)


# ============================================================
#                 DIRECT MESSAGE CONSUMER
# ============================================================
class DMConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        self.other = self.scope["url_route"]["kwargs"]["username"]

        if self.user.is_anonymous:
            await self.close()
            return

        self.room_group = await self.get_dm_key(self.user.username, self.other)

        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

        # ONLINE PRESENCE (DM)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "presence_event",
                "username": self.user.username,
                "status": "online",
                "profile_image": await get_profile_image(self.user),
            }
        )

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group, self.channel_name)

        # OFFLINE PRESENCE (DM)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "presence_event",
                "username": self.user.username,
                "status": "offline",
                "profile_image": await get_profile_image(self.user),
            }
        )

    async def receive(self, text_data=None):
        data = json.loads(text_data or "{}")
        msg_type = data.get("type")

        # -----------------------------------------
        # TYPING EVENT
        # -----------------------------------------
        if msg_type == "typing":
            await self.channel_layer.group_send(
                self.room_group,
                {
                    "type": "typing_event",
                    "username": self.user.username,
                    "typing": data.get("typing", True),
                }
            )
            return

        # -----------------------------------------
        # SEND DM MESSAGE
        # -----------------------------------------
        message = data.get("message", "").strip()
        if not message:
            return

        other_user = await self.get_user(self.other)
        if not other_user:
            return

        await self.save_dm(self.user, other_user, message)

        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "dm_message",
                "username": self.user.username,
                "message": message,
                "profile_image": await get_profile_image(self.user),
            }
        )

    # OUTGOING EVENTS
    async def dm_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def presence_event(self, event):
        await self.send(text_data=json.dumps(event))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps(event))

    # DB HELPERS
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
        DirectMessage.objects.create(sender=sender, receiver=receiver, content=text)

