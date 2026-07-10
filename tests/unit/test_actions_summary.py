from datetime import datetime

import pytest

from docent.data_models.agent_run import AgentRun
from docent.data_models.chat import UserMessage
from docent.data_models.transcript import Transcript
from docent_core._llm_util.data_models.llm_output import LLMCompletion, LLMOutput
from docent_core.docent.ai_tools.assistant import summarizer
from docent_core.docent.server.rest import router


def _transcript(transcript_id: str, name: str, created_at: datetime) -> Transcript:
    return Transcript(
        id=transcript_id,
        name=name,
        created_at=created_at,
        messages=[UserMessage(content=f"message from {name}")],
    )


@pytest.mark.unit
def test_actions_summary_payload_uses_canonical_transcript_order():
    early = _transcript("early", "Early", datetime(2024, 1, 1))
    late = _transcript("late", "Late", datetime(2024, 1, 2))
    agent_run = AgentRun(id="run", transcripts=[late, early])

    ordered_transcripts = router._get_ordered_transcripts(agent_run)
    assert [(idx, transcript_id) for idx, transcript_id, _ in ordered_transcripts] == [
        (0, "early"),
        (1, "late"),
    ]

    summaries = [
        router._new_transcript_actions_summary(transcript_idx, transcript_id, transcript)
        for transcript_idx, transcript_id, transcript in ordered_transcripts
    ]
    summaries[0]["low_level"] = [
        {
            "action_unit_idx": 0,
            "title": "First transcript action",
            "summary": "Summary",
            "citations": [],
        }
    ]

    payload = router._get_actions_summary_payload("run", summaries, current_transcript_idx=0)

    assert payload["agent_run_id"] == "run"
    assert payload["total_transcripts"] == 2
    assert [summary["transcript_id"] for summary in payload["transcript_summaries"]] == [
        "early",
        "late",
    ]
    assert payload["low_level"] == summaries[0]["low_level"]
    assert payload["high_level"] == []
    assert payload["observations"] == []


@pytest.mark.unit
@pytest.mark.asyncio
async def test_transcript_summary_failure_marks_only_failed_transcript(monkeypatch):
    early = _transcript("early", "Early", datetime(2024, 1, 1))
    late = _transcript("late", "Late", datetime(2024, 1, 2))
    ordered_transcripts = [(0, early.id, early), (1, late.id, late)]
    summaries = [
        router._new_transcript_actions_summary(transcript_idx, transcript_id, transcript)
        for transcript_idx, transcript_id, transcript in ordered_transcripts
    ]
    current_indices: list[int | None] = []
    update_count = 0

    async def fake_summarize_transcript_actions(
        transcript_summary: router.TranscriptActionsSummary,
        transcript: Transcript,
        send_update,
    ):
        if transcript.id == "late":
            raise RuntimeError("boom")
        transcript_summary["low_level"] = [
            {
                "action_unit_idx": 0,
                "title": "Completed",
                "summary": "Completed summary",
                "citations": [],
            }
        ]
        transcript_summary["status"] = "complete"
        await send_update()

    def set_current_transcript_idx(transcript_idx: int | None):
        current_indices.append(transcript_idx)

    async def send_update():
        nonlocal update_count
        update_count += 1

    monkeypatch.setattr(
        router,
        "_summarize_transcript_actions",
        fake_summarize_transcript_actions,
    )

    await router._summarize_ordered_transcripts_actions(
        summaries,
        ordered_transcripts,
        set_current_transcript_idx,
        send_update,
    )

    assert current_indices == [0, 1, None]
    assert update_count >= 3
    assert summaries[0]["status"] == "complete"
    assert summaries[0]["low_level"][0]["title"] == "Completed"
    assert summaries[1]["status"] == "error"
    assert summaries[1]["error"] == "boom"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_summarizer_entrypoints_render_requested_transcript_idx(monkeypatch):
    transcript = _transcript("transcript", "Transcript", datetime(2024, 1, 1))
    prompts: list[str] = []

    async def fake_get_llm_completions_async(messages, *args, **kwargs):
        prompt = messages[0][0]["content"]
        prompts.append(prompt)

        if "For each action unit" in prompt:
            text = """
<index>0</index>
<title>
Low level
</title>
<summary>
Low-level summary [T1B0]
</summary>
            """.strip()
        elif "Group the provided action unit summaries" in prompt:
            text = """
<step>1</step>
<title>
High level
</title>
<summary>
High-level summary [T1B0]
</summary>
<action_units>
0
</action_units>
            """.strip()
        else:
            text = """
<observation>
<category>mistake</category>
<description>
Observation
</description>
<action_unit>0</action_unit>
</observation>
            """.strip()

        return [LLMOutput(model="test", completions=[LLMCompletion(text=text)])]

    monkeypatch.setattr(
        summarizer,
        "get_llm_completions_async",
        fake_get_llm_completions_async,
    )

    actions = await summarizer.summarize_agent_actions(transcript, transcript_idx=1)
    steps = await summarizer.group_actions_into_high_level_steps(
        actions,
        transcript,
        transcript_idx=1,
    )
    observations = await summarizer.interesting_agent_observations(
        transcript,
        transcript_idx=1,
    )

    assert len(prompts) == 3
    assert all("T1B0" in prompt for prompt in prompts)
    assert actions[0]["citations"][0].transcript_idx == 1
    assert steps[0]["citations"][0].transcript_idx == 1
    assert observations[0]["action_unit_idx"] == 0
