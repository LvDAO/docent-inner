'use client';

import { ModeToggle } from '@/components/ui/theme-toggle';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';

import { login } from '../services/authService';
import { useUserContext } from '../contexts/UserContext';
import { useLocale } from '../contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

function LoginPageContent() {
  const router = useRouter();
  const { setUser } = useUserContext();
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const redirectParam = searchParams.get('redirect') || '';

  // Form state
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setEmail(emailParam);
  }, [emailParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      const { user } = await login(email.trim(), password.trim()); // Pure API call

      // Set user in context immediately to prevent race condition
      setUser(user);

      // Force a full page navigation to ensure cookie is processed
      const redirectUrl = redirectParam || '/dashboard';
      window.location.href = redirectUrl;
    } catch (error: unknown) {
      console.error('Failed to log in:', error);

      const status = isAxiosError(error) ? error.response?.status : null;
      if (status === 404) {
        toast({
          title: t('login.userNotFound'),
          description: t('login.userNotFoundDescription'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('auth.genericError'),
          description:
            status === 401 ? t('login.invalidCredentials') : t('login.failed'),
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollArea className="h-screen">
      <div className="container mx-auto py-8 px-4 max-w-md">
        <div className="mb-6 flex items-center justify-end gap-2">
          <LanguageSwitcher />
          <ModeToggle />
        </div>
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {t('login.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('login.description')}
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailAddress')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                disabled={isSubmitting}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !email.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('login.signingIn')}
                </>
              ) : (
                t('login.signIn')
              )}
            </Button>
          </form>

          {/* Link to Signup */}
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => {
                const signupUrl = redirectParam
                  ? `/signup?redirect=${encodeURIComponent(redirectParam)}`
                  : '/signup';
                router.push(signupUrl);
              }}
              className="text-sm"
            >
              {t('login.noAccount')}
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
