// Removed unused imports

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, User, Building, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PermissionLevel, SubjectType } from './types';
import PermissionDropdown from './PermissionDropdown';
import {
  UserCollaborator,
  OrganizationCollaborator,
  useGetCollaboratorsQuery,
  useRemoveCollaboratorMutation,
  useUpsertCollaboratorMutation,
} from './collabSlice';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/app/contexts/LocaleContext';
import { useRequireUserContext } from '@/app/contexts/UserContext';
import { useHasCollectionAdminPermission } from './hooks';

// Types matching ShareViewPopover

// Get initials for avatar
const getInitials = (name?: string, email?: string) => {
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
};

const getDisplayName = (
  collaborator: UserCollaborator | OrganizationCollaborator,
  unknownLabel: string
) => {
  if (collaborator.subject_type === 'user') {
    return (
      collaborator.subject.name || collaborator.subject.email || unknownLabel
    );
  }
  return collaborator.subject.name || unknownLabel;
};

// Collaborator Row Component
interface CollaboratorRowProps {
  collaborator: UserCollaborator | OrganizationCollaborator;
}
const CollaboratorRow = ({ collaborator }: CollaboratorRowProps) => {
  const { t } = useLocale();
  const [upsertCollaborator] = useUpsertCollaboratorMutation();
  const [removeCollaborator] = useRemoveCollaboratorMutation();
  const hasAdminPermission = useHasCollectionAdminPermission();
  const onPermissionChange = (newPermission: PermissionLevel) => {
    upsertCollaborator({
      subject_id: collaborator.subject_id,
      subject_type: collaborator.subject_type,
      collection_id: collaborator.collection_id,
      permission_level: newPermission,
    });
  };

  // Get subject type icon
  const getSubjectIcon = (subjectType: SubjectType) => {
    switch (subjectType) {
      case 'user':
        return <User size={14} />;
      case 'organization':
        return <Building size={14} />;
      case 'public':
        return <Globe size={14} />;
      default:
        return <User size={14} />;
    }
  };
  const displayName = getDisplayName(collaborator, t('permissions.unknown'));
  const displayEmail =
    collaborator.subject_type === 'user'
      ? collaborator.subject.email
      : undefined;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="h-7 w-8">
          <AvatarFallback className="text-xs">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>

        {/* Name and Email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate">{displayName}</span>
          </div>
          {displayEmail && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {getSubjectIcon(collaborator.subject_type)}
              <span className="truncate">{displayEmail}</span>
            </div>
          )}
          {collaborator.subject_type !== 'user' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {getSubjectIcon(collaborator.subject_type)}
              <span>
                {collaborator.subject_type === 'organization'
                  ? t('permissions.organization')
                  : t('permissions.public')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Permission Dropdown and Actions */}
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <PermissionDropdown
          value={collaborator.permission_level}
          onChange={(newPermission) => onPermissionChange(newPermission)}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasAdminPermission}
          aria-label={t('permissions.removeCollaborator', {
            name: displayName,
          })}
          onClick={() =>
            removeCollaborator({
              subject_id: collaborator.subject_id,
              subject_type: collaborator.subject_type,
              collection_id: collaborator.collection_id,
            })
          }
        >
          <X size={14} />
        </Button>
      </div>
    </div>
  );
};

// Main CollaboratorsList Component
interface CollaboratorsListProps {
  collectionId: string;
}

const CollaboratorsList = ({ collectionId }: CollaboratorsListProps) => {
  const { t } = useLocale();
  const { user: currentUser } = useRequireUserContext();
  const { userCollaborators, orgCollaborators } = useGetCollaboratorsQuery(
    collectionId,
    {
      selectFromResult: (result) => {
        return {
          userCollaborators: result.data?.filter(
            (c) => c.subject_type === 'user' && c.subject_id !== currentUser.id
          ) as UserCollaborator[] | undefined,
          orgCollaborators: result.data?.filter(
            (c) => c.subject_type === 'organization'
          ) as OrganizationCollaborator[] | undefined,
        };
      },
    }
  );

  const users = userCollaborators ?? [];
  const organizations = orgCollaborators ?? [];

  if (users.length === 0 && organizations.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <User className="mx-auto h-7 w-8 mb-2 opacity-50" />
        <p className="text-xs">{t('permissions.noCollaborators')}</p>
      </div>
    );
  }

  const collaboratorCount = users.length + organizations.length;

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">
        {t('permissions.collaborators', { count: collaboratorCount })}
      </h3>

      {users.map((collaborator) => (
        <CollaboratorRow
          key={`${collaborator.subject_id}-${collaborator.subject_type}-${collaborator.collection_id}`}
          collaborator={collaborator}
        />
      ))}
      {organizations.map((collaborator) => (
        <CollaboratorRow
          key={`${collaborator.subject_id}-${collaborator.subject_type}-${collaborator.collection_id}`}
          collaborator={collaborator}
        />
      ))}
    </div>
  );
};

export default CollaboratorsList;
