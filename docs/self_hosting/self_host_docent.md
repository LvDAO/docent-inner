# Self-host Docent

For most users, we recommend starting with the [public version](../quickstart.md) of Docent. We also provide white-glove hosting support for larger organizations; please [reach out](mailto:kevin@transluce.org?subject=Inquiry%20about%20Docent%20hosting) if you're interested.

### 1. Clone the repo

```bash
git clone https://github.com/TransluceAI/docent.git
cd docent
```

Install [Docker Engine](https://docs.docker.com/engine/install/) with Docker Compose v2. No host Python, uv, Bun, Postgres, or Redis installation is required for the Compose path.

### 2. Create and edit the single configuration file

Run the deployment command once:

```bash
./deploy.sh
```

The first run copies `.env.template` to `.env`, restricts its permissions, and stops. Edit only `.env`; do not edit the Compose files for normal deployment settings. Replace every `<...>` placeholder and review the values described in [Environment variables](./environment_variables.md).

For LLM-backed analysis, set the LLM endpoint in `.env`. The default is DeepSeek:

```bash
DOCENT_LLM_PROVIDER=deepseek
DOCENT_LLM_BASE_URL=https://api.deepseek.com
DOCENT_LLM_API_KEY=...
DOCENT_LLM_FLASH_MODEL=deepseek-v4-flash
DOCENT_LLM_PRO_MODEL=deepseek-v4-pro
```

For a custom OpenAI-compatible endpoint, set `DOCENT_LLM_PROVIDER=custom`, provide your `DOCENT_LLM_BASE_URL`, and set the model variables you want each Docent feature to use. See [LLM calls](./environment_variables.md#llm-calls) for the per-feature model list.

!!! note
The Web UI and `/rest` API use one origin by default. Configure `DOCENT_CORS_ORIGINS` only if you explicitly run the Web CLI with `--cross-origin` or put the API on a separate public origin.

!!! note
In Compose, `localhost` inside backend or worker settings means that container. For an LLM or embedding server running on the Docker host, use `http://host.docker.internal:PORT/v1`. Linux host-gateway routing is included by default. Another Compose service should be addressed by its service name.

### 3. Deploy with one command

Run the same command after saving `.env`:

```bash
./deploy.sh
```

This command validates `.env` placeholders and the rendered Compose model, builds both application images, waits for Postgres and Redis, applies `alembic upgrade head`, starts the API and worker, and waits for the Web health check. It always rebuilds the frontend, so the internal API proxy cannot retain an old `.env` target.

Open `http://localhost:3000` by default, or use the `DOCENT_WEB_PORT` configured in `.env`. Only the Web bind address is remotely exposed; the bundled Postgres and Redis ports default to `127.0.0.1`.

Useful operations:

```bash
docker compose ps
docker compose logs -f backend worker frontend
docker compose down
```

`docker compose down` preserves the named Postgres volume. Do not add `--volumes` unless you intend to delete all stored Docent data.

### Manual development

Use the following path for hot reloading and source development. It is not the recommended new-machine deployment path.

If you don't already have Postgres and Redis installed, start the loopback-bound development data services:

```bash
docker compose -f docker-compose-db.yml up -d
```

Then install the application:

```bash
uv sync --extra dev
uv run alembic upgrade head
```

Run the three application processes in separate terminals:

```bash
uv run docent_core server --port 8889 --reload
uv run docent_core worker --workers 1
uv run docent_core web --port 3001 --backend-url http://localhost:8889
```

The `--backend-url` value is private to the Next.js proxy; the browser uses `http://localhost:3001/rest/...` through the same Web origin.

### 4. Customize the Docent client

When creating `Docent` client objects, you'll need to specify custom server and frontend URLs:

```python
import os
from docent import Docent

docent_url = "http://localhost:3000"
client = Docent(
    server_url=docent_url,
    web_url=docent_url,
    api_key=os.getenv("DOCENT_API_KEY"),
)
```

You're all set! Check out our [quickstart](../quickstart.md) to get started.
