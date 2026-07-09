---
title: Environment variables
---

## LLM calls

Docent defaults to DeepSeek. Self-hosted deployments can change the default endpoint and model routing through `.env` without editing Python code.

* `DOCENT_LLM_PROVIDER`: LLM provider to use for Docent analysis calls.
    * Default: `deepseek`
    * Use `deepseek` for DeepSeek-compatible calls with DeepSeek reasoning/thinking parameters.
    * Use `custom` for a generic OpenAI-compatible chat-completions endpoint.
* `DOCENT_LLM_BASE_URL`: Base URL for the configured provider.
    * Default: `https://api.deepseek.com`
    * Example custom value: `https://your-provider.example/v1`
* `DOCENT_LLM_API_KEY`: API key for the configured provider.
    * Takes precedence over `DEEPSEEK_API_KEY`.
* `DEEPSEEK_API_KEY`: Backward-compatible DeepSeek key alias.
* `DOCENT_LLM_FLASH_MODEL`: Default fast/cheap model.
    * Default: `deepseek-v4-flash`
* `DOCENT_LLM_PRO_MODEL`: Default stronger model.
    * Default: `deepseek-v4-pro`
* `DOCENT_LLM_CONTEXT_WINDOW`: Context window shown to the UI for models not recognized by Docent.
    * Default: `1000000`
* `LLM_CACHE_PATH`: Path to the LLM cache

Optional per-feature model overrides:

* `DOCENT_LLM_CHAT_MODEL`: Transcript chat model.
* `DOCENT_LLM_JUDGE_MODEL`: Primary rubric judge model.
* `DOCENT_LLM_JUDGE_FALLBACK_MODEL`: Secondary rubric judge model.
* `DOCENT_LLM_SUMMARIZE_AGENT_ACTIONS_MODEL`: Low-level action summary model.
* `DOCENT_LLM_GROUP_ACTIONS_MODEL`: High-level action grouping model.
* `DOCENT_LLM_OBSERVATIONS_MODEL`: Interesting observations model.
* `DOCENT_LLM_SEARCH_MODEL`: Search/query execution model.
* `DOCENT_LLM_REFINE_MODEL`: Agent refinement model.
* `DOCENT_LLM_REFINEMENT_MESSAGE_MODEL`: Interactive refinement chat model.
* `DOCENT_LLM_CLUSTER_MODEL`: Cluster proposal/synthesis model.
* `DOCENT_LLM_CLUSTER_ASSIGN_MODEL`: Fast cluster assignment model.
* `DOCENT_LLM_CLUSTER_ASSIGN_STRONG_MODEL`: Strong cluster assignment model.
* `DOCENT_LLM_GENERATE_QUERIES_MODEL`: Query generation model.
* `DOCENT_LLM_SUMMARIZE_INTENDED_SOLUTION_MODEL`: Intended-solution summary model.

Each model variable can also set reasoning effort with a matching `_REASONING_EFFORT` variable. For example:

```bash
DOCENT_LLM_JUDGE_MODEL=my-strong-model
DOCENT_LLM_JUDGE_MODEL_REASONING_EFFORT=high
```

<Note>
For Docker Compose, edit the project root `.env` file. The backend and worker services read it through `env_file: .env`.
</Note>

## Postgres

We have provided reasonable defaults in `.env.template`, but you're welcome to customize these as needed.

* `DOCENT_PG_USER`: Postgres username
* `DOCENT_PG_PASSWORD`: Postgres password
* `DOCENT_PG_HOST`: Postgres host
* `DOCENT_PG_PORT`: Postgres port
* `DOCENT_PG_DATABASE`: Postgres database (not `postgres`)

## Redis

We have provided reasonable defaults in `.env.template`, but you're welcome to customize these as needed.

* `DOCENT_REDIS_HOST`: Redis host
* `DOCENT_REDIS_PORT`: Redis port
* `DOCENT_REDIS_USER`: Redis username (optional)
* `DOCENT_REDIS_PASSWORD`: Redis password (optional)

## CORS

* `DOCENT_CORS_ORIGINS`: CSV list of allowed frontend origins (optional)
    * Leave empty/unset for development (defaults to `localhost:*`)
    * Example for multiple domains: `DOCENT_CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com`

## Optional variables for deployed environments

* `DEPLOYMENT_ID`: ID of the deployment (unset for local)
* `SENTRY_DSN`: Sentry DSN
* `POSTHOG_API_KEY`: PostHog API key
* `POSTHOG_API_HOST`: PostHog API host (defaults to `https://us.i.posthog.com`)
