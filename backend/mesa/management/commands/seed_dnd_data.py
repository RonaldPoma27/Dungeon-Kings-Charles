import json
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from mesa.models import Spell, StandardAction

DATA = Path(settings.BASE_DIR) / "mesa" / "data"


class Command(BaseCommand):
    help = "Carga las acciones y una tanda de conjuros, sin modificar grimorios existentes."

    def add_arguments(self, parser):
        parser.add_argument("--spells", type=Path, default=DATA / "spells_seed.json")

    @transaction.atomic
    def handle(self, *args, **options):
        for model, path in [
            (StandardAction, DATA / "actions_seed.json"),
            (Spell, options["spells"]),
        ]:
            rows = json.loads(path.read_text(encoding="utf-8"))
            seen = set()
            for row in rows:
                name = row["name"]
                if name in seen:
                    raise CommandError(f"Ficha duplicada en el lote: {name}")
                seen.add(name)
                obj = model.objects.filter(name=name).first() or model()
                for key, value in row.items():
                    setattr(obj, key, value)
                obj.full_clean()
                obj.save()
            self.stdout.write(f"{model.__name__}: {len(rows)} registros procesados")
