/**
 * Browser requests use the current origin by default and are proxied by Next.js.
 * NEXT_PUBLIC_API_HOST remains available for explicitly cross-origin deployments.
 * DOCENT_INTERNAL_API_HOST is only used by Next.js server-side requests.
 */

const normalizeBaseUrl = (value: string | undefined): string =>
  value?.replace(/\/+$/, '') ?? '';

export const BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_HOST);
export const INTERNAL_BASE_URL =
  normalizeBaseUrl(
    process.env.DOCENT_INTERNAL_API_HOST ||
      process.env.NEXT_PUBLIC_INTERNAL_API_HOST ||
      process.env.NEXT_PUBLIC_API_HOST
  ) || 'http://localhost:8888';

export const BASE_DOCENT_PATH = '/dashboard';

export const COOKIE_KEY = 'docent_session';
