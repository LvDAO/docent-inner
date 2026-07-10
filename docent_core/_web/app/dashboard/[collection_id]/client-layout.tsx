'use client';

import {
  redirect,
  useParams,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import React, { useEffect, Suspense } from 'react';

import Breadcrumbs from '../../components/Breadcrumbs';
import { setCollectionId } from '../../store/collectionSlice';
import { useAppDispatch } from '../../store/hooks';
import { Button } from '@/components/ui/button';
import { useUserContext } from '@/app/contexts/UserContext';
import { useLocale } from '@/app/contexts/LocaleContext';

export default function DocentDashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const dispatch = useAppDispatch();
  const params = useParams();
  const collectionId = params.collection_id as string;

  const searchParams = useSearchParams();
  const rubricId =
    searchParams.get('rubricId') || searchParams.get('activeRubricId');
  if (rubricId) {
    redirect(`/dashboard/${collectionId}/rubric/${rubricId}`);
  }

  // Set the collection ID in the store
  useEffect(() => {
    if (collectionId) {
      dispatch(setCollectionId(collectionId));
    }
  }, [collectionId, dispatch]);

  return (
    <div className="flex flex-col h-screen w-screen p-3 pt-2 space-y-2 min-h-0 min-w-[900px]">
      <Suspense
        fallback={
          <div className="h-7">{t('results.access.loadingBreadcrumbs')}</div>
        }
      >
        <Breadcrumbs />
      </Suspense>
      {children}
    </div>
  );
}

export function PermissionDeniedPage() {
  const router = useRouter();
  const { user } = useUserContext();
  const { t } = useLocale();

  const handleLoginRedirect = () => {
    // Capture the current URL to redirect back after login
    const currentUrl = window.location.pathname + window.location.search;
    const encodedRedirect = encodeURIComponent(currentUrl);
    router.push(`/signup?redirect=${encodedRedirect}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-secondary space-y-3">
      <div className="text-center">
        <div className="text-base font-semibold text-primary">
          {t('results.access.deniedTitle')}
        </div>
        <div className="text-muted-foreground text-sm">
          {t('results.access.deniedDescription')}
        </div>
      </div>
      <Button size="sm" onClick={handleLoginRedirect}>
        {user === null || user.is_anonymous
          ? t('results.access.login')
          : t('results.access.backHome')}
      </Button>
    </div>
  );
}

export function NotFoundPage() {
  const router = useRouter();
  const { t } = useLocale();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-secondary space-y-3">
      <div className="text-center">
        <div className="text-base font-semibold text-primary">
          {t('results.access.notFoundTitle')}
        </div>
        <div className="text-muted-foreground text-sm">
          {t('results.access.notFoundDescription')}
        </div>
      </div>
      <Button size="sm" onClick={() => router.push('/')}>
        {t('results.access.backHome')}
      </Button>
    </div>
  );
}
