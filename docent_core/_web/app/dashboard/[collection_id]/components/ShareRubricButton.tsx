'use client';

import {
  RubricCentroid,
  useGetClusteringStateQuery,
} from '@/app/api/rubricApi';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Share } from 'lucide-react';
import { useLocale } from '@/app/contexts/LocaleContext';

interface ShareRubricButtonProps {
  rubricId: string;
  collectionId: string;
  pollingInterval?: number;
}

export default function ShareRubricButton({
  rubricId,
  collectionId,
  pollingInterval = 0,
}: ShareRubricButtonProps) {
  const { t } = useLocale();
  const { centroidsMap } = useGetClusteringStateQuery(
    {
      collectionId,
      rubricId,
    },
    {
      pollingInterval,
      selectFromResult: (result) => ({
        centroidsMap:
          result.data?.centroids?.reduce(
            (acc, centroid) => {
              acc[centroid.id] = centroid;
              return acc;
            },
            {} as Record<string, RubricCentroid>
          ) ?? {},
      }),
    }
  );

  const handleShare = async () => {
    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('rubricId', rubricId);

      // If centroids exist, add parameter to auto-load them in the shared link
      if (Object.keys(centroidsMap).length > 0) {
        currentUrl.searchParams.set('includeCentroids', 'true');
      }

      await navigator.clipboard.writeText(currentUrl.toString());

      toast({
        title: t('misc.rubric.linkCopied'),
        description: t('misc.rubric.linkCopiedDescription'),
      });
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast({
        title: t('misc.rubric.copyLinkFailedTitle'),
        description: t('misc.rubric.copyLinkFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="gap-1 h-7 w-7 text-muted-foreground text-xs"
      onClick={handleShare}
      title={t('misc.rubric.share')}
      aria-label={t('misc.rubric.share')}
    >
      <Share size={14} />
    </Button>
  );
}
