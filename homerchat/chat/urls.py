# chat/urls.py
from django.urls import path, include
from . import views

urlpatterns = [
    # path('', include('authentication.urls')),
    path("", views.chatapp, name="chatapp"),
        # room management
    #path("upload/", views.upload_file, name="upload_file"),
    path("rooms/", views.room_list, name="room_list"),
    path("room/users/<str:room_name>/", views.room_users, name="room_users"),
    path("rooms/create/", views.create_room, name="create_room"),
    path("rooms/info/<str:room_name>/", views.room_info, name="room_info"),
    path("rooms/join/<str:room_name>/", views.join_room, name="join_room"),
    # History
    # path("history/", views.chat_history, name="chat_history"),
    path("history/<str:room_name>/", views.chat_history, name="chat_history"),

    #DM
    path("dm/history/<str:username>/", views.dm_history, name="dm_history"),
    path("users/", views.user_list, name="user_list"),
]
