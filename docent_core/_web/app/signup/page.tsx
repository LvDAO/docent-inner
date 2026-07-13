'use client';

import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAxiosError } from 'axios';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';

import { signup } from '../services/authService';
import { useUserContext } from '../contexts/UserContext';
import { useLocale } from '../contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useUserContext();
  const { locale, t } = useLocale();
  const redirectParam = searchParams.get('redirect') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const videoItems = [
    {
      src: 'https://transluce-videos.s3.us-east-1.amazonaws.com/docent-landing-page/features-1-refinement.mp4',
      description: (
        <>
          <div className="font-semibold text-lg">
            {t('signup.featureCreateTitle')}
          </div>
          <div className="text-sm space-y-3 text-muted-foreground">
            <p>{t('signup.featureCreateDescription')}</p>
          </div>
        </>
      ),
    },
    {
      src: 'https://transluce-videos.s3.us-east-1.amazonaws.com/docent-landing-page/features-2-exploring-results.mp4',
      description: (
        <>
          <div className="font-semibold text-lg">
            {t('signup.featureReviewTitle')}
          </div>
          <div className="text-sm space-y-3 text-muted-foreground">
            {t('signup.featureReviewDescription')}
          </div>
        </>
      ),
    },
    {
      src: 'https://transluce-videos.s3.us-east-1.amazonaws.com/docent-landing-page/features-3-charts.mp4',
      description: (
        <>
          <div className="font-semibold text-lg">
            {t('signup.featureVisualizeTitle')}
          </div>
          <div className="text-sm space-y-3 text-muted-foreground">
            {t('signup.featureVisualizeDescription')}
          </div>
        </>
      ),
    },
  ];

  useEffect(() => {
    if (!carouselApi) return;

    const update = () => {
      setCurrentSlide(carouselApi.selectedScrollSnap());
    };

    carouselApi.on('select', update);
    carouselApi.on('reInit', update);
    carouselApi.reInit();
    update();

    return () => {
      carouselApi.off('select', update);
      carouselApi.off('reInit', update);
    };
  }, [carouselApi]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      const { user } = await signup(email.trim(), password.trim(), locale); // Pure API call

      // Set user in context immediately to prevent race condition
      setUser(user);

      // Force a full page navigation to ensure cookie is processed
      const redirectUrl = redirectParam || '/onboarding';
      window.location.href = redirectUrl;
    } catch (error: unknown) {
      console.error('Failed to sign up:', error);

      const status = isAxiosError(error) ? error.response?.status : null;
      if (status === 409) {
        toast({
          title: t('signup.accountExists'),
          description: t('signup.accountExistsDescription'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('auth.genericError'),
          description: t('signup.failed'),
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-y-auto">
      <div className="flex-1 flex items-center justify-center">
        <div className="py-8 px-4 max-w-md flex-1 space-y-6">
          <div className="flex justify-end">
            <LanguageSwitcher />
          </div>
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {t('signup.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('signup.description')}
            </p>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailAddress')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                disabled={isSubmitting}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !email.trim() || !password.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('signup.creating')}
                </>
              ) : (
                t('signup.createAccount')
              )}
            </Button>
          </form>

          {/* Link to Login */}
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => {
                const loginUrl = redirectParam
                  ? `/login?redirect=${encodeURIComponent(redirectParam)}`
                  : '/login';
                router.push(loginUrl);
              }}
              className="text-sm"
            >
              {t('signup.haveAccount')}
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-3 space-y-3">
        <div className="text-primary text-2xl font-bold text-center">
          {t('signup.howItWorks')}
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline">
            <a
              href="https://docs.transluce.org/en/latest/quickstart"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('signup.quickstart')}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://transluce.org/docent/slack"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('signup.slack')}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://calendly.com/kevin-transluce/30min"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('signup.scheduleCall')}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="mailto:kevin@transluce.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('signup.emailUs')}
            </a>
          </Button>
        </div>

        {/* Video carousel */}
        <div className="w-full max-w-3xl bg-secondary border border-border rounded-lg p-3 space-y-3 shadow-sm">
          <Carousel
            className="w-full"
            opts={{ loop: true }}
            setApi={setCarouselApi}
          >
            <CarouselContent>
              {videoItems.map((item, idx) => (
                <CarouselItem key={idx}>
                  <div className="space-y-3">
                    <div className="space-y-3">{item.description}</div>
                    <div className="relative w-full overflow-hidden rounded-lg border border-border">
                      <div className="pt-[56.25%]"></div>
                      <video
                        className="absolute inset-0 w-full h-full object-cover"
                        autoPlay
                        muted
                        playsInline
                        controls={true}
                        onEnded={() => carouselApi?.scrollNext()}
                      >
                        <source src={item.src} type="video/mp4" />
                        {t('signup.videoUnsupported')}
                      </video>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {/* <CarouselPrevious className="hidden sm:flex left-2 md:-left-12 lg:-left-16" /> */}
            {/* <CarouselNext className="hidden sm:flex right-2 md:-right-12 lg:-right-16" /> */}
          </Carousel>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => carouselApi?.scrollPrev()}
              aria-label={t('signup.previousSlide')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-xs text-muted-foreground">
              {currentSlide + 1} / {videoItems.length}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => carouselApi?.scrollNext()}
              aria-label={t('signup.nextSlide')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SignupPage = () => {
  return (
    <Suspense>
      <SignupPageContent />
    </Suspense>
  );
};

export default SignupPage;
