# Notes: Hodoscope / Docent Integration Exploration

## Scope
- Repository: `/data/lyuwt/docent-inner`
- Constraint: no application code changes
- Output: integration feasibility judgment and possible fusion paths

## Initial Repo State
- Branch: `main`
- Existing user/worktree changes were present before this exploration.
- Existing `task_plan.md` and `notes.md` were from a prior completed task and were left untouched.

## Sources To Check
- Hodoscope official site: `https://hodoscope.dev/`
- Hodoscope repository or documentation links, if discoverable from official pages.
- Local Docent code structure and docs in this checkout.

## Findings
- Hodoscope describes itself as unsupervised, human-in-the-loop trajectory analysis for AI agents. It summarizes agent actions, embeds them, projects them into a 2D map, and supports density-difference overlays across metadata groups.
- Hodoscope already supports Docent collections as an input source through `hodoscope analyze --docent-id COLLECTION_ID`.
- The current Hodoscope Docent adapter reads Docent via the Python SDK and DQL, exports transcripts, converts each transcript into a trajectory, and carries Docent identifiers and agent-run metadata into Hodoscope metadata.
- Hodoscope's primary artifact is standalone `.hodoscope.json`; visualization is generated as standalone Bokeh HTML.
- Hodoscope works at assistant action / turn level, while Docent's current core objects and rubric search are centered on `AgentRun` and `Transcript`.
- Docent already has collection dashboards, metadata filters, rubric search, clustering, per-run action summaries, and agent-run/transcript deep-link surfaces.
- Docent does not currently have a first-class collection-level action embedding/projection artifact, persistent action-summary table, or native 2D behavior map.
- The clean conceptual fit is: Hodoscope discovers unsupervised behavior patterns; Docent turns selected patterns into inspectable examples, rubrics, clusters, and durable analysis.
- Lowest-risk first step is a sidecar artifact workflow: export a Docent collection to Hodoscope, generate `.hodoscope.json` and HTML, inspect clusters, then manually map points back to Docent by `docent_agent_run_id` / transcript metadata.
- Deeper integration should be a worker-backed artifact/job first, not direct dependency coupling inside the request path.

## Risks / Limits
- Hodoscope defaults to external LLM and embedding models, so API keys, provider routing, cost, and privacy need explicit configuration.
- Hodoscope's Docent export is read-only and does not write summaries, embeddings, or projections back into Docent.
- Multi-transcript AgentRuns may not map one-to-one with Hodoscope trajectories because the adapter treats transcripts as trajectories.
- Hodoscope artifacts may include action text, tool feedback, and task context; redaction is needed before sharing outside the trusted environment.
- Bokeh HTML is standalone and CDN-oriented by default, so a self-hosted Docent integration needs an asset policy.
- Docent's current embedding route should not be treated as a ready Hodoscope substrate without verification because the REST endpoint currently returns before enqueueing an embedding job.

## Recommended Integration Modes
- P0 sidecar: use the existing Hodoscope CLI against a Docent collection, save `.hodoscope.json` plus representative samples, and use metadata to jump back into Docent.
- P1 artifact job: add a Docent backend/worker job that runs Hodoscope and stores a generated artifact linked from the collection dashboard.
- P1 rubric-seeding loop: use Hodoscope clusters and sampled actions to draft candidate Docent rubrics, then run Docent's existing rubric machinery for supervised measurement.
- P2 native behavior map: persist action summaries, embeddings, 2D coordinates, cluster/sample ranks, and build a Docent-native collection map with point-to-run deep links.
- P2 shared action-summary substrate: align Hodoscope action extraction with Docent's existing action-summary UI so summaries are not duplicated.

## Verification
- Read repo instructions, expression-skill, planning-with-files, and Docent skill guidance.
- Inspected `git status --short --branch` before and after exploration.
- Checked official Hodoscope homepage, announcement blog, GitHub repository, and paper.
- Cloned Hodoscope to `/tmp/hodoscope-codex-inspect` for read-only local inspection.
- Inspected Docent docs, SDK models, DB schemas, REST routes, backend service code, and collection/frontend surfaces.
- No application source code was changed.
