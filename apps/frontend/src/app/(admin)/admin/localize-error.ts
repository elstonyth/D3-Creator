import type { Locale, Translator } from '@gitroom/frontend/lib/i18n';

/** Adapt the database library's controlled validation messages at the admin boundary. */
export function localizeAdminError(
  message: string,
  locale: Locale,
  t: Translator,
): string {
  if (locale === 'en') return message;
  const translated = t(message);
  if (translated !== message) return translated;

  const shortLink = message.match(
    /^Short links \((.+)\) aren't supported\. Open the link in a browser and paste the full (.+) URL\.$/,
  );
  if (shortLink)
    return t(
      'Short links ({host}) are not supported. Open the link in a browser and paste the full {platform} URL.',
      { host: shortLink[1], platform: t(shortLink[2]) },
    );

  const host = message.match(/^URL host "(.+)" does not match platform (.+)$/);
  if (host)
    return t('URL host "{host}" does not match platform {platform}', {
      host: host[1],
      platform: t(host[2]),
    });

  const facebookPath = message.match(
    /^URL path "(.+)" is not a Facebook profile \(expected a vanity name, \/profile\.php\?id=, or \/people\/Name\/id\)\.$/,
  );
  if (facebookPath)
    return t(
      'URL path "{path}" is not a Facebook profile. Paste a profile link with a username, /profile.php?id=, or /people/Name/id.',
      { path: facebookPath[1] },
    );

  const profilePath = message.match(
    /^URL path "(.+)" is not a (.+) profile \(expected profile root, not a post\/reel\/page section\)$/,
  );
  if (profilePath)
    return t(
      'URL path "{path}" is not a {platform} profile. Paste the profile root, not a post, reel or page section.',
      { path: profilePath[1], platform: t(profilePath[2]) },
    );

  const platform = message.match(/^Unknown platform: (.+)$/);
  if (platform)
    return t('Unknown platform: {platform}', { platform: platform[1] });

  return t('The request failed. Please try again.');
}
