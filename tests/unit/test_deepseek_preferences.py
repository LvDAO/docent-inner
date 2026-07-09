import pytest

from docent_core._llm_util.providers.custom import get_custom_client_async
from docent_core._llm_util.providers.deepseek import DEEPSEEK_BASE_URL, get_deepseek_client_async
from docent_core._llm_util.providers.preferences import (
    CUSTOM_PROVIDER,
    DEEPSEEK_FLASH_MODEL,
    DEEPSEEK_PRO_MODEL,
    DEEPSEEK_PROVIDER,
    ModelOption,
    ModelOptionWithContext,
    ProviderPreferences,
    get_configured_llm_provider,
    get_supported_model_api_key_providers,
    merge_models_with_byok,
)
from docent_core._llm_util.providers.registry import PROVIDERS

LLM_ENV_VARS = [
    "DOCENT_LLM_PROVIDER",
    "DOCENT_LLM_BASE_URL",
    "DOCENT_LLM_API_KEY",
    "DOCENT_LLM_FLASH_MODEL",
    "DOCENT_LLM_PRO_MODEL",
    "DOCENT_LLM_CONTEXT_WINDOW",
    "DOCENT_LLM_CHAT_MODEL",
    "DOCENT_LLM_JUDGE_MODEL",
    "DOCENT_LLM_JUDGE_FALLBACK_MODEL",
    "DOCENT_LLM_SUMMARIZE_AGENT_ACTIONS_MODEL",
    "DOCENT_LLM_OBSERVATIONS_MODEL",
]


def clear_llm_env(monkeypatch: pytest.MonkeyPatch):
    for env_var in LLM_ENV_VARS:
        monkeypatch.delenv(env_var, raising=False)


@pytest.mark.unit
def test_deepseek_and_custom_providers_are_registered(monkeypatch: pytest.MonkeyPatch):
    clear_llm_env(monkeypatch)
    assert "deepseek" in PROVIDERS
    assert "custom" in PROVIDERS
    assert DEEPSEEK_BASE_URL == "https://api.deepseek.com"


@pytest.mark.unit
def test_provider_preferences_default_to_deepseek_only(monkeypatch: pytest.MonkeyPatch):
    clear_llm_env(monkeypatch)
    preferences = ProviderPreferences()
    preference_lists = [
        preferences.default_chat_models,
        preferences.byok_chat_models,
        preferences.generate_new_queries,
        preferences.summarize_intended_solution,
        preferences.summarize_agent_actions,
        preferences.group_actions_into_high_level_steps,
        preferences.interesting_agent_observations,
        preferences.propose_clusters,
        preferences.refine_agent,
        preferences.execute_search,
        preferences.cluster_assign_o3_mini,
        preferences.cluster_assign_o4_mini,
        preferences.cluster_assign_sonnet_4_thinking,
        preferences.cluster_assign_gemini_flash,
        preferences.handle_refinement_message,
        preferences.default_judge_models,
        preferences.byok_judge_models,
    ]

    all_models = [model for models in preference_lists for model in models]
    assert {model.provider for model in all_models} == {DEEPSEEK_PROVIDER}
    assert {model.model_name for model in all_models} == {
        DEEPSEEK_FLASH_MODEL,
        DEEPSEEK_PRO_MODEL,
    }


@pytest.mark.unit
def test_deepseek_flash_pro_strength_mapping(monkeypatch: pytest.MonkeyPatch):
    clear_llm_env(monkeypatch)
    preferences = ProviderPreferences()
    assert preferences.summarize_agent_actions[0].model_name == DEEPSEEK_FLASH_MODEL
    assert (
        preferences.group_actions_into_high_level_steps[0].model_name
        == DEEPSEEK_FLASH_MODEL
    )
    assert preferences.default_chat_models[0].model_name == DEEPSEEK_PRO_MODEL
    assert preferences.default_judge_models[0].model_name == DEEPSEEK_PRO_MODEL
    assert preferences.execute_search[0].model_name == DEEPSEEK_PRO_MODEL


