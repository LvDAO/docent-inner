# Docent web application

This directory contains Docent's Next.js App Router frontend. It renders the collection, transcript, rubric, chart, Hodoscope, onboarding, and settings experiences and proxies same-origin `/rest` requests to the Docent backend.

The frontend is not useful by itself: a compatible Docent backend must be running and reachable from the Next.js process. The browser only needs the Web origin.

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

The CLI changes into this directory, installs dependencies with Bun, sets the private proxy target, and starts the Next.js development server. Browser REST, upload, authentication, and SSE requests stay on `http://localhost:3001/rest/...`.

## Start directly with Bun

```bash
cd docent_core/_web
bun install --frozen-lockfile
DOCENT_INTERNAL_API_HOST=http://localhost:8889 \
bun run dev -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001).

## Environment variables

| Variable                         | Required | Purpose                                                                                                                           |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DOCENT_INTERNAL_API_HOST`       | No       | Backend origin used by Next.js server requests and the `/rest` proxy. Defaults to `http://localhost:8888`. Do not append `/rest`. |
| `NEXT_PUBLIC_API_HOST`           | No       | Public backend origin for explicit cross-origin mode and server-side fallback when no internal host is set.                       |
| `NEXT_PUBLIC_INTERNAL_API_HOST`  | No       | Deprecated compatibility alias for `DOCENT_INTERNAL_API_HOST`.                                                                    |
| `NEXT_PUBLIC_POSTHOG_API_KEY`    | No       | Enables PostHog when configured.                                                                                                  |
| `NEXT_PUBLIC_POSTHOG_API_HOST`   | No       | Overrides the PostHog host.                                                                                                       |
| `NEXT_PUBLIC_SENTRY_DSN`         | No       | Enables browser-side Sentry reporting.                                                                                            |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No       | Labels the Sentry environment.                                                                                                    |

By default, the browser calls `/rest` on the Web origin and Next.js transparently proxies the request to `DOCENT_INTERNAL_API_HOST`. Only the Web port needs to be exposed or forwarded. Use `docent_core web --cross-origin` and `NEXT_PUBLIC_API_HOST` only when the browser must call a separately published backend.

`DOCENT_INTERNAL_API_HOST` must be a plain trusted origin without credentials or a `/rest` suffix. `NEXT_PUBLIC_API_HOST` is embedded in production client assets when cross-origin mode is enabled; never put credentials or secret query parameters in it.

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
DOCENT_INTERNAL_API_HOST=http://localhost:8889 \
bun run build
bun run test:config
```

There is no component-test suite yet. `test:config` covers proxy configuration; lint, TypeScript, and the production build cover the application surface.

## Container routing

`Dockerfile.frontend` uses the tracked `bun.lock` and bakes the `/rest` rewrite destination into the standalone Next.js build. Docker Compose supplies `http://backend:$DOCENT_SERVER_PORT` as both the build-time and runtime `DOCENT_INTERNAL_API_HOST`. Custom same-origin builds should provide an internal backend origin reachable from the frontend container; explicit cross-origin builds can instead provide only `NEXT_PUBLIC_API_HOST`, which also becomes the server-side and proxy fallback.
