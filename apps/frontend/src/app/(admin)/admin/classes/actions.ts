'use server';

import { localizeAdminError } from '../localize-error';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { parseDriveFileId } from '@gitroom/frontend/lib/drive';

export interface ClassResult {
  ok: boolean;
  message: string;
}

function err(e: unknown): string {
  return e instanceof Error ? e.message : 'Unexpected error';
}

function readFields(fd: FormData) {
  const title = String(fd.get('title') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim() || null;
  const driveFileId = parseDriveFileId(String(fd.get('drive_link') ?? ''));
  const visibility = fd.get('visibility') === 'public' ? 'public' : 'members';
  const is_published = fd.get('is_published') === 'on';
  const allow_download = fd.get('allow_download') === 'on';
  const sort_order =
    Number.parseInt(String(fd.get('sort_order') ?? '0'), 10) || 0;
  return {
    title,
    description,
    driveFileId,
    visibility,
    is_published,
    allow_download,
    sort_order,
  };
}

export async function createClassVideo(
  _prev: ClassResult | null,
  fd: FormData,
): Promise<ClassResult> {
  const { t, locale } = await getI18n();
  try {
    await requireAdmin();
    const f = readFields(fd);
    if (!f.title) return { ok: false, message: t('Title is required.') };
    if (!f.driveFileId)
      return {
        ok: false,
        message: t('Could not read a Google Drive file ID from that link.'),
      };
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('class_video').insert({
      title: f.title,
      description: f.description,
      drive_file_id: f.driveFileId,
      visibility: f.visibility,
      is_published: f.is_published,
      allow_download: f.allow_download,
      sort_order: f.sort_order,
    });
    if (error)
      return {
        ok: false,
        message: localizeAdminError(error.message, locale, t),
      };
    revalidatePath('/admin/classes');
    revalidatePath('/classes');
    return { ok: true, message: t('Added "{value1}".', { value1: f.title }) };
  } catch (e) {
    return { ok: false, message: localizeAdminError(err(e), locale, t) };
  }
}

export async function updateClassVideo(
  _prev: ClassResult | null,
  fd: FormData,
): Promise<ClassResult> {
  const { t, locale } = await getI18n();
  try {
    await requireAdmin();
    const id = String(fd.get('id') ?? '');
    if (!isUuid(id)) return { ok: false, message: t('Invalid id.') };
    const f = readFields(fd);
    if (!f.title) return { ok: false, message: t('Title is required.') };
    if (!f.driveFileId)
      return {
        ok: false,
        message: t('Could not read a Google Drive file ID from that link.'),
      };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('class_video')
      .update({
        title: f.title,
        description: f.description,
        drive_file_id: f.driveFileId,
        visibility: f.visibility,
        is_published: f.is_published,
        allow_download: f.allow_download,
        sort_order: f.sort_order,
      })
      .eq('id', id)
      .select('id');
    if (error)
      return {
        ok: false,
        message: localizeAdminError(error.message, locale, t),
      };
    // Stale id matched nothing — don't confirm a mutation that never happened.
    if (!data || data.length === 0)
      return { ok: false, message: t('Class not found.') };
    revalidatePath('/admin/classes');
    revalidatePath('/classes');
    return { ok: true, message: t('Saved.') };
  } catch (e) {
    return { ok: false, message: localizeAdminError(err(e), locale, t) };
  }
}

export async function deleteClassVideo(id: string): Promise<ClassResult> {
  const { t, locale } = await getI18n();
  try {
    await requireAdmin();
    if (!isUuid(id)) return { ok: false, message: t('Invalid id.') };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('class_video')
      .delete()
      .eq('id', id)
      .select('id');
    if (error)
      return {
        ok: false,
        message: localizeAdminError(error.message, locale, t),
      };
    if (!data || data.length === 0)
      return { ok: false, message: t('Class not found.') };
    revalidatePath('/admin/classes');
    revalidatePath('/classes');
    return { ok: true, message: t('Deleted.') };
  } catch (e) {
    return { ok: false, message: localizeAdminError(err(e), locale, t) };
  }
}
