'use client';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

import { useLocale } from '../../contexts/LocaleContext';
import { logout } from '../../services/authService';
import { useUserContext } from '../../contexts/UserContext';

interface LogoutButtonProps {
  variant?:
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export const LogoutButton = ({
  variant = 'outline',
  size = 'default',
  className,
}: LogoutButtonProps) => {
  const { t } = useLocale();
  const { setUser } = useUserContext();

  const handleLogout = async () => {
    try {
      await logout(); // Pure API call
      setUser(null); // Clear client state

      toast({
        title: t('misc.auth.logoutSuccessTitle'),
        description: t('misc.auth.logoutSuccessDescription'),
      });

      // Redirect to login
      window.location.href = '/signup';
    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: t('misc.auth.logoutErrorTitle'),
        description: t('misc.auth.logoutErrorDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleLogout}
      className={className}
    >
      {t('misc.auth.logout')}
    </Button>
  );
};
