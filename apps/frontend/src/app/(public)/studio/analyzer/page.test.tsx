import { isValidElement, type ReactElement, type ReactNode } from 'react';

import { createTranslator, type Locale } from '@gitroom/frontend/lib/i18n';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import AnalyzerWorkspace from './analyzer-workspace';
import VideoAnalyzerPage from './page';

jest.mock('@gitroom/frontend/lib/i18n-server', () => ({ getI18n: jest.fn() }));
jest.mock('@gitroom/frontend/lib/supabase-route', () => ({
  getSupabaseRoute: jest.fn(),
}));
jest.mock('@gitroom/frontend/lib/auth', () => ({
  getAuthContext: async () => ({ userId: 'member', role: 'creator' }),
  isStudioMember: () => true,
}));
jest.mock('@gitroom/frontend/lib/analyzer', () => ({
  listJobs: async () => [],
}));
jest.mock('./analyzer-workspace', () => ({
  __esModule: true,
  default: () => null,
}));

const savedProfile = {
  what_you_sell: 'phones',
  who_buys_it: 'students',
  content_language: 'malay',
  reply_language: 'english',
  typical_video_seconds: null,
};

function setup(locale: Locale, data: typeof savedProfile | null) {
  (getI18n as jest.Mock).mockResolvedValue({
    locale,
    t: createTranslator(locale),
  });
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: async () => ({ data, error: null }),
  };
  (getSupabaseRoute as jest.Mock).mockResolvedValue({ from: () => query });
}

function findWorkspace(
  node: ReactNode
): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findWorkspace(child);
      if (match) return match;
    }
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === AnalyzerWorkspace)
    return node as ReactElement<Record<string, unknown>>;
  return findWorkspace(node.props.children);
}

it.each(['en', 'zh'] as const)(
  'uses %s for new reports without changing saved content preferences',
  async (locale) => {
    setup(locale, savedProfile);
    const workspace = findWorkspace(await VideoAnalyzerPage());
    expect(workspace?.props.reportLanguage).toBe(locale);
    expect(workspace?.props.businessProfile).toContain(
      'Content language: Malay'
    );
    expect(workspace?.props.businessProfile).toContain(
      `Reply language: ${locale === 'zh' ? 'Chinese' : 'English'}`
    );
    expect(savedProfile.reply_language).toBe('english');
    expect(savedProfile.content_language).toBe('malay');
  }
);

it('keeps the chosen report language when there is no saved profile', async () => {
  setup('zh', null);
  const workspace = findWorkspace(await VideoAnalyzerPage());
  expect(workspace?.props.reportLanguage).toBe('zh');
  expect(workspace?.props.businessProfile).toBeNull();
});

it('omits incomplete profile context without changing the chosen report language', async () => {
  setup('zh', { ...savedProfile, what_you_sell: '' });
  const workspace = findWorkspace(await VideoAnalyzerPage());
  expect(workspace?.props.reportLanguage).toBe('zh');
  expect(workspace?.props.businessProfile).toBeNull();
});
