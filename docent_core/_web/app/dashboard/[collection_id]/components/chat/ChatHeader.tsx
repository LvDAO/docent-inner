'use client';

import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useLocale } from '@/app/contexts/LocaleContext';

interface ChatHeaderProps {
  title?: string;
  description?: string;
  onReset?: () => void;
  canReset?: boolean;
  children?: React.ReactNode;
}

export function ChatHeader({
  title,
  description,
  onReset,
  canReset = true,
  children,
}: ChatHeaderProps) {
  const { t } = useLocale();
  const shownTitle = title ?? t('chat.header.title');
  const shownDescription = description ?? t('chat.header.description');

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <h4 className="font-semibold text-sm">{shownTitle}</h4>
        {shownDescription && (
          <span className="text-xs text-muted-foreground">
            {shownDescription}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onReset && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={!canReset}
            className="h-7 w-7 p-1.5 text-xs"
            title={t('chat.header.clearHistory')}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
