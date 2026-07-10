# Docent web application

This directory contains Docent's Next.js App Router frontend. It renders the collection, transcript, rubric, chart, Hodoscope, onboarding, and settings experiences and communicates directly with the Docent `/rest` API.

The frontend is not useful by itself: a compatible Docent backend must be running and reachable from both the browser and Next.js server-side code.

For the CLI path, first install the root Python environment with `uv sync --extra dev`. Direct frontend work requires Bun and the tracked `bun.lock`.

## Stack

- Next.js 16 and React 18
- TypeScript
- Redux Toolkit and RTK Query
- Tailwind CSS and Radix UI primitives
- Server-sent events for long-running jobs
- Typed English and Simplified Chinese message catalogs

## Start through the Docent CLI

From the repository root, the simplest development command is:

```bash
uv run docent_core web \
  --port 3001 \
  --backend-url http://localhost:8889
```

The CLI changes into this directory, installs dependencies with Bun, sets both backend URL variables, and starts the Next.js development server.

## Start directly with Bun

```bash
cd docent_core/_web
bun install --frozen-lockfile
NEXT_PUBLIC_API_HOST=http://localhost:8889 \
NEXT_PUBLIC_INTERNAL_API_HOST=http://localhost:8889 \
bun run dev -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_HOST` | Yes | Public backend origin used by browser API, RTK Query, and SSE requests. Do not append `/rest`. |
| `NEXT_PUBLIC_INTERNAL_API_HOST` | No | Backend origin used by server-side rendering and middleware. Defaults to the public origin. Use an internal service name in container deployments. |
| `NEXT_PUBLIC_POSTHOG_API_KEY` | No | Enables PostHog when configured. |
| `NEXT_PUBLIC_POSTHOG_API_HOST` | No | Overrides the PostHog host. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Enables browser-side Sentry reporting. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No | Labels the Sentry environment. |

The browser calls `${NEXT_PUBLIC_API_HOST}/rest` directly; there is no Next.js API rewrite that hides the backend. When the frontend and backend use different origins, configure the backend's `DOCENT_CORS_ORIGINS` and keep credentialed cookie requests in mind.

Both backend variables use the `NEXT_PUBLIC_` prefix. Treat them as public configuration and never place credentials or secret query parameters in either value. The public API host is embedded in production client assets at build time.

## Project layout

- `app/`: routes, layouts, Redux store, RTK Query APIs, contexts, services, and feature components.
- `components/`: shared application and UI components.
- `hooks/`: shared hooks.
- `lib/`: utilities, permissions, navigation, export helpers, and localization catalogs.
- `providers/`: cross-cutting React providers.
- `public/`: static assets.

Prefer RTK Query for new backend access and existing Redux slices for shared application state. Reuse components and semantic Tailwind colors already defined in the project.

## Localization

Supported locales are declared in `lib/i18n/locales.ts`. Message catalogs live in `lib/i18n/messages/`, and components read them through `useLocale()` from `app/contexts/LocaleContext.tsx`.

When adding visible text:

1. Add the English key to the relevant domain catalog.
2. Add the matching Simplified Chinese value.
3. Use `t('domain.key')` in the component.
4. Keep identifiers, schema keys, model names, tool names, and raw transcript content untranslated.

The catalog types make a missing Chinese key a TypeScript error.

## Validation

```bash
cd docent_core/_web
bun run lint
bunx tsc --noEmit
NEXT_PUBLIC_API_HOST=http://localhost:8889 \
NEXT_PUBLIC_INTERNAL_API_HOST=http://localhost:8889 \
bun run build
```

There is currently no frontend test script in `package.json`; lint, TypeScript, and the production build are the available repository checks.

## Container-build limitation

`Dockerfile.frontend` currently runs `npm ci`, but this repository tracks `bun.lock` and does not track `package-lock.json`. A clean frontend Docker build is therefore not reproducible until the Dockerfile and canonical lockfile are aligned. Local development and validation should use Bun.
