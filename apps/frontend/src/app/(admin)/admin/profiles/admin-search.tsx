'use client';

/**
 * AdminSearchForm — client search that soft-navigates with scroll preserved.
 *
 * A native <form method="GET"> triggers a full document navigation that resets
 * scroll to the top. This pushes the same ?q= URL via the App Router with
 * { scroll: false } so the server still re-filters but the viewport stays put,
 * matching the platform chips. The active platform filter is carried through.
 */

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@gitroom/frontend/components/ui/input';
import { Button } from '@gitroom/frontend/components/ui/button';

export function AdminSearchForm({
  defaultQuery,
  platform,
}: {
  defaultQuery: string;
  platform: string;
}) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState(defaultQuery);

  function push(next: string) {
    const params = new URLSearchParams();
    const trimmed = next.trim().slice(0, 80);
    if (trimmed) params.set('q', trimmed);
    if (platform) params.set('platform', platform);
    const qs = params.toString();
    router.push(qs ? `/admin/profiles?${qs}` : '/admin/profiles', {
      scroll: false,
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    push(q);
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="flex flex-wrap items-center gap-2"
    >
      <label htmlFor={id} className="sr-only">
        Search accounts by creator name or handle
      </label>
      <Input
        id={id}
        name="q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={80}
        placeholder="Creator name or handle"
        className="w-full sm:max-w-[340px]"
      />
      <Button type="submit" variant="secondary">
        Search
      </Button>
      {defaultQuery && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setQ('');
            push('');
          }}
        >
          Clear
        </Button>
      )}
    </form>
  );
}
