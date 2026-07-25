from app.config import Settings


def test_normalizes_render_heroku_postgres_scheme():
    # Managed providers hand out postgres:// which SQLAlchemy 2.0 rejects.
    s = Settings(database_url="postgres://u:p@host:5432/db")
    assert s.resolved_database_url == "postgresql+psycopg2://u:p@host:5432/db"


def test_normalizes_bare_postgresql_scheme():
    s = Settings(database_url="postgresql://u:p@host/db")
    assert s.resolved_database_url == "postgresql+psycopg2://u:p@host/db"


def test_preserves_explicit_driver():
    s = Settings(database_url="postgresql+asyncpg://u:p@host/db")
    assert s.resolved_database_url == "postgresql+asyncpg://u:p@host/db"


def test_leaves_sqlite_untouched():
    s = Settings(database_url="sqlite:///./x.db")
    assert s.resolved_database_url == "sqlite:///./x.db"


def test_assembles_from_parts_when_no_url():
    s = Settings(
        database_url=None,
        postgres_user="leadengine",
        postgres_password="pw",
        postgres_host="db",
        postgres_port=5432,
        postgres_db="leadengine",
    )
    assert s.resolved_database_url == "postgresql+psycopg2://leadengine:pw@db:5432/leadengine"
