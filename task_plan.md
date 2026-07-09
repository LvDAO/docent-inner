# Task Plan: Multi-Transcript Actions Summary

## Goal
Implement one-click actions summary analysis across every transcript in an AgentRun, then switch Docent's LLM routing to DeepSeek-only flash/pro models.

## Phases
- [x] Phase 1: Load project instructions and inspect current summary flow
- [x] Phase 2: Implement backend multi-transcript summary streaming
- [x] Phase 3: Update frontend types, store, and summary UI
- [x] Phase 4: Add focused tests
- [x] Phase 5: Switch LLM provider preferences to DeepSeek-only
- [x] Phase 6: Run verification and report exact state

## Key Decisions
- Keep `/actions_summary` and SSE transport unchanged.
- Process transcripts sequentially in v1 to avoid unbounded LLM fanout.
- Add `transcript_summaries` and keep legacy `low_level`, `high_level`, and `observations` as the first transcript's result.
- Pass the real `transcript_idx` into summarizer transcript rendering so citations navigate to the correct transcript.
- Render per-transcript results in `AgentSummary`; leave `AgentRunViewer` navigation logic unchanged.
- DeepSeek provider uses the official OpenAI-compatible base URL `https://api.deepseek.com`.
- Model strength mapping: low-cost/fast summary and mini/flash assignment paths use `deepseek-v4-flash`; stronger chat, judge, search, refinement, and synthesis paths use `deepseek-v4-pro`.

## Errors Encountered
- `uv run pytest tests/unit/test_actions_summary.py -q` failed before collection because pytest was not installed in the default environment; retry with `uv run --extra dev pytest ...`.
- `uv run --extra dev pytest ...` initially failed before collection because `.env` did not exist; created ignored local `.env` from template with blank `DEEPSEEK_API_KEY`.
- `bun run lint` initially could not run because `bun` was not installed and `node_modules` was absent.
- `uv.lock` was rewritten by `uv run --extra dev` to a local mirror registry; restored it to HEAD because it was unrelated.
- `bun install --frozen-lockfile` failed because `bun.lock` was stale relative to `package.json`; `bun install` refreshed the lockfile.
- `next lint` is no longer a valid command in the installed Next.js CLI; changed the `lint` script to direct ESLint CLI.
- `next build` required Next 16 dynamic route typing updates and `NEXT_PUBLIC_API_HOST` during local build.

## Status
**Complete** - backend, frontend, DeepSeek provider routing, focused tests, and frontend lint/build verification are implemented.

---

# Task Plan: LLM Provider Docker Configuration

## Goal
Add a self-hosting configuration interface that lets users choose the default LLM provider and models without editing Python code.

## Phases
- [x] Phase 1: Inspect current provider preferences, Docker env flow, and self-hosting docs
- [x] Phase 2: Add env-driven provider/model selection with DeepSeek defaults
- [x] Phase 3: Wire Docker Compose and docs to the new configuration
- [x] Phase 4: Add/update tests and run focused verification

## Decisions Made
- Keep `deepseek` as the default provider.
- Add `DOCENT_LLM_PROVIDER` as the simple provider selector.
- Add optional `DOCENT_LLM_FLASH_MODEL` and `DOCENT_LLM_PRO_MODEL` for switching to any registered provider without code edits.
- Do not restore old OpenAI/Anthropic/Google default fallback lists; non-DeepSeek providers must be explicit.
- Add `DOCENT_LLM_BASE_URL` and `DOCENT_LLM_API_KEY` so self-host users can point Docent at DeepSeek or any custom OpenAI-compatible endpoint.
- Add per-feature model env vars for chat, judge, summaries, observations, search, refinement, and clustering.

## Errors Encountered
- Pyright did not narrow env-derived reasoning effort strings to Literal types; fixed with an explicit cast after validation.
- `uv run --extra dev` rewrote `uv.lock` registry URLs to a local mirror again; restored `uv.lock` to HEAD because the lockfile change was unrelated.

## Status
**Complete** - self-host LLM provider/base-url/key/per-feature model configuration is implemented, documented, and verified.
