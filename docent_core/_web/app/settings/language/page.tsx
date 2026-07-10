'use client';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/app/contexts/LocaleContext';

export default function LanguageSettingsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('language.title')}</h1>
        <p className="text-muted-foreground">{t('language.description')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('language.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher className="w-48" />
        </CardContent>
      </Card>
    </div>
  );
}
