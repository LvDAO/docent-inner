import pytest
from httpx import AsyncClient


@pytest.mark.integration
async def test_signup_persists_requested_preferred_locale(client: AsyncClient):
    response = await client.post(
        "/rest/signup",
        json={
            "email": "localized-user@example.com",
            "password": "test_password_123",
            "preferred_locale": "zh-CN",
        },
    )

    assert response.status_code == 200
    assert response.json()["user"]["preferred_locale"] == "zh-CN"


@pytest.mark.integration
async def test_update_user_preferred_locale_persists(authed_client: AsyncClient):
    initial_response = await authed_client.get("/rest/me")
    assert initial_response.status_code == 200
    assert initial_response.json()["preferred_locale"] == "en"

    update_response = await authed_client.patch(
        "/rest/me/preferences",
        json={"preferred_locale": "zh-CN"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["preferred_locale"] == "zh-CN"

    persisted_response = await authed_client.get("/rest/me")
    assert persisted_response.status_code == 200
    assert persisted_response.json()["preferred_locale"] == "zh-CN"


@pytest.mark.integration
async def test_update_user_preferred_locale_rejects_unsupported_locale(
    authed_client: AsyncClient,
):
    response = await authed_client.patch(
        "/rest/me/preferences",
        json={"preferred_locale": "fr"},
    )

    assert response.status_code == 422
