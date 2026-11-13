from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from mesa import views

urlpatterns = [
    path("api/health/", views.healthcheck),
    path("api/register/", views.register),
    path("api/token/", TokenObtainPairView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
    path("api/lobby/", views.lobby),
    path("api/characters/", views.character),
    path("api/rooms/", views.create_room),
    path("api/join/", views.join),
    path("api/rooms/<int:pk>/", views.snapshot),
    path("api/rooms/<int:pk>/turn/", views.turns),
    path("api/rooms/<int:pk>/characters/<int:cid>/", views.combat),
]
