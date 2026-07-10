# Repository Guidelines

## Agent Workflow
- Start substantive work by reading `~/.codex/skills/expression-skill/SKILL.md`; use conclusion-first, evidence-backed updates.
- For multi-step work, keep `task_plan.md` and `notes.md` current before implementation and after each phase.
- Before editing, inspect the live file state and `git status --short --branch`. Do not overwrite user changes or perform destructive cleanup without naming the exact paths and getting approval.

## Project Layout
- `docent_core/` contains the core backend, server, worker, DB services, and CLI entrypoint `docent_core.cli:app`.
- `docent/` is the editable local `docent-python` SDK package used by the core project.
- `docent_core/_web/` is the Next.js frontend. It has its own `package.json`, `bun.lock`, Tailwind, ESLint, and Prettier config.
- `alembic/` stores database migrations.
- `tests/` stores pytest unit and integration tests; integration tests require Postgres and create `_pytest_docent_test`.
- `docs/` plus `mkdocs.yml` build the MkDocs documentation.

## Setup And Local Services
- Copy environment defaults with `cp .env.template .env`; never commit `.env` or real API keys.
- Install Python dev dependencies with `uv sync --extra dev`.
- Start only Postgres and Redis for manual development with `docker compose -f docker-compose-db.yml up --build`.
- Apply migrations with `uv run alembic upgrade head`.
- Run services manually as separate processes:
  - `uv run docent_core server --port 8889`
  - `uv run docent_core worker --workers 1`
  - `uv run docent_core web --port 3001 --backend-url http://localhost:8889`
- For the full container stack, use `DOCENT_SERVER_PORT=8889 DOCENT_WEB_PORT=3001 docker compose up --build`; only the Web port is published for application traffic.

## Validation Commands
- Python tests: `uv run pytest tests/ -v`.
- Fast unit tests: `uv run pytest -m unit -v`.
- Integration tests: `uv run pytest -m integration -v`.
- Python lint/type/format suite: `uv run pre-commit run --all-files`.
- Frontend install/lint/build:
  - `cd docent_core/_web && bun install`
  - `cd docent_core/_web && bun run lint`
  - `cd docent_core/_web && bun run build`
- Docs preview: `uv sync --extra docs`, then `uv run mkdocs serve`.

## Backend Conventions
- Application services should accept an `AsyncSession` and required dependent services. Service callers usually own flush/commit behavior.
- Pass SQLAlchemy model instances into service methods instead of IDs when the caller can load and validate them.
- Prefix variables holding SQLAlchemy model instances with `sq_`.
- In `docent_core/_db_service/schemas/`, use `Mapped[T]`, explicit `nullable=...`, indexed foreign keys, bidirectional `back_populates`, appropriate cascades, and `from_pydantic` / `to_pydantic` conversion methods.

## Frontend Conventions
- Use Redux slices in `app/store` for frontend state.
- Use RTK Query for new backend API access. Do not refactor existing thunks unless the task explicitly asks for that migration.
- Prefer existing components, hooks, and utilities under `docent_core/_web/components`, `hooks`, `lib`, and `providers`.
- Follow the local color system from `globals.css` and Tailwind config. Use semantic classes such as `bg-blue-bg`, `border-blue-border`, and `text-blue-text`; avoid arbitrary color values.
- Preserve light and dark mode behavior when changing UI.

## Change Boundaries
- Do not change `uv.lock` or `docent_core/_web/bun.lock` unless dependencies changed intentionally.
- Do not edit Alembic migrations casually; create a new migration for schema changes.
- Keep public documentation consistent across `README.md`, `docs/`, and CLI examples when changing user-facing commands.
