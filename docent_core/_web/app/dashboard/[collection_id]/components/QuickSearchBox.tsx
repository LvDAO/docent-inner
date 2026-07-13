'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

import {
  AlertTriangle,
  Earth,
  HelpCircle,
  Search,
  ConciergeBell,
} from 'lucide-react';
import { useHasCollectionWritePermission } from '@/lib/permissions/hooks';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { useLocale } from '@/app/contexts/LocaleContext';

interface QuickSearchBoxProps {
  onGuided: (highLevelDescription: string) => void;
  onDirect: (highLevelDescription: string) => void;
  isLoading: boolean;
}

export default function QuickSearchBox({
  onGuided,
  onDirect,
  isLoading,
}: QuickSearchBoxProps) {
  const { t } = useLocale();
  const presetQueries = [
    {
      id: 'env',
      label: t('chat.search.scaffolding.label'),
      query: t('chat.search.scaffolding.prompt'),
      icon: Earth,
      color: 'text-blue-text',
    },
    {
      id: 'strange',
      label: t('chat.search.strangeBehavior.label'),
      query: t('chat.search.strangeBehavior.prompt'),
      icon: HelpCircle,
      color: 'text-orange-text',
    },
    {
      id: 'unfollow',
      label: t('chat.search.disobeyingPrompt.label'),
      query: t('chat.search.disobeyingPrompt.prompt'),
      icon: AlertTriangle,
      color: 'text-red-text',
    },
  ];

  /**
   * Presets
   */
  const [hoveredPresetQuery, setHoveredPresetQuery] = useState<string | null>(
    null
  );
  const isPresetHovered = hoveredPresetQuery !== null;
  const [searchQueryTextboxValue, setSearchQueryTextboxValue] = useState('');
  const emptyInput = searchQueryTextboxValue.trim() === '';
  const handleSelectPreset = (query: string) => {
    setSearchQueryTextboxValue(query);
    setHoveredPresetQuery(null);
  };
  const handlePresetHover = (query: string) => {
    setHoveredPresetQuery(query);
  };
  const handlePresetLeave = () => {
    setHoveredPresetQuery(null);
  };

  const hasWritePermission = useHasCollectionWritePermission();

  const submitGuided = () => {
    if (!hasWritePermission || emptyInput || isLoading) return;
    onGuided(searchQueryTextboxValue);
  };

  const submitDirect = () => {
    if (!hasWritePermission || emptyInput || isLoading) return;
    onDirect(searchQueryTextboxValue);
  };

  const searchForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitGuided();
      }}
    >
      <fieldset className="relative">
        <Textarea
          className="h-[10rem] resize-none border-0 p-2 shadow-none focus-visible:ring-0 text-xs font-mono"
          placeholder={hoveredPresetQuery ?? t('chat.search.placeholder')}
          value={isPresetHovered ? '' : searchQueryTextboxValue}
          disabled={!hasWritePermission}
          onChange={(e) => setSearchQueryTextboxValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitGuided();
            }
          }}
        />

        <div className="absolute right-2 bottom-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-2 h-7 text-xs"
            onClick={submitDirect}
            variant="outline"
            disabled={!hasWritePermission || emptyInput || isLoading}
          >
            <Search className="size-3 -ml-0.5" />
            {t('chat.search.direct')}
          </Button>
          <Button
            type="submit"
            size="sm"
            className="gap-2 h-7 text-xs"
            disabled={!hasWritePermission || emptyInput || isLoading}
          >
            <ConciergeBell className="size-3.5 -ml-0.5" />
            {t('chat.search.guided')}
          </Button>
        </div>
      </fieldset>
    </form>
  );

  return (
    // <div className="bg-muted rounded-md space-y-1 border p-2">
    <div className="space-y-2">
      <div className="flex flex-col gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t('chat.search.title')}</div>
          <div className="text-xs text-muted-foreground">
            {t('chat.search.description')}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="text-[11px] leading-snug text-muted-foreground">
            {t('chat.search.tryPreset')}
          </div>
          <div className="flex min-w-0 flex-wrap gap-1">
            {presetQueries.map((preset) => {
              const IconComponent = preset.icon;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.query)}
                  onMouseEnter={() => handlePresetHover(preset.query)}
                  onMouseLeave={handlePresetLeave}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-primary transition-colors hover:border-border hover:bg-secondary disabled:opacity-50"
                  disabled={!hasWritePermission}
                >
                  <IconComponent
                    className={`h-3 w-3 shrink-0 ${preset.color}`}
                  />
                  <span className="truncate">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
        {!hasWritePermission ? (
          <Tooltip>
            <TooltipTrigger asChild>{searchForm}</TooltipTrigger>
            <TooltipContent>
              <p>{t('chat.search.readOnly')}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          searchForm
        )}
      </div>
    </div>
  );
}
