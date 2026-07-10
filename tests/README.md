# Docent test suite

The test suite is split into fast unit tests and integration tests that exercise the real PostgreSQL and Redis service layers through the FastAPI application in-process.

Run commands from the repository root after installing development dependencies:

```bash
uv sync --extra dev
```

## Unit tests

```bash
uv run pytest tests/unit -q
```

Run a focused file while developing:

```bash
uv run pytest tests/unit/test_localization.py -q
```

Use the directory-scoped command rather than `pytest -m unit`. The unit and integration directories currently both contain a module named `test_hodoscope_analysis.py`; collecting the entire tree by marker causes a pytest import-file mismatch.

## Integration-test services

Integration fixtures currently use fixed local addresses; `.env` does not override them:

- PostgreSQL: `docent_user:docent_password@localhost:5432/_pytest_docent_test`
- Redis: `localhost:6379`, database `1`

If your local `.env` publishes either service on a different host port, these fixtures will not follow it; use the fixed ports above or run the tests in an isolated network that exposes those addresses.

Start the repository's data services:

```bash
docker compose -f docker-compose-db.yml up -d postgres redis
```

Confirm both services are ready before creating the database:

```bash
docker compose -f docker-compose-db.yml exec postgres \
  pg_isready -U docent_user

docker compose -f docker-compose-db.yml exec redis redis-cli ping
```

The Compose service creates `docent_db`, not the test database. Create the dedicated database once and enable pgvector in it:

```bash
docker compose -f docker-compose-db.yml exec postgres \
  createdb -U docent_user _pytest_docent_test

docker compose -f docker-compose-db.yml exec postgres \
  psql -U docent_user -d _pytest_docent_test \
  -c 'CREATE EXTENSION IF NOT EXISTS vector;'
```

If `createdb` reports that the database already exists, continue with the extension command.

> **Destructive test boundary:** before every integration test, the fixture drops and recreates all SQLAlchemy-managed tables in `_pytest_docent_test`. It also flushes Redis database `1` before and after every test. Never point these names at shared or production data.

The HTTP clients use `httpx.ASGITransport`, so the backend and worker do not need to run as separate processes. PostgreSQL and Redis do need to be reachable at the fixed addresses above.

Integration fixtures build tables from current SQLAlchemy metadata rather than exercising the Alembic migration chain. Do not run integration suites concurrently: every process would reset the same database and Redis namespace.

## Integration tests

```bash
uv run pytest tests/integration -q
```

Run a focused API integration test:

```bash
uv run pytest tests/integration/test_user_preferences.py -q
```

Use the directory-scoped command rather than `pytest -m integration` for the same duplicate-module reason described under unit tests.

## Test layout

- `unit/`: isolated behavior and query-construction tests; external services should be mocked or avoided.
- `integration/`: database, Redis, service, loader, and API integration tests.
- `integration/fixtures/database.py`: database, Redis, service, and dependency-override fixtures.
- `integration/fixtures/http_client.py`: unauthenticated and authenticated in-process clients.
- `integration/data/`: committed test fixtures.

Markers are registered in `pytest.ini`:

- `unit`
- `integration`
- `slow`

Until the duplicate module names are resolved, treat markers as metadata and select unit or integration tests by directory.

## Stop local services

```bash
docker compose -f docker-compose-db.yml down
```

Do not add `-v` unless you intentionally want to delete the local PostgreSQL volume.
