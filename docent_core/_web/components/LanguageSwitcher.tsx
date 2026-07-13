'use client';

import { Languages } from 'lucide-react';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { rubricApi } from '@/app/api/rubricApi';
import { useAppDispatch } from '@/app/store/hooks';
import { cn } from '@/lib/utils';
import { type Locale } from '@/lib/i18n/locales';
import { useLocale } from '@/app/contexts/LocaleContext';

interface LanguageSwitcherProps {
  className?: string;
  mode?: 'select' | 'menu-item';
}

export function LanguageSwitcher({
  className,
  mode = 'select',
}: LanguageSwitcherProps) {
  const dispatch = useAppDispatch();
  const { locale, setLocale, t } = useLocale();
  const currentLanguage =
    locale === 'en' ? t('language.english') : t('language.chineseSimplified');

  const changeLocale = async (nextLocale: Locale) => {
    try {
      await setLocale(nextLocale);
      dispatch(
        rubricApi.util.invalidateTags([
          'RubricJob',
          'JudgeResult',
          'ClusteringJob',
          'Centroids',
          'Assignments',
        ])
      );
    } catch {
      toast({
        title: t('common.error'),
        description: t('language.saveError'),
        variant: 'destructive',
      });
    }
  };

  if (mode === 'menu-item') {
    const nextLocale: Locale = locale === 'en' ? 'zh-CN' : 'en';
    const nextLanguage =
      nextLocale === 'en'
        ? t('language.english')
        : t('language.chineseSimplified');

    return (
      <DropdownMenuItem onSelect={() => void changeLocale(nextLocale)}>
        <Languages className="mr-2 h-4 w-4" />
        {t('language.switchTo', { language: nextLanguage })}
      </DropdownMenuItem>
    );
  }

  return (
    <Select
      value={locale}
      onValueChange={(value) => void changeLocale(value as Locale)}
    >
      <SelectTrigger
        aria-label={t('language.select')}
        className={cn('h-7 w-36 text-xs', className)}
      >
        <Languages className="mr-1 h-3.5 w-3.5" />
        <SelectValue>{currentLanguage}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">{t('language.english')}</SelectItem>
        <SelectItem value="zh-CN">{t('language.chineseSimplified')}</SelectItem>
      </SelectContent>
    </Select>
  );
}
