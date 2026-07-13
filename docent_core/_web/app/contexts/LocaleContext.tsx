'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { updatePreferredLocale } from '@/app/services/authService';
import type { User } from '@/app/types/userTypes';
import {
  LOCALE_COOKIE_NAME,
  type Locale,
  normalizeLocale,
} from '@/lib/i18n/locales';
import { messageCatalogs, type MessageKey } from '@/lib/i18n/messages';

import { useUserContext } from './UserContext';

type MessageValues = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: MessageKey, values?: MessageValues) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function formatMessage(message: string, values?: MessageValues): string {
  if (!values) return message;

  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const { user, setUser } = useUserContext();
  const [locale, setLocaleState] = useState<Locale>(
    normalizeLocale(initialLocale)
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  const setLocale = useCallback(
    async (nextLocale: Locale) => {
      const normalizedLocale = normalizeLocale(nextLocale);
      if (user && user.preferred_locale !== normalizedLocale) {
        const updatedUser = await updatePreferredLocale(normalizedLocale);
        setUser({
          ...updatedUser,
          preferred_locale: normalizedLocale,
        } satisfies User);
      }

      // Publish the new client locale only after the account preference is durable.
      // This keeps locale-sensitive requests from racing the preference update.
      setLocaleState(normalizedLocale);
      document.documentElement.lang = normalizedLocale;
      document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(normalizedLocale)}; path=/; max-age=31536000; samesite=lax`;
    },
    [setUser, user]
  );

  const t = useCallback(
    (key: MessageKey, values?: MessageValues) =>
      formatMessage(messageCatalogs[locale][key], values),
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
