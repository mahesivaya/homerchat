# myapp/middleware.py
import logging
import json
import time

logger = logging.getLogger("request_logger")


class APILoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        logger.info(f"API Request: {request.method} {request.path}")
        response = self.get_response(request)
        logger.info(f"API Response: {response.status_code}")
        return response


class RequestLoggingMiddleware:
    """
    Logs every request and response.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = time.time()

        method = request.method
        path = request.get_full_path()
        user = request.user.username if request.user.is_authenticated else "Anonymous"
        ip = request.META.get('REMOTE_ADDR')
        headers = {k: v for k, v in request.META.items() if k.startswith("HTTP_")}

        logger.info(f"[REQUEST] {method} | {path} | user={user} | IP={ip}")

        response = self.get_response(request)

        duration = (time.time() - start_time) * 1000
        logger.info(f"[RESPONSE] {method} | {path} | {response.status_code} | {duration:.2f} ms")

        return response

