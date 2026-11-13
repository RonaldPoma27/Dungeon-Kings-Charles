from django.shortcuts import get_object_or_404
from .rules import require, rest, dice, health
from .serializers import POOLS, validated, NewCharacter
from .models import wallet

STANDARD = (
    "Atacar",
    "Correr",
    "Destrabarse",
    "Esquivar",
    "Ayudar",
    "Esconderse",
    "Preparar",
)


def apply(c, cmd):
    op, v, text = cmd["op"], cmd["value"], cmd["text"]

    def entry(pool):
        return get_object_or_404(getattr(c, pool), pk=cmd.get("id"))

    if op == "hp":
        health(c, v)
    elif op == "temp":
        require(v >= 0, "PG temporales inválidos.")
        c.temp = v
    elif op == "death":
        require(
            c.hp == 0 and text in ("successes", "failures") and 0 <= v <= 3,
            "Salvación inválida.",
        )
        setattr(c, text, v)
    elif op == "conditions":
        c.conditions = text
    elif op == "rest":
        require(text in ("short", "long"), "Descanso inválido.")
        return rest(c, text == "long", v)
    elif op == "setup":
        pool = cmd.get("pool")
        require(pool in POOLS, "Colección inválida.")
        existing = entry(pool) if "id" in cmd else None
        serializer = POOLS[pool](existing, data=cmd.get("data", {}))
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if pool == "slots":
            require(
                not c.slots.filter(level=data["level"])
                .exclude(pk=getattr(existing, "pk", None))
                .exists(),
                "Nivel ya configurado.",
            )
        extra = (
            {
                "left": (
                    min(existing.left, data["maximum"]) if existing else data["maximum"]
                )
            }
            if pool in ("slots", "resources")
            else {}
        )
        serializer.save(character=c, **extra)
    elif op in ("resources", "slots", "items"):
        row = entry(op)
        field = "quantity" if op == "items" else "left"
        new = getattr(row, field) + v
        require(0 <= new <= (9999 if op == "items" else row.maximum), "Fuera de rango.")
        setattr(row, field, new)
        row.save()
    elif op == "consume":
        item = entry("items")
        require(item.quantity > 0, "Sin existencias.")
        item.quantity -= 1
        item.save()
        if item.effect:
            n, result = dice(item.effect)
            if item.heals:
                health(c, max(0, n))
            return f"{item.name} · {result}"
        return item.name
    elif op == "cast":
        spell = entry("spells")
        require(
            not (spell.concentration and c.concentration) or cmd["replace"],
            "Confirmá el cambio de concentración.",
        )
        if spell.level:
            require(spell.level <= v <= 9, "Nivel de espacio inválido.")
            slot = get_object_or_404(c.slots, level=v)
            require(slot.left > 0, "Sin espacios disponibles.")
            slot.left -= 1
            slot.save()
        if spell.concentration:
            c.concentration = spell.name
        return f"Lanza {spell.name}"
    elif op == "release":
        c.concentration = ""
    elif op in ("attack", "damage"):
        action = entry("actions")
        bonus = c.mod(action.ability)
        if op == "attack":
            bonus += c.proficiency if action.proficient else 0
        formula = ("1d20" if op == "attack" else action.damage) + f"{bonus:+}"
        return (
            action.name
            + " · "
            + dice(formula, cmd["mode"] if op == "attack" else "normal")[1]
        )
    elif op == "roll":
        return dice(text, cmd["mode"])[1]
    elif op == "standard":
        require(text in STANDARD, "Acción inválida.")
        return text
    elif op == "coin":
        require(
            text in wallet() and 0 <= c.coins[text] + v <= 999999, "Monto inválido."
        )
        c.coins[text] += v
    elif op == "profile":
        data = validated(NewCharacter, cmd.get("data", {}))
        for key, value in data.items():
            setattr(c, key, value)
        c.hp = min(c.hp, c.max_hp)
        c.dice_left = min(c.dice_left, c.level)
    else:
        require(False, "Operación desconocida.")
    return None
