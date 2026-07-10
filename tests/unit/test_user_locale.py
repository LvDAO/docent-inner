import pytest
from pydantic import ValidationError

from docent_core.docent.ai_tools.rubric.rubric import JudgeResult, ResultType
from docent_core.docent.db.schemas.auth_models import User
from docent_core.docent.db.schemas.rubric import SQLAJudgeResult, SQLARubricCentroid
from docent_core.docent.db.schemas.tables import SQLAUser


@pytest.mark.unit
def test_user_preferred_locale_defaults_to_english():
    user = User(id="user-1", email="user@example.com", organization_ids=[])

    assert user.preferred_locale == "en"


@pytest.mark.unit
def test_user_rejects_unsupported_preferred_locale():
    with pytest.raises(ValidationError):
        User(
            id="user-1",
            email="user@example.com",
            organization_ids=[],
            preferred_locale="fr",  # type: ignore[arg-type]
        )


@pytest.mark.unit
def test_sqla_user_conversion_preserves_preferred_locale():
    sqla_user = SQLAUser(
        id="user-1",
        email="user@example.com",
        password_hash="unused",
        is_anonymous=False,
        preferred_locale="zh-CN",
    )

    assert sqla_user.to_user().preferred_locale == "zh-CN"


@pytest.mark.unit
def test_generated_rubric_artifacts_record_response_locale():
    judge_result = JudgeResult(
        id="result-1",
        agent_run_id="run-1",
        rubric_id="rubric-1",
        rubric_version=1,
        output={"explanation": "中文解释", "label": "match"},
        result_type=ResultType.DIRECT_RESULT,
    )

    sq_judge_result = SQLAJudgeResult.from_pydantic(
        judge_result,
        locale="zh-CN",
    )
    sq_centroid = SQLARubricCentroid(
        id="centroid-1",
        collection_id="collection-1",
        rubric_id="rubric-1",
        rubric_version=1,
        locale="zh-CN",
        centroid="工具调用失败",
        result_type=ResultType.DIRECT_RESULT,
    )

    assert sq_judge_result.locale == "zh-CN"
    assert sq_centroid.locale == "zh-CN"
