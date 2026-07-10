import { apiRestClient } from './apiService';
import type { User } from '../types/userTypes';
import type { Locale } from '@/lib/i18n/locales';

interface AuthResponse {
  user: User;
  session_id: string;
}
/**
 * Pure authentication API operations
 * No side effects (redirects, state management) - just API calls
 */
export class AuthService {
  /**
   * Login user with email and password
   */
  static async login(email: string, password: string): Promise<AuthResponse> {
    const response = await apiRestClient.post('/login', { email, password });
    return response.data;
  }

  /**
   * Signup new user with email and password
   */
  static async signup(
    email: string,
    password: string,
    preferredLocale: Locale
  ): Promise<AuthResponse> {
    const response = await apiRestClient.post('/signup', {
      email,
      password,
      preferred_locale: preferredLocale,
    });
    return response.data;
  }

  /**
   * Logout current user
   */
  static async logout(): Promise<void> {
    await apiRestClient.post('/logout');
  }

  /**
   * Persist the current user's preferred locale.
   */
  static async updatePreferredLocale(preferredLocale: Locale): Promise<User> {
    const response = await apiRestClient.patch<User>('/me/preferences', {
      preferred_locale: preferredLocale,
    });
    return response.data;
  }
}

// Export convenience functions for easier imports
export const { login, logout, signup, updatePreferredLocale } = AuthService;
