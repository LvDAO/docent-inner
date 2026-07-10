'use client';
import { ModeToggle } from '@/components/ui/theme-toggle';

import { PlusIcon, BookOpenIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

import { CollectionsTable } from '../components/CollectionsTable';
import { UserProfile } from '../components/auth/UserProfile';
import { resetCollectionSlice } from '../store/collectionSlice';
import { useAppDispatch } from '../store/hooks';
import { resetTranscriptSlice } from '../store/transcriptSlice';
import { useRequireUserContext } from '../contexts/UserContext';
import {
  useCreateCollectionMutation,
  useGetCollectionsQuery,
} from '../api/collectionApi';
import { useLocale } from '../contexts/LocaleContext';

export default function HomePage() {
  // User is guaranteed to be present in authenticated pages
  const { user } = useRequireUserContext();
  const { t } = useLocale();

  const dispatch = useAppDispatch();

  // New collection dialog state
  const [isNewCollectionDialogOpen, setIsNewCollectionDialogOpen] =
    useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');

  // RTK Query hooks
  const { data: collections, isLoading: isLoadingCollections } =
    useGetCollectionsQuery();
  const [createCollection, { isLoading: isCreatingCollection }] =
    useCreateCollectionMutation();

  /**
   * TODO(mengk): get rid of this!!!
   */
  useEffect(() => {
    // Clear out old state
    dispatch(resetCollectionSlice());
    dispatch(resetTranscriptSlice());
    // TODO(mengk): call thunks to cancel the transcript requests too
  }, [dispatch]);

  const handleCreateCollection = async () => {
    try {
      await createCollection({
        name: newCollectionName,
        description: newCollectionDescription,
      }).unwrap();

      // Close dialog and reset form
      setIsNewCollectionDialogOpen(false);
      setNewCollectionName('');
      setNewCollectionDescription('');

      toast({
        title: t('dashboard.collectionCreated'),
        description: t('dashboard.collectionCreatedDescription'),
      });
    } catch (error) {
      console.error('Failed to create collection:', error);
      toast({
        title: t('common.error'),
        description: t('dashboard.collectionCreateFailed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <ScrollArea className="h-screen">
      <div className="container mx-auto py-4 px-3 max-w-screen-xl space-y-3">
        {/* Header Section */}
        <div className="space-y-1 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-semibold tracking-tight">
                {t('dashboard.title')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('dashboard.welcome', { email: user.email })}{' '}
                {user.is_anonymous
                  ? t('dashboard.anonymousDescription')
                  : t('dashboard.userDescription')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="flex items-center gap-1 h-7"
                      size="sm"
                      onClick={() => setIsNewCollectionDialogOpen(true)}
                      disabled={user.is_anonymous}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      {t('dashboard.createCollection')}
                    </Button>
                  </TooltipTrigger>
                  {user.is_anonymous && (
                    <TooltipContent>
                      <p>{t('dashboard.createAccountHint')}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              <ModeToggle />
              <UserProfile />
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Quickstart banner */}
        <div className="bg-secondary border-border rounded-sm p-3">
          <div className="flex items-start gap-3">
            <BookOpenIcon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium text-sm mb-1 text-primary">
                {t('dashboard.getStarted')}
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                {t('dashboard.getStartedDescription')}
              </p>
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://transluce-docent.readthedocs-hosted.com/en/latest/quickstart"
                  target="_blank"
                  className="inline-flex items-center gap-1"
                >
                  {t('dashboard.readQuickstart')}
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://docent.transluce.org/sample"
                  target="_blank"
                  className="inline-flex items-center gap-1 ml-1"
                >
                  {t('dashboard.sampleCollection')}
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Table area */}
        <CollectionsTable
          collections={collections}
          isLoading={isLoadingCollections}
        />
      </div>

      {/* Create New Collection Dialog */}
      <Dialog
        open={isNewCollectionDialogOpen}
        onOpenChange={setIsNewCollectionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.createDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('dashboard.createDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-name">{t('common.name')}</Label>
              <Input
                id="new-name"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder={t('dashboard.collectionNamePlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-description">{t('common.description')}</Label>
              <Textarea
                id="new-description"
                value={newCollectionDescription}
                onChange={(e) => setNewCollectionDescription(e.target.value)}
                placeholder={t('dashboard.collectionDescriptionPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsNewCollectionDialogOpen(false)}
              disabled={isCreatingCollection}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateCollection}
              disabled={isCreatingCollection}
            >
              {isCreatingCollection
                ? t('dashboard.creating')
                : t('dashboard.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
