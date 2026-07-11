# Self-host Docent

For most users, we recommend starting with the [public version](../quickstart.md) of Docent. We also provide white-glove hosting support for larger organizations; please [reach out](mailto:kevin@transluce.org?subject=Inquiry%20about%20Docent%20hosting) if you're interested.

### 1. Clone the repo and configure `.env`

```bash
git clone https://github.com/TransluceAI/docent.git
cd docent
cp .env.template .env
```

You should now have a `.env` file at the project root. See [here for details on how to fill it in](./environment_variables.md).

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

### 2. Start the backend server and frontend UI

Docker Compose is the easiest way to get started, but you may want a manual installation to support faster development loops (e.g., for hot reloading).

=== "Docker Compose (recommended)"

    First ensure [Docker Engine](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed. Then run:

    === "As non-root"
        ```bash
        DOCENT_SERVER_PORT=8889 DOCENT_WEB_PORT=3001 docker compose up --build
        ```

    === "As root"
        ```bash
        sudo env DOCENT_SERVER_PORT=8889 DOCENT_WEB_PORT=3001 docker compose up --build
        ```

    `DOCENT_SERVER_PORT` is internal to the Compose network. `DOCENT_WEB_PORT` is the single application port published on the host.

    Cold build + start should take a few minutes. Once finished, you can run

    === "As non-root"
        ```bash
        docker ps
        ```

    === "As root"
        ```bash
        sudo docker ps
        ```

    to check that the five services are running. The application port layout should look like this:
    ```bash
    NAME               PORTS
    docent_backend     8889/tcp
    docent_frontend    0.0.0.0:3001->3000/tcp, [::]:3001->3000/tcp
    docent_postgres    0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
    docent_redis       0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp
    docent_worker
    ```

    Open `http://localhost:3001`. For a remote host or SSH tunnel, expose or forward only `DOCENT_WEB_PORT`; browser API, uploads, authentication, and streaming requests use the same port under `/rest`.

    To shut Docent down, either press `Ctrl+C` in the terminal or run:

    === "As non-root"
        ```bash
        docker compose down
        ```

    === "As root"
        ```bash
        sudo docker compose down
        ```

    !!! note
        If you make changes to the codebase, you'll need to stop the containers, then rebuild by **keeping the `--build` argument**. If `--build` is omitted, your changes will not be reflected.

=== "Manual"

    If you don't already have Postgres and Redis installed, you can start them with Docker:

    === "As non-root"
        ```bash
        docker compose -f docker-compose-db.yml up --build
        ```

    === "As root"
        ```bash
        sudo docker compose -f docker-compose-db.yml up --build
        ```

    after which Postgres and Redis will be available at the addresses set in [`.env`](./environment_variables.md). To set up your own databases, visit the official docs for [Postgres](https://www.postgresql.org/download/) and [Redis](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/).

    Then run:

    === "uv"
        ```bash
        uv sync --extra dev
        ```

    === "pip"
        ```bash
        pip install -e .[dev]
        ```

    to install the core library, and

    ```bash
    pre-commit install
    ```

    to set up pre-commit hooks for development.

    Before running the application, you need to set up your database with Alembic migrations. First create a PostgreSQL database that matches the name in your `.env` file. Then run

    ```bash
    alembic upgrade head
    ```

    to create all database tables. Now run

    === "Prod"
        ```bash
        docent_core server --port 8889 --workers 4
        ```

    === "Dev (with autoreload)"
        ```bash
        docent_core server --port 8889 --reload
        ```

    to start the API server,

    === "Prod"
        ```bash
        docent_core worker --workers 4
        ```

    to start the worker, which handles background work, and

    === "Prod"
        ```bash
        docent_core web --build --port 3001 --backend-url http://localhost:8889
        ```

    === "Dev (with autoreload)"
        ```bash
        docent_core web --port 3001 --backend-url http://localhost:8889
        ```

    to start the frontend. The `--backend-url` value is the private proxy target; the browser still uses `http://localhost:3001/rest/...`. You may need to [install Bun](https://bun.com/docs/installation) first.

Finally, try accessing the Docent UI at `http://localhost:3001`.

### 3. Customize the Docent client

When creating `Docent` client objects, you'll need to specify custom server and frontend URLs:

```python
import os
from docent import Docent

docent_url = "http://localhost:3001"
client = Docent(
    server_url=docent_url,
    web_url=docent_url,
    api_key=os.getenv("DOCENT_API_KEY"),
)
```

You're all set! Check out our [quickstart](../quickstart.md) to get started.
