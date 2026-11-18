from pathlib import Path


def test_guided_setup_migrations_are_registered_in_order():
    migrator = (Path(__file__).resolve().parents[3] / 'packages/db/src/migrate.ts').read_text()
    assert migrator.index("tag: '0084_chat_guided_setups'") < migrator.index(
        "tag: '0085_chat_guided_setup_receipts'"
    )
