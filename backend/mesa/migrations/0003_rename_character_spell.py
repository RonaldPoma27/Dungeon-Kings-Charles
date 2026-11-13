from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("mesa", "0002_character_last_seen")]
    operations = [migrations.RenameModel("Spell", "CharacterSpell")]
