import { ThemeProvider } from '@/components/theme-provider';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';

import { ReduxProvider, CSPostHogProvider } from './providers';
import { Toaster } from '@/components/ui/toaster';
import ReduxToastHandler from '@/components/ReduxToastHandler';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UserProvider } from './contexts/UserContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { getUser } from './services/dal';
import {
  LOCALE_COOKIE_NAME,
  isLocale,
  localeFromAcceptLanguage,
  normalizeLocale,
} from '@/lib/i18n/locales';

import './globals.css';

export const metadata: Metadata = {
  title: 'Docent',
  description: 'AI-powered evaluation framework',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get user without requiring auth - this allows login/signup pages to work
  const user = await getUser();
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const savedLocale = isLocale(user?.preferred_locale)
    ? user.preferred_locale
    : isLocale(cookieLocale)
      ? cookieLocale
      : null;
  const initialLocale = savedLocale
    ? normalizeLocale(savedLocale)
    : localeFromAcceptLanguage(headerStore.get('accept-language'));

  return (
    <html lang={initialLocale} className="h-full" suppressHydrationWarning>
      <body className="h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <CSPostHogProvider>
            <ReduxProvider>
              <UserProvider user={user}>
                <LocaleProvider initialLocale={initialLocale}>
                  <TooltipProvider delayDuration={0}>
                    {children}
                    <Toaster />
                    <ReduxToastHandler />
                  </TooltipProvider>
                </LocaleProvider>
              </UserProvider>
            </ReduxProvider>
          </CSPostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