@pytest.mark.unit
def test_merge_models_with_byok_deduplicates_deepseek_models(monkeypatch: pytest.MonkeyPatch):
    clear_llm_env(monkeypatch)
    preferences = ProviderPreferences()
    models = merge_models_with_byok(
        defaults=preferences.default_judge_models,
        byok=preferences.byok_judge_models,
        api_keys={"deepseek": "test-key"},
    )

    model_keys = [
        (model.provider, model.model_name, model.reasoning_effort) for model in models
    ]
    assert len(model_keys) == len(set(model_keys))
    assert {model.provider for model in models} == {"deepseek"}
    assert all(model.uses_byok for model in models)


@pytest.mark.unit
def test_provider_and_model_env_overrides(monkeypatch: pytest.MonkeyPatch):
    clear_llm_env(monkeypatch)
    monkeypatch.setenv("DOCENT_LLM_PROVIDER", CUSTOM_PROVIDER)
    monkeypatch.setenv("DOCENT_LLM_FLASH_MODEL", "fast-model")
    monkeypatch.setenv("DOCENT_LLM_PRO_MODEL", "strong-model")
    monkeypatch.setenv("DOCENT_LLM_CHAT_MODEL", "chat-model")
    monkeypatch.setenv("DOCENT_LLM_JUDGE_MODEL", "judge-model")
    monkeypatch.setenv("DOCENT_LLM_SUMMARIZE_AGENT_ACTIONS_MODEL", "summary-model")
    monkeypatch.setenv("DOCENT_LLM_OBSERVATIONS_MODEL", "observations-model")

    preferences = ProviderPreferences()

    assert get_configured_llm_provider() == CUSTOM_PROVIDER
    assert preferences.group_actions_into_high_level_steps[0].provider == CUSTOM_PROVIDER
    assert preferences.group_actions_into_high_level_steps[0].model_name == "fast-model"
    assert preferences.default_chat_models[0].model_name == "chat-model"
    assert preferences.default_judge_models[0].model_name == "judge-model"
    assert preferences.summarize_agent_actions[0].model_name == "summary-model"
    assert preferences.interesting_agent_observations[0].model_name == "observations-model"


@pytest.mark.unit
def test_custom_clients_use_configured_base_url_and_key(monkeypatch: pytest.MonkeyPatch):
    clear_llm_env(monkeypatch)
    monkeypatch.setenv("DOCENT_LLM_BASE_URL", "https://llm.example.test/v1")
    monkeypatch.setenv("DOCENT_LLM_API_KEY", "test-key")

    custom_client = get_custom_client_async()
    deepseek_client = get_deepseek_client_async()

    assert str(custom_client.base_url).rstrip("/") == "https://llm.example.test/v1"
    assert str(deepseek_client.base_url).rstrip("/") == "https://llm.example.test/v1"
    assert custom_client.api_key == "test-key"
    assert deepseek_client.api_key == "test-key"


@pytest.mark.unit
def test_supported_model_api_key_providers_include_configured_provider(
    monkeypatch: pytest.MonkeyPatch,
):
    clear_llm_env(monkeypatch)
    monkeypatch.setenv("DOCENT_LLM_PROVIDER", CUSTOM_PROVIDER)

    assert get_supported_model_api_key_providers() == [CUSTOM_PROVIDER, DEEPSEEK_PROVIDER]


@pytest.mark.unit
def test_unknown_model_context_window_uses_env_default(monkeypatch: pytest.MonkeyPatch):
    clear_llm_env(monkeypatch)
    monkeypatch.setenv("DOCENT_LLM_CONTEXT_WINDOW", "123456")

    model = ModelOption(provider=CUSTOM_PROVIDER, model_name="unknown-model")
    with_context = ModelOptionWithContext.from_model_option(model)

    assert with_context.context_window == 123456
