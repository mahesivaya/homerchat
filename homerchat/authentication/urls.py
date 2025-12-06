# chat/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # path("", views.project_home, name="projecthome"),
    path("register/", views.register_view, name="register"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
]
