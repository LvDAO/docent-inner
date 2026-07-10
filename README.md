# Docent

Docent helps teams inspect, search, evaluate, and understand large collections of AI-agent runs. It keeps full transcripts, tool calls, metadata, and scores together so you can move from a vague question about agent behavior to reviewable evidence and quantitative comparisons.

[Open hosted Docent](https://docent.transluce.org) · [Quickstart](https://docs.transluce.org/en/latest/quickstart/) · [Self-hosting](docs/self_hosting/self_host_docent.md) · [Get support](docs/support.md)

> Docent is in alpha. APIs, schemas, and deployment interfaces may change.

## What you can do

- Browse complete agent runs, multi-transcript traces, messages, reasoning, and tool calls.
- Filter and compare runs using metadata, scores, labels, and charts.
- Ask natural-language questions about transcripts and follow answers back to cited evidence.
- Turn a behavior hypothesis into a rubric, run it across a collection, and spot-check structured results.
- Cluster matching results to identify recurring behaviors, failures, and edge cases.
- Generate action summaries and explore behavior structure with Hodoscope maps.
- Share collections and analysis links with collaborators.

Typical uses include investigating repeated failures, auditing evaluation or reinforcement-learning rollouts, comparing models or agent scaffolds, and finding behaviors that aggregate scores hide.

## A typical Docent workflow

1. **Create a collection**: a set of runs from one experiment, evaluation suite, or deployment.
2. **Add agent runs**: complete executions containing one or more transcripts and their metadata.
3. **Describe the behavior** you want to find and refine it into a rubric: a decision rule Docent can apply consistently.
4. **Review the evidence** in matching transcripts, including explanations, citations, and human labels.
5. **Quantify or cluster results** to compare steps, models, scaffolds, or other metadata.

## Get started with hosted Docent

> Agent traces can contain prompts, model outputs, tool arguments, credentials, or user data. Review and redact runs before uploading them, and only send data permitted by your organization's policy.

1. [Create an account](https://docent.transluce.org).
2. Create a collection.
3. Add data using one of the methods below.
4. Open a run to inspect it, or create a rubric to search the collection.

### Add data from the web

In a collection, choose **Add Data → Upload Inspect Log**. The uploader accepts Inspect `.eval` files and Inspect-exported `.json` files and previews the runs before import.

### Trace an application automatically

Install the SDK, create an API key under **Settings → API Keys**, and expose it to your process:

```bash
pip install docent-python
export DOCENT_API_KEY="..."
```

Then initialize tracing before your instrumented model calls:

```python
from docent.trace import initialize_tracing

initialize_tracing("my-agent-runs")  # collection name
```

This creates or reuses the named collection and exports subsequent calls from supported OpenAI and Anthropic instrumentation. See [Tracing](docs/tracing/introduction.md) for explicit agent-run contexts, metadata, scores, flushing, and the current instrumentation boundary.

### Upload runs with Python

```python
import os

from docent import Docent
from docent.data_models import AgentRun, Transcript
from docent.data_models.chat import AssistantMessage, UserMessage

client = Docent(api_key=os.environ["DOCENT_API_KEY"])
collection_id = client.create_collection(name="My agent runs")

agent_run = AgentRun(
    transcripts=[
        Transcript(
            messages=[
                UserMessage(content="What is 1 + 1?"),
                AssistantMessage(content="2"),
            ]
        )
    ],
    metadata={"model": "example-model"},
)

client.add_agent_runs(collection_id, [agent_run])
```

Continue with the [ingestion quickstart](docs/quickstart.md) or the [Python SDK guide](docent/README.md) to construct and upload `AgentRun` objects.

## Language support

Docent supports English and Simplified Chinese (`zh-CN`). Choose **Settings → Language** to localize the interface and request the selected language for newly generated chats, rubric explanations, summaries, clusters, and Hodoscope text.

Language changes do not rewrite uploaded transcripts, metadata, quoted source material, or existing analysis results. See [Language settings](docs/user_settings/language.md) for the exact boundary.

## Run Docent locally from source

This is the supported development and evaluation path in the current checkout; it is not a production deployment recipe. It runs Postgres and Redis in containers and runs the API, worker, and web application from the repository.

> **Container limitation:** the full-stack Compose definition is present, but a clean frontend image build is not currently reproducible because `Dockerfile.frontend` runs `npm ci` while this repository tracks `bun.lock` rather than `package-lock.json`. Use the source-based web command below until the container build is aligned with the tracked lockfile.

### Prerequisites

- Python 3.11 or newer
- [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/)
- Docker Engine with Docker Compose
- An LLM endpoint and an embedding endpoint supported by your configuration

### Configure and initialize

```bash
cp .env.template .env
uv sync --extra dev
docker compose -f docker-compose-db.yml up -d
uv run alembic upgrade head
```

Before starting Docent, replace placeholder credentials in `.env`. The default LLM route is DeepSeek; `DOCENT_LLM_PROVIDER=custom` selects a generic OpenAI-compatible chat-completions endpoint. Embeddings have their own endpoint, key, model, and dimensionality settings.

LLM-backed analysis sends relevant trace text to the configured LLM endpoint, and embedding jobs send text to the configured embedding endpoint. Select endpoints that meet your privacy, residency, and cost requirements.

See [Environment variables](docs/self_hosting/environment_variables.md) and [LLM providers and calls](docs/self_hosting/llm_providers_and_calls.md) before using a custom provider or per-feature model overrides.

### Start the services

Run each command in a separate terminal:

```bash
uv run docent_core server --port 8889 --reload
```

```bash
uv run docent_core worker --workers 1
```

```bash
uv run docent_core web --port 3001 --backend-url http://localhost:8889
```

Open [http://localhost:3001](http://localhost:3001). In another terminal, verify the API with:

```bash
curl http://localhost:8889/
```

The API check should return `"clarity has been achieved"`. Stop the three foreground processes with `Ctrl+C`, then stop the data services without deleting their volume using:

```bash
docker compose -f docker-compose-db.yml down
```

## User documentation

- [Ingest agent runs](docs/quickstart.md)
- [Trace model calls and agent runs](docs/tracing/introduction.md)
- [Search and cluster behaviors](docs/tutorials/search_and_clustering.md)
- [Understand Docent data models](docs/concepts/data_models/agent_run.md)
- [Configure a self-hosted deployment](docs/self_hosting/environment_variables.md)
- [Select a language](docs/user_settings/language.md)

## Developing Docent

Repository-specific guidance is kept close to each surface:

- [Python SDK](docent/README.md)
- [Web application](docent_core/_web/README.md)
- [Test suite](tests/README.md)
- [MkDocs site](docs/index.md)

The core application consists of a FastAPI server, a Redis-backed worker, a Next.js frontend, PostgreSQL with pgvector, and the editable `docent-python` SDK.

## License

Docent is licensed under the [Apache License 2.0](LICENSE).
