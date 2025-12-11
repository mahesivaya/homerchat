from django.conf import settings
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.utils import timezone


class SessionTimeoutMiddleware:
    """
    Logs out user after inactivity timeout.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.timeout = getattr(settings, "SESSION_TIMEOUT", 120)

    def __call__(self, request):

        EXEMPT_PATHS = ["/login/", "/logout/", "/register/", "/static/"]

        if any(request.path.startswith(p) for p in EXEMPT_PATHS):
            return self.get_response(request)

        if request.user.is_authenticated:
            now = timezone.now().timestamp()
            last_activity = request.session.get("last_activity")

            if last_activity and now - last_activity > self.timeout:

                logout(request)
                request.session.flush()
                return redirect("/login/?timeout=1")  # 👈 FIX HERE

            request.session["last_activity"] = now

        return self.get_response(request)


# myapp/middleware.py
import logging
import json

logger = logging.getLogger(__name__)

