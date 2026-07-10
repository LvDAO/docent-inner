import type { Locale } from '../locales';
import { analysisEn, analysisZhCN } from './analysis';
import { chatEn, chatZhCN } from './chat';
import { chartsEn, chartsZhCN } from './charts';
import { en } from './en';
import { miscEn, miscZhCN } from './misc';
import { onboardingEn, onboardingZhCN } from './onboarding';
import { resultsEn, resultsZhCN } from './results';
import { workspaceEn, workspaceZhCN } from './workspace';
import { zhCN } from './zh-CN';

const enMessages = {
  ...en,
  ...chatEn,
  ...analysisEn,
  ...onboardingEn,
  ...workspaceEn,
  ...chartsEn,
  ...resultsEn,
  ...miscEn,
} as const;

export type MessageKey = keyof typeof enMessages;
type MessageCatalog = Record<MessageKey, string>;

const zhCNMessages = {
  ...zhCN,
  ...chatZhCN,
  ...analysisZhCN,
  ...onboardingZhCN,
  ...workspaceZhCN,
  ...chartsZhCN,
  ...resultsZhCN,
  ...miscZhCN,
} satisfies MessageCatalog;

export const messageCatalogs: Record<Locale, MessageCatalog> = {
  en: enMessages,
  'zh-CN': zhCNMessages,
};
