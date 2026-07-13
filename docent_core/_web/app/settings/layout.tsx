import { getUser } from '@/app/services/dal';
import { redirect } from 'next/navigation';
import SettingsSidebar from './components/SettingsSidebar';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  // If user is either not authenticated or anonymous, redirect to login
  if (!user || user.is_anonymous) {
    const encodedRedirect = encodeURIComponent('/settings/api-keys');
    redirect(`/login?redirect=${encodedRedirect}`);
  }

  return (
    <div className="h-screen overflow-y-auto">
      <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-6 md:flex-row md:gap-8">
          <SettingsSidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
