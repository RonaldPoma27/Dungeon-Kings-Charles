from django.db.models import F
import re
import secrets
from rest_framework.exceptions import ValidationError


def require(ok, message):
    if not ok:
        raise ValidationError(message)


def dice(formula, mode="normal"):
    m = re.fullmatch(
        r"([1-9]|1[0-9]|20)d(4|6|8|10|12|20|100)([+-][0-9]{1,2})?", formula
    )
    require(m, "Fórmula inválida. Ejemplo: 2d6+3.")
    count, sides = map(int, m.groups()[:2])
    modifier = int(m[3] or 0)
    double = mode != "normal"
    require(not double or (count, sides) == (1, 20), "La ventaja requiere 1d20.")
    rolls = [secrets.randbelow(sides) + 1 for _ in range(2 if double else count)]
    total = (
        max(rolls) if mode == "ventaja" else min(rolls) if double else sum(rolls)
    ) + modifier
    return total, f"{formula} ({mode}) {rolls} = {total}"


def health(c, amount):
    if amount < 0:
        absorbed = min(c.temp, -amount)
        c.temp -= absorbed
        amount += absorbed
    c.hp = max(0, min(c.max_hp, c.hp + amount))
    if c.hp:
        c.successes = c.failures = 0
    else:
        c.concentration = ""


def rest(c, long, spend):
    log = []
    if long:
        health(c, c.max_hp)
        c.temp = 0
        missing = c.level - c.dice_left
        c.dice_left += (missing + 1) // 2
        c.slots.update(left=F("maximum"))
        c.resources.update(left=F("maximum"))
    else:
        require(0 <= spend <= c.dice_left, "Dados de Golpe insuficientes.")
        for _ in range(spend):
            n, detail = dice(f"1d{c.die}{c.mod('CON'):+}")
            health(c, max(0, n))
            log.append(detail)
        c.dice_left -= spend
        c.resources.filter(recharge="short").update(left=F("maximum"))
    return ("Descanso prolongado" if long else "Descanso breve") + " " + ", ".join(log)
