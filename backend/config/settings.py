import os
from pathlib import Path
import dj_database_url

BASE_DIR = Path(__file__).resolve().parents[1]
DEBUG = os.getenv("DKC_DEV") == "1"
SECRET_KEY = (
    "local-test-key-only-0000000000000000000000000000"
    if DEBUG
    else os.environ["SECRET_KEY"]
)
ALLOWED_HOSTS = [
    x
    for x in (
        "localhost",
        "127.0.0.1",
        os.getenv("RENDER_EXTERNAL_HOSTNAME"),
        os.getenv("API_HOST"),
    )
    if x
]
CORS_ALLOWED_ORIGINS = [
    x for x in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if x
]
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "corsheaders",
    "rest_framework",
    "mesa",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]
ROOT_URLCONF = "config.urls"
DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL")
        or (
            "sqlite:///" + str(BASE_DIR / "local.sqlite3")
            if DEBUG
            else os.environ["DATABASE_URL"]
        )
    )
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
LANGUAGE_CODE = "es"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication"
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "50/min"},
}
