import * as React from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

/**
 * Table shell. The wrapper is the important part: a wide table must scroll
 * inside its own box, never widen the page and give the whole document a
 * horizontal scrollbar.
 */
export function TableWrap({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-2xl border border-line bg-surface',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn('w-full border-collapse text-body-sm', className)}
      {...props}
    />
  );
}

export function Th({
  className,
  numeric = false,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-line bg-surface-subtle px-4 py-3',
        'text-micro font-medium uppercase text-fg-subtle',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'border-b border-line-subtle px-4 py-3 align-middle text-fg',
        numeric && 'tnum text-right',
        className,
      )}
      {...props}
    />
  );
}

export function Tr({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'transition-colors duration-150 ease-out hover:bg-white/[0.025] last:[&>td]:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

/** Rank cell for leaderboards — fixed width so digits never shift the column. */
export function Rank({ n }: { n: number }) {
  return (
    <span className="tnum inline-block w-6 text-caption text-fg-subtle">
      {String(n).padStart(2, '0')}
    </span>
  );
}
