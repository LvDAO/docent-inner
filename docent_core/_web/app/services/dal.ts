import { User } from '@/app/types/userTypes';
import { cookies } from 'next/headers';
import { COOKIE_KEY, INTERNAL_BASE_URL } from '../constants';
import { fetchSessionUser } from './session-user.mjs';

/**
 * Verifies the session with the backend
 * Returns the user and sessionId if valid, otherwise returns null
 */
export async function getUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_KEY);
  return fetchSessionUser(sessionCookie?.value, INTERNAL_BASE_URL, COOKIE_KEY);
}
