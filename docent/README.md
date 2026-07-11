# Docent Python SDK

`docent-python` is the typed Python SDK for sending AI-agent execution traces to Docent. It provides the `AgentRun`, `Transcript`, and chat-message models, a synchronous API client, automatic tracing helpers, Inspect log ingestion, and a buffered background writer.

> The SDK is in alpha. Public APIs and data models may change between releases.

## Requirements and installation

- Python 3.11 or newer
- A Docent API key
- A reachable hosted or self-hosted Docent API

```bash
pip install docent-python
```

Create a key from **Settings → API Keys**, then set it in the process that sends runs:

```bash
export DOCENT_API_KEY="..."
```

The SDK reads `DOCENT_API_KEY` from the process environment; it does not load a `.env` file by itself.

By default, `Docent` connects to `https://api.docent.transluce.org` and uses `https://docent.transluce.org` when it prints collection links.

## Upload one agent run

```python
import os

from docent import Docent
from docent.data_models import AgentRun, Transcript
from docent.data_models.chat import AssistantMessage, UserMessage

client = Docent(api_key=os.environ["DOCENT_API_KEY"])

collection_id = client.create_collection(
    name="SDK quickstart",
    description="A minimal Docent Python SDK example",
)

agent_run = AgentRun(
    transcripts=[
        Transcript(
            messages=[
                UserMessage(content="What is 1 + 1?"),
                AssistantMessage(content="2"),
            ]
        )
    ],
    metadata={"model": "example-model", "scores": {"correct": 1.0}},
)

client.add_agent_runs(collection_id, [agent_run])
```

`AgentRun` requires at least one `Transcript`. Metadata must be JSON-serializable. After uploading a batch, `add_agent_runs()` also asks Docent to compute transcript embeddings.

For a self-hosted deployment, pass service origins without a trailing `/rest` path:

```python
client = Docent(
    server_url="http://localhost:3001",
    web_url="http://localhost:3001",
    api_key=os.environ["DOCENT_API_KEY"],
)
```

The client validates the API key during construction, so the server must already be reachable. `server_url` controls API requests; `web_url` is used to print links back to the matching UI.

## Ingest Inspect logs

The client can recursively find and upload Inspect `.eval` files:

```python
client.recursively_ingest_inspect_logs(
    collection_id,
    "./path/to/inspect-logs",
)
```

For custom conversion logic, use `docent.loaders.load_inspect` and the typed data models directly.

## Buffer uploads in the background

`docent.init()` creates or reuses a collection and starts an `AgentRunWriter` thread:

```python
import os

import docent
from docent.data_models import AgentRun, Transcript
from docent.data_models.chat import AssistantMessage, UserMessage

agent_run = AgentRun(
    transcripts=[
        Transcript(
            messages=[
                UserMessage(content="What is 2 + 2?"),
                AssistantMessage(content="4"),
            ]
        )
    ]
)

writer = docent.init(
    collection_name="Background uploads",
    # For self-hosted Docent:
    # server_url="http://localhost:3001",
    # web_url="http://localhost:3001",
    # api_key=os.environ["DOCENT_API_KEY"],
)

try:
    writer.log_agent_runs([agent_run])
finally:
    writer.finish()
```

Tune queue size, batch size, concurrency, retry count, and shutdown timeout through the arguments accepted by `docent.init()`.

## Trace model calls

The tracing API instruments supported model clients and organizes spans into Docent agent runs:

```python
from docent.trace import initialize_tracing

initialize_tracing("my-application")
```

Supported automatic instrumentation currently includes OpenAI and Anthropic clients when their packages are installed. Use `agent_run_context`, `transcript_context`, metadata helpers, score helpers, and `flush_tracing()` from `docent.trace` when you need explicit boundaries or shutdown control. See the [tracing guide](../docs/tracing/introduction.md) for complete examples.

For self-hosted ingestion, configure the embedding endpoint before calling `add_agent_runs()`; see the root [environment-variable guide](../docs/self_hosting/environment_variables.md).

## Public surfaces

- `docent.Docent`: collection, upload, sharing, rubric-state, and clustering-state API client.
- `docent.init`: buffered background uploads.
- `docent.data_models`: `AgentRun`, `Transcript`, `TranscriptGroup`, and citation models.
- `docent.data_models.chat`: typed messages, content blocks, and tool calls.
- `docent.trace`: tracing initialization, contexts, metadata, and score helpers.
- `docent.loaders.load_inspect`: Inspect conversion helpers.
- `docent.samples`: paths to the packaged Inspect and tau-bench samples.

## Develop the SDK in this repository

The root project installs this directory as an editable dependency. From the repository root:

```bash
uv sync --extra dev
uv run pytest tests/unit/test_data_models -q
```

The core app's integration and frontend checks are documented in [tests/README.md](../tests/README.md) and [docent_core/_web/README.md](../docent_core/_web/README.md).

## More documentation

- [Full ingestion quickstart](../docs/quickstart.md)
- [AgentRun](../docs/concepts/data_models/agent_run.md)
- [Transcript](../docs/concepts/data_models/transcript.md)
- [Chat messages](../docs/concepts/data_models/chat_messages.md)

The SDK is licensed under the [Apache License 2.0](LICENSE.md).
