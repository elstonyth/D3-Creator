'use client';

import { useState } from 'react';
import { ContentThumb } from './content-thumb';
import { ContentLightbox } from './content-lightbox';
import type { ContentPost } from './content-data';

interface ContentGridProps {
  /** Already ordered newest-first by the server page. */
  posts: ContentPost[];
}

/**
 * The post wall, plus the single lightbox it opens. One dialog for the whole
 * grid rather than one per tile: only one post is ever open.
 */
export function ContentGrid({ posts }: ContentGridProps) {
  const [open, setOpen] = useState<ContentPost | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {posts.map((post) => (
          <ContentThumb key={post.id} post={post} onOpen={setOpen} />
        ))}
      </div>
      <ContentLightbox post={open} onClose={() => setOpen(null)} />
    </>
  );
}
