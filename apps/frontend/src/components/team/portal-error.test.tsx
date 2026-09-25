/** @jest-environment jsdom */
/**
 * When a console or portal page fails, its error screen offers a retry and a
 * reference, never shows the raw database message, and reports client errors
 * (the ones without a server digest) to Sentry.
 */

import { captureException } from '@sentry/nextjs';
import { fireEvent, render, screen } from '@testing-library/react';

import AdminError from '@gitroom/frontend/app/(admin)/error';
import StaffError from '@gitroom/frontend/app/(staff)/error';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const BOUNDARIES = [
  { area: 'admin', PortalError: AdminError },
  { area: 'staff', PortalError: StaffError },
];

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  // Both boundaries log the error on purpose; keep a passing run quiet.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => errorSpy.mockRestore());

it.each(BOUNDARIES)(
  'the $area error screen offers a retry and hides the raw error',
  ({ PortalError }) => {
    const error = Object.assign(new Error('relation "x" does not exist'), {
      digest: 'abc123',
    });
    const retry = jest.fn();
    render(<PortalError error={error} retry={retry} />);

    expect(
      screen.getByRole('heading', { name: 'This page didn’t load' }),
    ).toBeTruthy();
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.getByText('abc123')).toBeTruthy();
    // A digest means it came from the server, which already reported it.
    expect(captureException).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  },
);

it.each(BOUNDARIES)(
  'the $area error screen reports a client error to Sentry',
  ({ PortalError }) => {
    const error = new Error('render failed');
    render(<PortalError error={error} retry={jest.fn()} />);

    expect(captureException).toHaveBeenCalledWith(error);
  },
);
