import { RichText } from '@gitroom/frontend/components/legal/rich-text';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { Metadata } from 'next';
import { GlassCard } from '@gitroom/frontend/components/ui/glass-card';
import {
  SITE_URL,
  SITE_DOMAIN,
  PRIVACY_EMAIL,
} from '@gitroom/frontend/lib/site';

export const dynamic = 'force-dynamic';
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t('Privacy Policy — D3 Creator'),
    description: t(
      'D3 Creator Privacy Policy: how we collect, use, and protect your information when you use our social media analytics service.'
    ),
    alternates: { canonical: '/privacy' },
  };
}

const sectionTitle = 'text-section mt-12 mb-4 text-fg';
const subTitle = 'text-subsection mt-8 mb-3 text-fg';
const paragraph = 'text-body text-fgMuted mb-4';
const bullet = 'text-body text-fgMuted mb-2';
const linkClass =
  'text-brand hover:text-brand-light transition-colors underline underline-offset-4 decoration-brand/40 hover:decoration-brand-light/60';
const inlineStrong = 'text-fg font-semibold';

export default async function PrivacyPage() {
  const { t } = await getI18n();
  return (
    <article className="max-w-[720px] mx-auto pt-12 pb-24">
      <header className="mb-12 pb-8 border-b border-borderGlass">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-fgMuted mb-6">
          {t('Legal')}{' '}
        </span>
        <h1 className="text-display-2 text-fg mb-4">{t('Privacy Policy')}</h1>
        <p className="text-caption text-fgSubtle">
          {t('Effective Date: 1 January 2025 · Last Updated: 29 June 2026')}
        </p>
      </header>

      <p className={paragraph}>
        <RichText
          text={t(
            'D3 Creator (“D3 Creator”, “we”, “our”, or “us”) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and disclose your personal information when you use our website at {link1} and our related social media analytics services (collectively, the “Service”).'
          )}
          values={{
            link1: (
              <a className={linkClass} href={SITE_URL}>
                {SITE_DOMAIN}
              </a>
            ),
          }}
        />
      </p>
      <p className={paragraph}>
        {t(
          'By accessing or using the Service, you agree to the collection and use of information in accordance with this Privacy Policy. This policy is designed to comply with the European Union General Data Protection Regulation (“GDPR”) and the Malaysian Personal Data Protection Act 2010 (“PDPA”), as well as other applicable data protection laws.'
        )}
      </p>

      <h2 className={sectionTitle}>{t('1. Information We Collect')}</h2>
      <p className={paragraph}>
        {t(
          'We collect the following categories of information when you register for or use the Service:'
        )}
      </p>

      <h3 className={subTitle}>{t('1.1 Account Information')}</h3>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>{t('Your full name (or display name)')}</li>
        <li className={bullet}>{t('Your email address')}</li>
        <li className={bullet}>
          {t('An encrypted password (we never store plain-text passwords)')}
        </li>
        <li className={bullet}>{t('Account preferences and settings')}</li>
      </ul>

      <h3 className={subTitle}>{t('1.2 Tracked Social Profiles')}</h3>
      <p className={paragraph}>
        {t(
          'D3 Creator is an agency-managed service: your agency adds the public social profiles that belong to you (on Instagram, Facebook, TikTok, or Douyin), and we collect publicly available data from those profiles. For each tracked profile we collect:'
        )}
      </p>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t('The public profile URL and handle supplied by your agency')}
        </li>
        <li className={bullet}>
          {t(
            'Public profile information (such as username, display name, profile picture, follower and following counts)'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Publicly visible posts and their public engagement metrics (views, likes, comments, shares)'
          )}
        </li>
      </ul>
      <p className={paragraph}>
        {t(
          'For tracked profiles, we only collect information that is publicly visible on the platform. We do not access private messages, private posts, or any non-public data through public profile tracking.'
        )}
      </p>

      <h3 className={subTitle}>{t('1.3 Analytics & Usage Data')}</h3>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t(
            'Aggregated metrics about the tracked accounts (followers, views, engagement rate, likes, comments, shares)'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Time-series snapshots of these metrics so we can show you growth charts'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Service usage information (pages visited, features used, session duration) collected through privacy-friendly analytics'
          )}
        </li>
      </ul>

      <h3 className={subTitle}>{t('1.5 Technical Information')}</h3>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t('IP address and approximate location (country / region)')}
        </li>
        <li className={bullet}>
          {t('Browser type and version, device type, operating system')}
        </li>
        <li className={bullet}>
          {t('Log data such as access timestamps and referrer URLs')}
        </li>
      </ul>

      <h2 className={sectionTitle}>{t('2. How We Use Your Information')}</h2>
      <p className={paragraph}>
        {t('We use the information we collect for the following purposes:')}
      </p>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t(
            'To provide and display analytics for the tracked social media accounts in your D3 Creator dashboard'
          )}
        </li>
        <li className={bullet}>
          {t('To create and manage your D3 Creator account')}
        </li>
        <li className={bullet}>
          {t('To authenticate you and keep your account secure')}
        </li>
        <li className={bullet}>
          {t('To improve, maintain, and operate the Service')}
        </li>
        <li className={bullet}>
          {t(
            'To respond to your support requests and communicate with you about your account or important service notices'
          )}
        </li>
        <li className={bullet}>
          {t(
            'To detect, prevent, and address technical issues, fraud, or abuse'
          )}
        </li>
        <li className={bullet}>{t('To comply with our legal obligations')}</li>
      </ul>
      <p className={paragraph}>
        {t(
          'We process your personal data on the following lawful bases under the GDPR: (a) performance of a contract with you (providing the Service); (b) your consent (where applicable, for marketing communications or optional features); and (c) our legitimate interests in operating, securing, and improving the Service.'
        )}
      </p>

      <h2 className={sectionTitle}>{t('3. Third-Party Services We Use')}</h2>
      <p className={paragraph}>
        {t(
          'D3 Creator relies on the following third-party services to deliver its features. Each third party is responsible for its own data handling under its own privacy policy.'
        )}
      </p>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t(
            'TikHub — used to collect publicly available profile and post data from Instagram, TikTok, and Douyin.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'BrightData — used to collect publicly available profile and post data from Facebook.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Supabase (PostgreSQL hosting & storage) — used to securely store account information, analytics data, and cached media. Supabase’s data centers operate in the region we select and follow industry-standard security practices.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Vercel — used to host the web application and serve it to your browser.'
          )}
        </li>
      </ul>

      <h2 className={sectionTitle}>{t('4. Data Storage and Security')}</h2>
      <p className={paragraph}>
        {t(
          'Your personal data is stored in a PostgreSQL database hosted by Supabase. We implement appropriate technical and organisational safeguards to protect your information, including:'
        )}
      </p>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t('Encryption of data in transit using TLS / HTTPS')}
        </li>
        <li className={bullet}>
          {t('Encryption of data at rest at the database provider level')}
        </li>
        <li className={bullet}>
          {t('Passwords stored using one-way cryptographic hashing (bcrypt)')}
        </li>
        <li className={bullet}>
          {t(
            'Access controls and authentication for our administrative systems'
          )}
        </li>
        <li className={bullet}>
          {t('Regular monitoring for security incidents')}
        </li>
      </ul>
      <p className={paragraph}>
        {t(
          'While we use commercially reasonable efforts to protect your data, no method of internet transmission or electronic storage is 100% secure. We cannot guarantee absolute security.'
        )}
      </p>

      <h2 className={sectionTitle}>{t('5. Data Retention')}</h2>
      <p className={paragraph}>
        {t(
          'We retain your personal data for as long as your account remains active. If you delete your account, we will delete or anonymise your personal information within ninety (90) days, except where we are required by law to retain it longer (for example, for tax or accounting purposes).'
        )}
      </p>

      <h2 className={sectionTitle}>{t('6. Your Rights')}</h2>
      <p className={paragraph}>
        {t(
          'Subject to applicable law, you have the following rights regarding your personal data:'
        )}
      </p>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t(
            'Right to access — you may request a copy of the personal data we hold about you.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Right to rectification — you may ask us to correct inaccurate or incomplete personal data.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Right to deletion (“right to be forgotten”) — you may request that we delete your personal data.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Right to data portability — you may request to receive your data in a structured, commonly used, machine-readable format.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Right to restrict or object to processing — you may request that we restrict or stop processing your data in certain circumstances.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Right to withdraw consent — where processing is based on your consent, you may withdraw it at any time.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Right to lodge a complaint — you may lodge a complaint with your local data protection authority (in Malaysia, the Personal Data Protection Commissioner).'
          )}
        </li>
      </ul>
      <p className={paragraph}>
        <RichText
          text={t(
            'You can exercise these rights by contacting your agency or by emailing us at {link1}. We will respond to your request within thirty (30) days.'
          )}
          values={{
            link1: (
              <a className={linkClass} href={`mailto:${PRIVACY_EMAIL}`}>
                {PRIVACY_EMAIL}
              </a>
            ),
          }}
        />
      </p>

      <h2 className={sectionTitle}>{t('7. Removing Tracked Profiles')}</h2>
      <p className={paragraph}>
        {t(
          'Because profiles are added and managed by your agency, you can ask your agency to stop tracking any profile at any time. Once a profile is removed, we stop collecting new data for it. Historical analytics snapshots already collected may remain until they are deleted or your D3 Creator account is closed.'
        )}
      </p>
      <p className={paragraph}>
        {t(
          'For public profile tracking, we only collect data that is already public on the platform.'
        )}
      </p>

      <h2 className={sectionTitle}>
        {t('8. Cookies and Tracking Technologies')}
      </h2>
      <p className={paragraph}>
        {t(
          'We use a small number of cookies and similar technologies to operate the Service:'
        )}
      </p>
      <ul className="list-disc pl-6 mb-3">
        <li className={bullet}>
          {t(
            'Strictly necessary cookies — required to keep you logged in and to remember your language and theme preferences. These cannot be disabled.'
          )}
        </li>
        <li className={bullet}>
          {t(
            'Analytics cookies — privacy-friendly analytics to understand how the Service is used in aggregate. No cross-site tracking is performed.'
          )}
        </li>
      </ul>
      <p className={paragraph}>
        {t(
          'You can control cookies through your browser settings. Disabling strictly necessary cookies may prevent the Service from functioning correctly.'
        )}
      </p>

      <h2 className={sectionTitle}>{t('9. International Data Transfers')}</h2>
      <p className={paragraph}>
        {t(
          'Your information may be transferred to and processed in countries other than your country of residence, including the United States and the European Union, where our service providers operate. Where required, we rely on appropriate safeguards such as the European Commission’s Standard Contractual Clauses to protect your personal data during these transfers.'
        )}
      </p>

      <h2 className={sectionTitle}>{t('10. Children’s Privacy')}</h2>
      <p className={paragraph}>
        {t(
          'The Service is not intended for individuals under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us and we will delete the information promptly.'
        )}
      </p>

      <h2 className={sectionTitle}>
        {t('11. Changes to This Privacy Policy')}
      </h2>
      <p className={paragraph}>
        {t(
          'We may update this Privacy Policy from time to time. When we do, we will revise the “Last Updated” date at the top of this page. For material changes, we will provide a more prominent notice (for example, via email or an in-app notification). Your continued use of the Service after the changes take effect constitutes acceptance of the revised policy.'
        )}
      </p>

      <h2 className={sectionTitle}>{t('12. Contact Us')}</h2>
      <p className={paragraph}>
        {t(
          'If you have any questions, concerns, or requests relating to this Privacy Policy or your personal data, please contact us at:'
        )}
      </p>
      <GlassCard variant="base" padding="md" radius="xl" className="my-6">
        <p className="text-body-sm text-fgMuted mb-2">{t('D3 Creator')}</p>
        <p className="text-body-sm text-fgMuted">
          <RichText
            text={t('Email: {link1}')}
            values={{
              link1: (
                <a className={linkClass} href={`mailto:${PRIVACY_EMAIL}`}>
                  {PRIVACY_EMAIL}
                </a>
              ),
            }}
          />
        </p>
      </GlassCard>

      <div className="mt-12 pt-6 border-t border-borderGlass">
        <p className="text-caption text-fgSubtle">
          {t(
            'This Privacy Policy is provided as a general informational template and does not constitute legal advice. You are responsible for ensuring compliance with all laws applicable to your specific operations. We strongly recommend consulting a qualified legal professional before relying on this policy for production use.'
          )}
        </p>
      </div>
    </article>
  );
}
