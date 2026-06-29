'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
import {
  createClassVideo,
  updateClassVideo,
  deleteClassVideo,
} from './actions';

interface Video {
  id: string;
  title: string;
  description: string | null;
  drive_file_id: string;
  visibility: string;
  is_published: boolean;
  allow_download: boolean;
  sort_order: number;
}

export function ClassManager({ videos }: { videos: Video[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onCreate(fd: FormData) {
    setMsg(null);
    setPendingId('new');
    try {
      const res = await createClassVideo(null, fd);
      setMsg(res.message);
      if (res.ok) router.refresh();
    } finally {
      // Always clear pending — a rejected action must not strand the button.
      setPendingId(null);
    }
  }
  async function onUpdate(fd: FormData) {
    setMsg(null);
    const id = String(fd.get('id') ?? '');
    setPendingId(id);
    try {
      const res = await updateClassVideo(null, fd);
      setMsg(res.message);
      if (res.ok) router.refresh();
    } finally {
      setPendingId(null);
    }
  }
  async function onDelete(id: string) {
    if (!confirm('Delete this class?')) return;
    setMsg(null);
    const res = await deleteClassVideo(id);
    setMsg(res.message);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {msg && (
        <p className="text-caption text-aurora-cta" role="status">
          {msg}
        </p>
      )}

      {/* Add new */}
      <form
        action={onCreate}
        className="glass-elevated rounded-2xl p-6 flex flex-col gap-3"
      >
        <h2 className="text-section text-fg">Add a class</h2>
        <Input name="title" required placeholder="Title" maxLength={200} />
        <Input
          name="description"
          placeholder="Description (optional)"
          maxLength={500}
        />
        <Input name="drive_link" required placeholder="Google Drive link" />
        <div className="flex flex-wrap gap-4 text-label text-fgMuted items-center">
          <label className="flex items-center gap-2">
            Visibility
            <select
              name="visibility"
              className="bg-canvas border border-borderGlass rounded-md px-2 py-1"
            >
              <option value="members">Members</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_published" /> Visible
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="allow_download" /> Allow download
          </label>
          <label className="flex items-center gap-2">
            Order <Input name="sort_order" defaultValue="0" className="w-16" />
          </label>
        </div>
        <Button type="submit" disabled={pendingId === 'new'} className="w-fit">
          Add class
        </Button>
      </form>

      {/* Existing */}
      <div className="flex flex-col gap-3">
        {videos.map((v) => (
          <form
            key={v.id}
            action={onUpdate}
            className="glass-elevated rounded-2xl p-5 flex flex-col gap-3"
          >
            <input type="hidden" name="id" value={v.id} />
            <Input
              name="title"
              defaultValue={v.title}
              required
              maxLength={200}
            />
            <Input
              name="description"
              defaultValue={v.description ?? ''}
              placeholder="Description"
              maxLength={500}
            />
            <Input
              name="drive_link"
              defaultValue={`https://drive.google.com/file/d/${v.drive_file_id}/view`}
              required
            />
            <div className="flex flex-wrap gap-4 text-label text-fgMuted items-center">
              <label className="flex items-center gap-2">
                Visibility
                <select
                  name="visibility"
                  defaultValue={v.visibility}
                  className="bg-canvas border border-borderGlass rounded-md px-2 py-1"
                >
                  <option value="members">Members</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_published"
                  defaultChecked={v.is_published}
                />{' '}
                Visible
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="allow_download"
                  defaultChecked={v.allow_download}
                />{' '}
                Allow download
              </label>
              <label className="flex items-center gap-2">
                Order{' '}
                <Input
                  name="sort_order"
                  defaultValue={String(v.sort_order)}
                  className="w-16"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={pendingId === v.id}
                className="w-fit"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDelete(v.id)}
                className="w-fit text-danger-fg"
              >
                Delete
              </Button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
