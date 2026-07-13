/**
 * Resolve a session cookie through the backend without trusting request headers.
 *
 * @param {string | undefined} sessionId
 * @param {string} apiBaseUrl
 * @param {string} cookieName
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<import('../types/userTypes').User | null>}
 */
export async function fetchSessionUser(
  sessionId,
  apiBaseUrl,
  cookieName,
  fetchImpl = fetch
) {
  if (!sessionId) return null;

  try {
    const response = await fetchImpl(`${apiBaseUrl}/rest/me`, {
      headers: {
        Cookie: `${cookieName}=${sessionId}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    return /** @type {import('../types/userTypes').User} */ (
      await response.json()
    );
  } catch {
    return null;
  }
}
