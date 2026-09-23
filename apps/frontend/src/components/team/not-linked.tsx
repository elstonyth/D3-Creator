/**
 * An approved staff login that is linked to nobody on the board (the person
 * was removed after approval). Nothing to show until an admin links it.
 */

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { Alert } from '@gitroom/frontend/components/ui/alert';

export async function NotLinked() {
  const { t } = await getI18n();
  return (
    <Alert tone="info" title={t('Your account is not linked to anyone yet.')}>
      {t(
        'An admin links each staff login to a person on the work board. Ask them to link yours on the Team page.',
      )}
    </Alert>
  );
}
