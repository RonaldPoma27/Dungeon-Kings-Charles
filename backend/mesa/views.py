from django.contrib.auth import get_user_model
from django.db import transaction, IntegrityError
from datetime import timedelta
from django.utils import timezone
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from .models import Character, Room, Event
from .serializers import (
    Command,
    Registration,
    Join,
    RoomName,
    NewCharacter,
    Sheet,
    validated,
    POOLS,
)
from .combat import apply
from .rules import require, dice


def accessible(user):
    return Room.objects.filter(Q(dm=user) | Q(characters__owner=user)).distinct()


def change(room, message=None):
    room.revision += 1
    room.save()
    if message:
        Event.objects.create(room=room, text=message[:500])


@api_view(["GET"])
@permission_classes([AllowAny])
def healthcheck(request):
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    data = validated(Registration, request.data)
    try:
        get_user_model().objects.create_user(**data)
    except IntegrityError:
        raise ValidationError("Nombre de usuario ocupado.")
    return Response({"ok": True}, status=201)


@api_view(["GET"])
def lobby(request):
    return Response(
        {
            "me": request.user.pk,
            "username": request.user.username,
            "rooms": list(accessible(request.user).values("id", "name", "dm", "code")),
            "characters": list(
                Character.objects.filter(owner=request.user, room=None).values(
                    "id", "name"
                )
            ),
        }
    )


@api_view(["POST"])
def create_room(request):
    data = validated(RoomName, request.data)
    for _ in range(5):
        try:
            with transaction.atomic():
                room = Room.objects.create(dm=request.user, **data)
            return Response({"id": room.pk, "code": room.code}, status=201)
        except IntegrityError:
            continue
    raise ValidationError("Reintentá la creación de la sala.")


@api_view(["POST"])
def character(request):
    data = validated(NewCharacter, request.data)
    c = Character.objects.create(
        owner=request.user, hp=data["max_hp"], dice_left=data.get("level", 1), **data
    )
    return Response({"id": c.pk}, status=201)


@api_view(["POST"])
@transaction.atomic
def join(request):
    data = validated(Join, request.data)
    room = get_object_or_404(Room.objects.select_for_update(), code=data["code"])
    c = get_object_or_404(
        Character.objects.select_for_update(), pk=data["character"], owner=request.user
    )
    if c.room_id == room.pk:
        return Response({"id": room.pk})
    require(
        c.room_id is None and room.dm_id != request.user.pk,
        "La ficha debe estar libre y pertenecer a un jugador.",
    )
    seats = set(room.characters.values_list("seat", flat=True))
    require(
        len(seats) < 10 and not room.characters.filter(owner=request.user).exists(),
        "Sala llena o jugador ya vinculado.",
    )
    c.seat = min(set(range(1, 11)) - seats)
    c.room = room
    c.save()
    change(room, f"{c.name} se unió a la mesa.")
    return Response({"id": room.pk})


@api_view(["GET"])
@transaction.atomic
def snapshot(request, pk):
    # Lock only for full snapshots. Writers lock this row before mutating any sheet.
    room = get_object_or_404(accessible(request.user), pk=pk)
    if request.query_params.get("presence") == "1" and request.user.pk != room.dm_id:
        room = Room.objects.select_for_update().get(pk=pk)
        now = timezone.now()
        changed = (
            room.characters.filter(owner=request.user)
            .filter(
                Q(last_seen__isnull=True) | Q(last_seen__lt=now - timedelta(seconds=25))
            )
            .update(last_seen=now)
        )
        if changed:
            room.revision += 1
            room.save(update_fields=["revision"])
    if request.query_params.get("since") == str(room.revision):
        return Response(status=304)
    room = Room.objects.select_for_update().get(pk=pk)
    chars = room.characters.order_by("seat").prefetch_related(*POOLS)
    return Response(
        {
            "id": pk,
            "name": room.name,
            "dm": room.dm_id,
            "code": room.code,
            "revision": room.revision,
            "round": room.round,
            "turn": room.turn_id,
            "order": room.order,
            "characters": Sheet(chars, many=True).data,
            "events": list(room.events.order_by("-id").values("id", "at", "text")[:60]),
        }
    )


@api_view(["PATCH"])
@transaction.atomic
def combat(request, pk, cid):
    cmd = validated(Command, request.data)
    room = get_object_or_404(Room.objects.select_for_update(), pk=pk)
    c = get_object_or_404(room.characters, pk=cid, owner=request.user)
    if cmd["version"] != c.version:
        return Response({"detail": "La ficha cambió. Volvé a intentar."}, status=409)
    message = apply(c, cmd)
    c.version += 1
    c.save()
    change(room, f"{c.name} · {message}" if message else None)
    return Response({"version": c.version})


@api_view(["PATCH"])
@transaction.atomic
def turns(request, pk):
    room = get_object_or_404(Room.objects.select_for_update(), pk=pk, dm=request.user)
    cmd = validated(Command, request.data)
    if cmd["version"] != room.revision:
        return Response({"detail": "La mesa cambió. Actualizá el turno."}, status=409)
    if cmd["op"] == "start":
        results = [
            (dice(f"1d20{c.initiative:+}")[0], c.pk, c.name)
            for c in room.characters.order_by("seat")
        ]
        require(results, "Se necesita al menos un personaje.")
        results.sort(key=lambda x: -x[0])
        room.order = [x[1] for x in results]
        room.turn, room.round = None, 1
        room.turn_id = room.order[0]
        message = "Iniciativa · " + ", ".join(f"{name} {n}" for n, _, name in results)
    elif cmd["op"] == "next" and room.order:
        pos = (room.order.index(room.turn_id) + 1) % len(room.order)
        room.round += int(pos == 0)
        room.turn_id = room.order[pos]
        message = "Turno de " + room.turn.name
    elif cmd["op"] == "end":
        room.order, room.turn, room.round = [], None, 0
        message = "Fin del encuentro"
    else:
        raise ValidationError("Turno inválido.")
    change(room, message)
    return Response({"revision": room.revision})
