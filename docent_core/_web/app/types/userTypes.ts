// User types matching backend models

import type { Locale } from '@/lib/i18n/locales';

/**
 * Frontend User type for authenticated user context
 * Maps to backend UserResponse fields
 */
export interface User {
  id: string;
  email: string;
  is_anonymous: boolean;
  preferred_locale: Locale;
  name?: string;
}
