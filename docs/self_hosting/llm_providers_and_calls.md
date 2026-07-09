# LLM providers and calls

Docent uses a unified interface to call and aggregate results from different LLM providers.

### Provider registry

Each LLM provider is specified through a [`ProviderConfig`][docent_core._llm_util.providers.registry.ProviderConfig] object, which requires three functions:

- `async_client_getter`: Returns an async client for the provider
- `single_output_getter`: Gets a single completion from the provider, compatible with the [`AsyncSingleOutputGetter`][docent_core._llm_util.providers.registry.SingleOutputGetter] protocol
- `single_streaming_output_getter`: Gets a streaming completion from the provider, compatible with the [`AsyncSingleStreamingOutputGetter`][docent_core._llm_util.providers.registry.SingleStreamingOutputGetter] protocol

Docent defaults to `deepseek`. It also includes a `custom` provider for OpenAI-compatible chat-completions endpoints that can be configured with a base URL and API key.

#### Adding a new provider

1. Create a new module in `docent_core/_llm_util/providers/` (e.g., `my_provider.py`)
2. Implement the functions required by `ProviderConfig`
3. Add the provider to the [`PROVIDERS`][docent_core._llm_util.providers.registry.PROVIDERS] dictionary in `registry.py`

### Selecting models for Docent functions

Docent uses a preference system to determine which LLM models to use for different functions. [`ProviderPreferences`][docent_core._llm_util.providers.preferences.ProviderPreferences] manages the mapping between Docent functions and their ordered preference of [`ModelOption`][docent_core._llm_util.providers.preferences.ModelOption] objects.

For self-hosted deployments, prefer the environment-variable interface. It does not require code edits:

```bash
DOCENT_LLM_PROVIDER=deepseek
DOCENT_LLM_BASE_URL=https://api.deepseek.com
DOCENT_LLM_API_KEY=...
DOCENT_LLM_FLASH_MODEL=deepseek-v4-flash
DOCENT_LLM_PRO_MODEL=deepseek-v4-pro
```

To use a custom OpenAI-compatible endpoint:

```bash
DOCENT_LLM_PROVIDER=custom
DOCENT_LLM_BASE_URL=https://your-provider.example/v1
DOCENT_LLM_API_KEY=...
DOCENT_LLM_FLASH_MODEL=fast-model-name
DOCENT_LLM_PRO_MODEL=strong-model-name
```

Per-feature overrides let you route expensive or sensitive tasks to different models:

```bash
DOCENT_LLM_CHAT_MODEL=chat-model-name
DOCENT_LLM_JUDGE_MODEL=judge-model-name
DOCENT_LLM_SUMMARIZE_AGENT_ACTIONS_MODEL=fast-summary-model-name
DOCENT_LLM_OBSERVATIONS_MODEL=observation-model-name
DOCENT_LLM_SEARCH_MODEL=search-model-name
DOCENT_LLM_REFINE_MODEL=refinement-model-name
DOCENT_LLM_CLUSTER_MODEL=cluster-model-name
```

Leave a per-feature variable blank to inherit `DOCENT_LLM_FLASH_MODEL` or `DOCENT_LLM_PRO_MODEL`, depending on the task. See [environment variables](./environment_variables.md#llm-calls) for the full list.

For source-level customization, edit `ProviderPreferences` directly:

```python
@cached_property
def function_name(self) -> list[ModelOption]:
    """Get model options for the function_name function.

    Returns:
        List of configured model options for this function.
    """
    return [
        ModelOption(
            provider="custom",
            model_name="my-model",
            reasoning_effort="medium"
        ),
    ]
```

Any function that calls an LLM API must have a corresponding function in `ProviderPreferences` that returns its `ModelOption` preferences. `LLMManager` will try to use the first `ModelOption`, then fall back to following ones upon failure.

#### Usage

To customize which models are used for a specific function:

1. Locate `docent_core/_llm_util/providers/preferences.py`
2. Find or modify the cached property for the function you want to customize
3. Specify the [`ModelOption`][docent_core._llm_util.providers.preferences.ModelOption] objects in the returned list



::: docent_core._llm_util.providers.registry
::: docent_core._llm_util.providers.preferences
