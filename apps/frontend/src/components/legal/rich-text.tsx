import { Fragment, type ReactNode } from 'react';

/** Keep links in their translated sentence without translating their destinations. */
export function RichText({
  text,
  values,
}: {
  text: string;
  values: Record<string, ReactNode>;
}) {
  return text
    .split(/(\{\w+\})/g)
    .map((part, index) => (
      <Fragment key={index}>{values[part.slice(1, -1)] ?? part}</Fragment>
    ));
}
