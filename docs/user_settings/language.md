# Language settings

Docent supports English and Simplified Chinese (`zh-CN`). English remains the default for existing accounts.

Open **Settings → Language** to change your preference. The selection is saved to your Docent user account, so registered users keep it after signing in again or using another browser.

The selected language controls:

- localized navigation, settings, authentication, collection, analysis, and chat controls;
- new chat and rubric-refinement replies;
- newly generated action summaries, observations, rubric explanations, cluster descriptions, and Hodoscope action summaries.

Docent asks the model to use the selected language for user-facing prose while preserving machine-readable structures such as JSON keys, XML tags, enum values, citations, tool names, code, and identifiers.

Existing saved analysis results are not translated automatically. Regenerate an analysis after changing languages when you need a new localized artifact. Each background generation job records the locale used to create it; rubric results and cluster descriptions are stored and reused separately for English and Simplified Chinese.

Changing the language does not modify uploaded transcripts, user-entered rubric text, metadata, or quoted source material.
