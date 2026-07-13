'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Key, Brain, Languages } from 'lucide-react';
import { useLocale } from '@/app/contexts/LocaleContext';

interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function SettingsSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  const sidebarItems: SidebarItem[] = [
    {
      id: 'api-keys',
      label: t('settings.apiKeys'),
      href: '/settings/api-keys',
      icon: Key,
    },
    {
      id: 'model-providers',
      label: t('settings.modelProviders'),
      href: '/settings/model-providers',
      icon: Brain,
    },
    {
      id: 'language',
      label: t('settings.language'),
      href: '/settings/language',
      icon: Languages,
    },
  ];

  return (
    <div className="w-full space-y-4 md:w-64 md:shrink-0 md:space-y-6">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard')}
          className="flex max-w-full items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.backToDashboard')}</span>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-2">{t('settings.title')}</h1>
      </div>

      <Card className="p-4">
        <nav className="space-y-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Button
                key={item.id}
                variant={isActive ? 'default' : 'ghost'}
                className="w-full min-w-0 justify-start"
                onClick={() => router.push(item.href)}
              >
                <Icon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Button>
            );
          })}
        </nav>
      </Card>
    </div>
  );
}
