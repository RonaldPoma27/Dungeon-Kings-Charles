from collections.abc import Mapping
from rest_framework import serializers as s
from .models import (
    Action,
    Character,
    Consumable,
    Resource,
    Slot,
    Spell,
    CharacterSpell,
    StandardAction,
    ABILITIES,
)


class Strict(s.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, Mapping) or set(data) - self.fields.keys():
            raise s.ValidationError("Campos desconocidos o formato inválido.")
        return super().to_internal_value(data)


def validated(serializer, data):
    obj = serializer(data=data)
    obj.is_valid(raise_exception=True)
    return obj.validated_data


class NewCharacter(s.ModelSerializer):
    def validate_abilities(self, value):
        if (
            not isinstance(value, dict)
            or set(value) != set(dict(ABILITIES))
            or any(type(n) != int or not 1 <= n <= 30 for n in value.values())
        ):
            raise s.ValidationError(
                "Ingresá las seis características con valores de 1 a 30."
            )
        return value

    class Meta:
        model = Character
        fields = (
            "name",
            "race",
            "profession",
            "level",
            "abilities",
            "casting_override",
            "ac",
            "die",
            "max_hp",
            "initiative",
        )


class ActionData(s.ModelSerializer):
    class Meta:
        model = Action
        exclude = ["character"]


class CatalogSpellData(s.ModelSerializer):
    class Meta:
        model = Spell
        fields = "__all__"


class StandardActionData(s.ModelSerializer):
    class Meta:
        model = StandardAction
        fields = ["id", "name", "description"]


class SpellData(s.ModelSerializer):
    class Meta:
        model = CharacterSpell
        read_only_fields = ["catalog", "classes"]
        exclude = ["character"]


class ResourceData(s.ModelSerializer):
    class Meta:
        model = Resource
        exclude = ["character"]
        read_only_fields = ["left"]


class SlotData(s.ModelSerializer):
    class Meta:
        model = Slot
        exclude = ["character"]
        read_only_fields = ["left"]
        validators = []


class ItemData(s.ModelSerializer):
    class Meta:
        model = Consumable
        exclude = ["character"]


POOLS = {
    "actions": ActionData,
    "spells": SpellData,
    "resources": ResourceData,
    "slots": SlotData,
    "items": ItemData,
}


class Sheet(s.ModelSerializer):
    actions = ActionData(many=True)
    spells = SpellData(many=True)
    resources = ResourceData(many=True)
    slots = SlotData(many=True)
    items = ItemData(many=True)

    class Meta:
        model = Character
        fields = [f.name for f in Character._meta.fields] + [
            "proficiency",
            "casting",
            *POOLS,
        ]


class Command(Strict):
    op = s.CharField(max_length=24)
    version = s.IntegerField(min_value=1)
    value = s.IntegerField(min_value=-9999, max_value=9999, default=0)
    id = s.IntegerField(min_value=1, required=False)
    mode = s.ChoiceField(choices=["normal", "ventaja", "desventaja"], default="normal")
    text = s.CharField(max_length=180, default="", allow_blank=True)
    pool = s.ChoiceField(choices=list(POOLS), required=False)
    data = s.DictField(required=False)
    replace = s.BooleanField(default=False)


class Registration(Strict):
    username = s.RegexField(r"^[\w.@+-]+$", max_length=100)
    password = s.CharField(min_length=8, max_length=128, trim_whitespace=False)


class Join(Strict):
    code = s.RegexField(r"^[A-Z0-9]{6}$")
    character = s.IntegerField(min_value=1)


class RoomName(Strict):
    name = s.CharField(max_length=80)
