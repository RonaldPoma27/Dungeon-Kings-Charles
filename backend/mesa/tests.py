from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.contrib.auth import get_user_model
from django.db import connection, connections
from django.test import TransactionTestCase
from rest_framework.test import APITestCase, APIClient
from .models import Room, Character


class TableTests(APITestCase):
    def setUp(self):
        self.dm = get_user_model().objects.create_user("dm")
        self.player = get_user_model().objects.create_user("player")
        self.client.force_authenticate(self.dm)
        self.room = self.client.post("/api/rooms/", {"name": "Bosque"}).data
        self.url = f"/api/rooms/{self.room['id']}/"
        self.client.force_authenticate(self.player)
        self.cid = self.client.post(
            "/api/characters/",
            {
                "name": "Ada",
                "race": "Elfa",
                "profession": "Mago",
                "max_hp": 16,
                "level": 4,
            },
            format="json",
        ).data["id"]
        self.client.post(
            "/api/join/", {"code": self.room["code"], "character": self.cid}
        )

    def cmd(self, op, **args):
        version = Character.objects.get(pk=self.cid).version
        return self.client.patch(
            self.url + f"characters/{self.cid}/",
            {"version": version, "op": op, **args},
            format="json",
        )

    def sheet(self):
        return self.client.get(self.url).data["characters"][0]

    def seed(self):
        from django.core.management import call_command
        from io import StringIO

        call_command("seed_dnd_data", stdout=StringIO())

    def test_seed_and_filters(self):
        self.seed()
        self.seed()
        fetch = lambda **q: self.client.get("/api/spells/", q)
        self.assertEqual(len(fetch(level=0).data), 27)
        self.assertEqual(len(fetch(level=1).data), 62)
        self.assertEqual(fetch(level=10).status_code, 400)
        rows = fetch(name="alar", character_class="mago", level=1).data
        self.assertEqual([r["name"] for r in rows], ["Alarma"])
        self.assertTrue(rows[0]["ritual"])
        self.assertEqual(fetch(name="Alarma", character_class="Bardo").data, [])
        self.assertEqual(len(self.client.get("/api/actions/").data), 10)

    def test_clone_is_independent_and_homebrew_survives(self):
        self.seed()
        base = self.client.get("/api/spells/", {"name": "Encontrar familiar"}).data[0]
        self.assertEqual(self.cmd("learn", id=base["id"]).status_code, 200)
        learned = self.sheet()["spells"][0]
        for key in [
            "name",
            "level",
            "school",
            "ritual",
            "classes",
            "components",
            "duration",
            "concentration",
            "description",
        ]:
            self.assertEqual(learned[key], base[key])
        self.assertEqual(learned["time"], base["casting_time"])
        self.assertEqual(learned["reach"], base["range"])
        self.assertEqual(self.cmd("learn", id=base["id"]).status_code, 400)
        learned["description"] = "Variante de mesa"
        self.cmd("setup", pool="spells", id=learned["id"], data=learned)
        self.seed()
        self.assertEqual(self.sheet()["spells"][0]["description"], "Variante de mesa")
        self.assertEqual(
            self.client.get("/api/spells/", {"name": base["name"]}).data[0], base
        )
        self.cmd(
            "setup",
            pool="spells",
            data={
                "name": "Luz local",
                "level": 0,
                "time": "1 acción",
                "reach": "Toque",
                "components": "V",
                "duration": "1 hora",
                "description": "Luz de prueba",
            },
        )
        self.assertIsNone(
            next(s for s in self.sheet()["spells"] if s["name"] == "Luz local")[
                "catalog"
            ]
        )

    def test_action_descriptions_and_legacy_commands(self):
        self.seed()
        self.assertEqual(self.cmd("standard", text="Correr").status_code, 200)
        self.assertIn("Carrera", self.client.get(self.url).data["events"][0]["text"])
        text = "El objetivo tira una salvación. " * 100
        self.assertEqual(
            self.cmd(
                "setup",
                pool="actions",
                data={
                    "name": "Golpe",
                    "ability": "FUE",
                    "kind": "Acción",
                    "damage": "1d6",
                    "description": text.strip(),
                },
            ).status_code,
            200,
        )
        self.assertEqual(self.sheet()["actions"][0]["description"], text.strip())

    def test_life_and_replay(self):
        self.cmd("temp", value=5)
        self.cmd("hp", value=-8)
        self.assertEqual((self.sheet()["hp"], self.sheet()["temp"]), (13, 0))
        self.assertEqual(
            self.client.patch(
                self.url + f"characters/{self.cid}/",
                {"op": "hp", "value": -8, "version": 2},
                format="json",
            ).status_code,
            409,
        )
        self.cmd("hp", value=-30)
        self.cmd("death", text="successes", value=2)
        self.cmd("hp", value=1)
        self.assertEqual(self.sheet()["successes"], 0)

    def test_consumable_and_rest(self):
        self.cmd(
            "setup",
            pool="items",
            data={"name": "Poción", "quantity": 1, "effect": "2d4+2", "heals": True},
        )
        self.cmd("hp", value=-16)
        item = self.sheet()["items"][0]["id"]
        self.cmd("consume", id=item)
        self.assertTrue(4 <= self.sheet()["hp"] <= 10)
        self.assertEqual(self.cmd("consume", id=item).status_code, 400)
        for reset in ["long", "short"]:
            self.cmd(
                "setup",
                pool="resources",
                data={"name": reset, "maximum": 2, "recharge": reset},
            )
        for r in self.sheet()["resources"]:
            self.cmd("resources", id=r["id"], value=-2)
        self.cmd("rest", text="short", value=3)
        self.assertEqual(
            {r["recharge"]: r["left"] for r in self.sheet()["resources"]},
            {"short": 2, "long": 0},
        )
        self.cmd("rest", text="long")
        self.assertEqual((self.sheet()["hp"], self.sheet()["dice_left"]), (16, 3))

    def test_cast_and_conflict(self):
        self.cmd("setup", pool="slots", data={"level": 1, "maximum": 2})
        self.cmd(
            "setup",
            pool="spells",
            data={
                "level": 1,
                "name": "Luz",
                "concentration": True,
                "time": "1 acción",
                "reach": "6 m",
                "duration": "1 min",
                "components": "V",
                "description": "Marca un lugar.",
            },
        )
        spell = self.sheet()["spells"][0]["id"]
        self.cmd("cast", id=spell, value=1)
        self.assertEqual(self.cmd("cast", id=spell, value=1).status_code, 400)
        self.assertEqual(self.sheet()["slots"][0]["left"], 1)
        self.cmd("cast", id=spell, value=1, replace=True)
        self.cmd("rest", text="long")
        self.assertEqual(self.sheet()["slots"][0]["left"], 2)

    def test_visibility_turns_and_poll(self):
        self.client.force_authenticate(get_user_model().objects.create_user("outsider"))
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.client.force_authenticate(self.player)
        revision = self.client.get(self.url).data["revision"]
        self.assertEqual(
            self.client.get(self.url, {"since": revision}).status_code, 304
        )
        self.assertEqual(
            self.client.patch(
                self.url + "turn/", {"op": "start", "version": revision}, format="json"
            ).status_code,
            404,
        )
        self.client.force_authenticate(self.dm)
        self.assertEqual(
            self.client.patch(
                self.url + "turn/", {"op": "start", "version": revision}, format="json"
            ).status_code,
            200,
        )
        self.assertEqual(self.client.get(self.url).data["turn"], self.cid)

    def test_attack_and_dice_validation(self):
        self.cmd(
            "setup",
            pool="actions",
            data={"name": "Arco", "kind": "Acción", "ability": "DES", "damage": "1d6"},
        )
        self.assertEqual(
            self.cmd(
                "attack", id=self.sheet()["actions"][0]["id"], mode="ventaja"
            ).status_code,
            200,
        )
        self.assertIn("ventaja", self.client.get(self.url).data["events"][0]["text"])
        self.assertEqual(self.cmd("roll", text="4000d20").status_code, 400)


@skipUnless(
    connection.vendor == "postgresql", "Verifica bloqueo por fila de PostgreSQL."
)
class CapacityTests(TransactionTestCase):
    def test_race_for_last_seat(self):
        users = get_user_model().objects
        room = Room.objects.create(dm=users.create_user("dm"), name="Mesa")
        sheets = []
        for i in range(11):
            owner = users.create_user(str(i))
            sheets.append(
                Character.objects.create(
                    owner=owner,
                    name=str(i),
                    hp=1,
                    max_hp=1,
                    room=room if i < 9 else None,
                    seat=i + 1 if i < 9 else None,
                )
            )
        barrier = Barrier(2)

        def join_one(sheet):
            try:
                c = APIClient()
                c.force_authenticate(sheet.owner)
                barrier.wait(timeout=10)
                return c.post(
                    "/api/join/", {"character": sheet.pk, "code": room.code}
                ).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(join_one, sheets[-2:])), [200, 400])
        self.assertEqual(room.characters.count(), 10)
