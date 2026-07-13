'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Share2, UserPlus } from 'lucide-react';
import CollaboratorsList from './CollaboratorsList';
import { useState, useCallback } from 'react';
import {
  useGetCollaboratorsQuery,
  useLazyGetUserByEmailQuery,
  useUpsertCollaboratorMutation,
  useRemoveCollaboratorMutation,
} from './collabSlice';
import { PermissionLevel } from './types';
import PermissionDropdown from './PermissionDropdown';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/app/contexts/LocaleContext';
import { useRequireUserContext } from '@/app/contexts/UserContext';
import {
  useHasCollectionAdminPermission,
  useHasCollectionWritePermission,
} from './hooks';

const AddCollaborator = ({ collectionId }: { collectionId: string }) => {
  const { user } = useRequireUserContext();
  const { t } = useLocale();

  // Local state for input
  const [emailInput, setEmailInput] = useState('');
  const [inviteePermissionLevel, setInviteePermissionLevel] =
    useState<PermissionLevel>('read');

  const [upsertCollaborator] = useUpsertCollaboratorMutation();
  const [getUserByEmail] = useLazyGetUserByEmailQuery();

  const hasWritePermission = useHasCollectionWritePermission();

  // Send invite to new collaborator
  const handleSendInvite = async () => {
    if (!emailInput.trim()) return;

    try {
      // First, get the user by email using RTK Query
      const result = await getUserByEmail(emailInput.trim());

      if (result.error) {
        toast({
          title: t('common.error'),
          description: t('permissions.lookupFailed'),
          variant: 'destructive',
        });
        return;
      }

      const newUser = result.data;
      if (!newUser) {
        toast({
          title: t('permissions.userNotFound'),
          description: t('permissions.userNotFoundDescription', {
            email: emailInput.trim(),
          }),
          variant: 'destructive',
        });
        return;
      }
      if (newUser.id === user.id) {
        toast({
          title: t('common.error'),
          description: t('permissions.cannotInviteSelf'),
          variant: 'destructive',
        });
        return;
      }

      // Use the user's ID as the subject_id
      await upsertCollaborator({
        subject_id: newUser.id,
        subject_type: 'user',
        collection_id: collectionId,
        permission_level: inviteePermissionLevel,
      }).unwrap();

      setEmailInput('');
    } catch {
      toast({
        title: t('common.error'),
        description: t('permissions.inviteFailed'),
        variant: 'destructive',
      });
    }
  };
  if (!hasWritePermission) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('permissions.noManagePermission')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        disabled={!hasWritePermission}
        placeholder={
          hasWritePermission
            ? t('permissions.emailPlaceholder')
            : t('permissions.noAddPermission')
        }
        className="h-7 min-w-0 flex-1 text-xs"
      />
      <PermissionDropdown
        value={inviteePermissionLevel}
        onChange={setInviteePermissionLevel}
      />
      <Button
        onClick={handleSendInvite}
        disabled={!emailInput.trim()}
        size="sm"
        className="h-7"
      >
        <UserPlus size={16} className="mr-1" />
        {t('permissions.invite')}
      </Button>
    </div>
  );
};

const ShareViewPopover = ({ collectionId }: { collectionId: string }) => {
  const { t } = useLocale();
  // Get current public permission level from collaborators
  const { publicPermissionLevel } = useGetCollaboratorsQuery(collectionId, {
    selectFromResult: (result) => {
      const publicCollab = result.data?.find(
        (c) => c.subject_type === 'public'
      );
      return {
        publicPermissionLevel: publicCollab?.permission_level || 'none',
      };
    },
  });

  const [upsertCollaborator] = useUpsertCollaboratorMutation();
  const [removeCollaborator] = useRemoveCollaboratorMutation();

  // Handler for public permission level changes
  const handlePublicPermissionChange = useCallback(
    (newPermissionLevel: PermissionLevel) => {
      if (newPermissionLevel === 'none') {
        // Remove public access
        removeCollaborator({
          subject_id: 'public',
          subject_type: 'public',
          collection_id: collectionId,
        });
      } else {
        // Set or update public access
        upsertCollaborator({
          subject_id: 'public',
          subject_type: 'public',
          collection_id: collectionId,
          permission_level: newPermissionLevel,
        });
      }
    },
    [collectionId, upsertCollaborator, removeCollaborator]
  );

  const hasAdminPermission = useHasCollectionAdminPermission();
  const hasWritePermission = useHasCollectionWritePermission();
  const accessButtonLabel = hasWritePermission
    ? t('permissions.readWrite')
    : t('collections.readOnly');

  if (!hasAdminPermission) {
    return (
      <Button variant="outline" size="sm" className="gap-x-2 h-7 px-2" disabled>
        <Share2 size={14} /> {accessButtonLabel}
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-x-2 h-7 px-2">
          <Share2 size={14} /> {t('permissions.share')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="_SharePopover w-[calc(100vw-2rem)] max-w-[640px] space-y-3 rounded-lg p-3">
        {/* Section 1: Add collaborators */}
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {t('permissions.addCollaborators')}
          </h3>
          <AddCollaborator collectionId={collectionId} />
        </div>

        {/* Section 2: Access settings */}
        <div className="border-t" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label htmlFor="public-access" className="text-sm font-medium">
              {t('permissions.publicAccess')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('permissions.publicAccessDescription')}
            </p>
          </div>
          <PublicPermissionDropdown
            value={publicPermissionLevel}
            onChange={handlePublicPermissionChange}
            disabled={!hasAdminPermission}
          />
        </div>

        {/* Section 3: Collaborators */}
        <div className="border-t" />
        <CollaboratorsList collectionId={collectionId} />
      </PopoverContent>
    </Popover>
  );
};

// New component for public permission dropdown
interface PublicPermissionDropdownProps {
  value: PermissionLevel;
  onChange: (newPermission: PermissionLevel) => void;
  disabled?: boolean;
}

const PublicPermissionDropdown = ({
  value,
  onChange,
  disabled = false,
}: PublicPermissionDropdownProps) => {
  const { t } = useLocale();
  const publicPermissionLabels = {
    none: t('permissions.noAccess'),
    read: t('permissions.canView'),
    write: t('permissions.canEdit'),
  };

  const publicPermissionDescriptions = {
    none: t('permissions.publicNoneDescription'),
    read: t('permissions.publicViewDescription'),
    write: t('permissions.publicEditDescription'),
  };

  return (
    <Select
      value={value}
      onValueChange={(val) => onChange(val as PermissionLevel)}
      disabled={disabled}
    >
      <SelectTrigger id="public-access" className="w-28 h-7 text-xs">
        <SelectValue className="text-xs font-medium">
          {publicPermissionLabels[
            value as keyof typeof publicPermissionLabels
          ] || publicPermissionLabels.none}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              {publicPermissionLabels.none}
            </span>
            <span className="text-xs text-muted-foreground">
              {publicPermissionDescriptions.none}
            </span>
          </div>
        </SelectItem>
        <SelectItem value="read">
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              {publicPermissionLabels.read}
            </span>
            <span className="text-xs text-muted-foreground">
              {publicPermissionDescriptions.read}
            </span>
          </div>
        </SelectItem>
        <SelectItem value="write">
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              {publicPermissionLabels.write}
            </span>
            <span className="text-xs text-muted-foreground">
              {publicPermissionDescriptions.write}
            </span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

export default ShareViewPopover;
