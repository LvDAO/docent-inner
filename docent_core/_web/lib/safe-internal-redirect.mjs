const DOCENT_ORIGIN = 'https://docent.invalid';

/**
 * Accept only paths on the current Docent origin.
 *
 * @param {string | null | undefined} rawValue
 * @returns {string | null}
 */
export function safeInternalRedirect(rawValue) {
  if (!rawValue) return null;

  const value = rawValue.trim();
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value, DOCENT_ORIGIN);
    if (parsed.origin !== DOCENT_ORIGIN) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
