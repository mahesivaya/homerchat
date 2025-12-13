from django.shortcuts import render, redirect
from django.http import HttpResponse
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages




from django.shortcuts import render

# -------------------------------
# REGISTER
# -------------------------------
def register_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        first_name = request.POST.get("first_name")
        last_name = request.POST.get("last_name")
        email = request.POST.get("email")
        password = request.POST.get("password")
        image = request.FILES.get("profile_image")

        # ❌ DO NOT call authenticate() here
        # Only create user
        
        if User.objects.filter(username=username).exists():
            messages.error(request, "Username already exists.")
            return redirect("register")

        user = User.objects.create_user(
            username=username,
            first_name=first_name,
            last_name=last_name,
            email=email,
            password=password
        )
        profile = user.userprofile
        if image:
            profile.profile_image = image
        profile.save()

        messages.success(request, "User registered successfully. Please log in.")
        return redirect("login")

    return render(request, "authentication/register.html")



# -------------------------------
# LOGIN
# -------------------------------
def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')

        user = authenticate(request, username=username, password=password)

        if user:
            login(request, user)
            return redirect(request.GET.get('next') or 'chatapp')
        else:
            messages.error(request, "Invalid username or password")

    return render(request, 'authentication/login.html')



# -------------------------------
# LOGOUT
# -------------------------------
def logout_view(request):
    logout(request)
    return redirect("login")



# -------------------------------
# HOME (ONLY SHOW CHAT IF LOGGED)
# -------------------------------

@login_required
def user_home(request):
    return render(request, "authentication/project_home.html")

def project_home(request):
    return render(request, "authentication/project_home.html")
