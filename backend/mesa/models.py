import secrets
from django.conf import settings
from django.db import models
from django.db.models import Q, F
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator

USER = settings.AUTH_USER_MODEL
ABILITIES = [(k, k) for k in ("FUE", "DES", "CON", "INT", "SAB", "CAR")]
CASTERS = {
    "Mago": "INT",
    "Artífice": "INT",
    "Clérigo": "SAB",
    "Druida": "SAB",
    "Explorador": "SAB",
    "Bardo": "CAR",
    "Brujo": "CAR",
    "Hechicero": "CAR",
    "Paladín": "CAR",
}


def bounded(low, high):
    return [MinValueValidator(low), MaxValueValidator(high)]


def code():
    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))


def scores():
    return dict.fromkeys(dict(ABILITIES), 10)


def wallet():
    return dict.fromkeys(("pc", "pp", "pe", "po", "ppt"), 0)


class Room(models.Model):
    name = models.CharField(max_length=80)
    dm = models.ForeignKey(USER, on_delete=models.CASCADE)
    code = models.CharField(max_length=6, unique=True, default=code)
    revision = models.PositiveBigIntegerField(default=1)
    round = models.PositiveIntegerField(default=0)
    turn = models.ForeignKey(
        "Character", null=True, on_delete=models.SET_NULL, related_name="+"
    )
    order = models.JSONField(default=list)


class Character(models.Model):
    owner = models.ForeignKey(USER, on_delete=models.CASCADE)
    room = models.ForeignKey(
        Room, null=True, on_delete=models.SET_NULL, related_name="characters"
    )
    last_seen = models.DateTimeField(null=True)
    seat = models.PositiveSmallIntegerField(null=True)
    name = models.CharField(max_length=64)
    race = models.CharField(max_length=48)
    profession = models.CharField(max_length=48)
    level = models.PositiveSmallIntegerField(default=1, validators=bounded(1, 20))
    abilities = models.JSONField(default=scores)
    casting_override = models.CharField(max_length=3, choices=ABILITIES[3:], blank=True)
    max_hp = models.PositiveSmallIntegerField(validators=bounded(1, 999))
    hp = models.PositiveSmallIntegerField()
    temp = models.PositiveSmallIntegerField(default=0)
    ac = models.PositiveSmallIntegerField(default=10, validators=bounded(1, 40))
    initiative = models.SmallIntegerField(default=0)
    die = models.PositiveSmallIntegerField(
        choices=[(x, str(x)) for x in (6, 8, 10, 12)], default=8
    )
    dice_left = models.PositiveSmallIntegerField(default=1)
    successes = models.PositiveSmallIntegerField(default=0)
    failures = models.PositiveSmallIntegerField(default=0)
    conditions = models.CharField(max_length=180, blank=True)
    concentration = models.CharField(max_length=80, blank=True)
    coins = models.JSONField(default=wallet)
    version = models.PositiveBigIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["room", "seat"], name="one_player_per_seat"
            ),
            models.UniqueConstraint(
                fields=["room", "owner"], name="one_sheet_per_player"
            ),
            models.CheckConstraint(
                condition=Q(room__isnull=True, seat__isnull=True)
                | Q(room__isnull=False, seat__isnull=False, seat__gte=1, seat__lte=10),
                name="ten_seats",
            ),
            models.CheckConstraint(
                condition=Q(hp__lte=F("max_hp")), name="hp_at_most_max"
            ),
        ]

    @property
    def proficiency(self):
        return 2 + (self.level - 1) // 4

    def mod(self, ability):
        return (self.abilities[ability] - 10) // 2

    @property
    def casting(self):
        return self.casting_override or CASTERS.get(self.profession, "")


class Action(models.Model):
    character = models.ForeignKey(
        Character, related_name="actions", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=80)
    kind = models.CharField(
        max_length=12, choices=[(v, v) for v in ("Acción", "Adicional", "Reacción")]
    )
    ability = models.CharField(max_length=3, choices=ABILITIES)
    proficient = models.BooleanField(default=True)
    damage = models.CharField(
        max_length=8,
        validators=[RegexValidator(r"^(?:[1-9]|1[0-9]|20)d(?:4|6|8|10|12|20)\Z")],
    )


class Spell(models.Model):
    character = models.ForeignKey(
        Character, related_name="spells", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=80)
    level = models.PositiveSmallIntegerField(validators=bounded(0, 9))
    time = models.CharField(max_length=80)
    reach = models.CharField(max_length=80)
    components = models.CharField(max_length=100)
    duration = models.CharField(max_length=80)
    description = models.TextField(max_length=2500)
    concentration = models.BooleanField(default=False)
    prepared = models.BooleanField(default=True)


class Slot(models.Model):
    character = models.ForeignKey(
        Character, related_name="slots", on_delete=models.CASCADE
    )
    level = models.PositiveSmallIntegerField(validators=bounded(1, 9))
    maximum = models.PositiveSmallIntegerField(validators=bounded(1, 20))
    left = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["character", "level"], name="one_slot_pool_per_level"
            )
        ]


class Resource(models.Model):
    character = models.ForeignKey(
        Character, related_name="resources", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=80)
    maximum = models.PositiveSmallIntegerField(validators=bounded(1, 999))
    left = models.PositiveSmallIntegerField()
    recharge = models.CharField(
        max_length=5, choices=[("short", "Breve"), ("long", "Prolongado")]
    )
    bardic = models.BooleanField(default=False)


class Consumable(models.Model):
    character = models.ForeignKey(
        Character, related_name="items", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=80)
    quantity = models.PositiveSmallIntegerField(validators=bounded(0, 9999))
    effect = models.CharField(
        max_length=16,
        blank=True,
        validators=[
            RegexValidator(
                r"^(?:[1-9]|1[0-9]|20)d(?:4|6|8|10|12|20)(?:[+-][0-9]{1,2})?\Z"
            )
        ],
    )
    heals = models.BooleanField(default=False)


class Event(models.Model):
    room = models.ForeignKey(Room, related_name="events", on_delete=models.CASCADE)
    text = models.CharField(max_length=500)
    at = models.DateTimeField(auto_now_add=True)
