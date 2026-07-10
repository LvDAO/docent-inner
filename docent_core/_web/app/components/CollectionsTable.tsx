'use client';

import { Layers, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Collection } from '@/app/types/collectionTypes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import CollectionRow from './CollectionRow';
import { useDeleteCollectionMutation } from '../api/collectionApi';
import { useLocale } from '../contexts/LocaleContext';

interface CollectionsTableProps {
  collections?: Collection[];
  isLoading: boolean;
}

export function CollectionsTable({
  collections,
  isLoading,
}: CollectionsTableProps) {
  const { t } = useLocale();
  // Delete dialog state – kept here so multiple rows can reuse shared dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingCollection, setDeletingCollection] =
    useState<Collection | null>(null);

  const openDeleteDialog = (collection: Collection) => {
    setDeletingCollection(collection);
    setIsDeleteDialogOpen(true);
  };

  const [deleteCollection] = useDeleteCollectionMutation();

  const handleDeleteCollection = () => {
    if (!deletingCollection) return;
    deleteCollection(deletingCollection.id);
    setIsDeleteDialogOpen(false);
  };

  if (isLoading || !collections) {
    return (
      <div className="flex-1 flex items-center justify-center h-full min-h-[200px]">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
        <div className="bg-secondary p-3 rounded-full mb-3">
          <Layers className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-primary mb-1">
          {t('collections.emptyTitle')}
        </h3>
        <p className="text-xs text-muted-foreground max-w-md">
          {t('collections.emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader className="bg-secondary sticky top-0">
          <TableRow>
            <TableHead className="w-[15%] py-2.5 font-medium text-xs text-muted-foreground">
              {t('collections.id')}
            </TableHead>
            <TableHead className="w-[25%] py-2.5 font-medium text-xs text-muted-foreground">
              {t('common.name')}
            </TableHead>
            <TableHead className="w-[35%] py-2.5 font-medium text-xs text-muted-foreground">
              {t('common.description')}
            </TableHead>
            <TableHead className="w-[15%] py-2.5 font-medium text-xs text-muted-foreground">
              {t('common.created')}
            </TableHead>
            <TableHead className="w-[10%] py-2.5 font-medium text-xs text-muted-foreground text-right">
              {t('common.actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {collections.map((collection) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              onDelete={openDeleteDialog}
            />
          ))}
        </TableBody>
      </Table>

      {/* Delete Confirmation Dialog - keep this one as requested */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('collections.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('collections.deleteDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {deletingCollection && (
              <div className="flex flex-col space-y-2 bg-secondary p-3 rounded-md">
                <div className="text-sm font-medium break-all">
                  {deletingCollection.name || t('collections.unnamed')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {deletingCollection.description ||
                    t('collections.noDescription')}
                </div>
                <div className="text-xs font-mono text-secondary">
                  ID: {deletingCollection.id}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteCollection}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
