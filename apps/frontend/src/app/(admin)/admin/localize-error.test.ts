import { createTranslator } from '@gitroom/frontend/lib/i18n';
import { localizeAdminError } from './localize-error';

describe('admin validation localization', () => {
  const zh = createTranslator('zh');

  it('preserves existing English diagnostics', () => {
    const message = 'Database connection timed out at upstream.example';
    expect(localizeAdminError(message, 'en', createTranslator('en'))).toBe(
      message,
    );
  });

  it('translates shared account validation and authorization failures', () => {
    expect(localizeAdminError('Email is required.', 'zh', zh)).toBe(
      '请填写邮箱。',
    );
    expect(localizeAdminError('Not authorized.', 'zh', zh)).toBe(
      '你没有执行此操作的权限。',
    );
  });

  it('preserves the submitted path while explaining how to fix a post URL', () => {
    expect(
      localizeAdminError(
        'URL path "/p/CreatorPost123" is not a instagram profile (expected profile root, not a post/reel/page section)',
        'zh',
        zh,
      ),
    ).toBe(
      '链接路径“/p/CreatorPost123”不是 Instagram 个人主页。请粘贴主页根链接，而非帖子、短视频或页面分区链接。',
    );
  });

  it('preserves host and platform guidance for short links', () => {
    expect(
      localizeAdminError(
        "Short links (vm.tiktok.com) aren't supported. Open the link in a browser and paste the full tiktok.com/@<handle> URL.",
        'zh',
        zh,
      ),
    ).toBe(
      '不支持短链接（vm.tiktok.com）。请在浏览器中打开链接，然后粘贴完整的 tiktok.com/@<handle> 链接。',
    );
  });

  it('uses a localized fallback for unknown upstream errors', () => {
    expect(localizeAdminError('upstream database timeout', 'zh', zh)).toBe(
      '请求失败，请重试。',
    );
  });
});
