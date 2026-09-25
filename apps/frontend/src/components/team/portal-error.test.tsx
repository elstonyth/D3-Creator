/** @jest-environment jsdom */
/**
 * When a console or portal page fails, its error screen offers a retry and a
 * reference, and never shows the raw database message.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import AdminError from '@gitroom/frontend/app/(admin)/error';
import StaffError from '@gitroom/frontend/app/(staff)/error';

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  // Both boundaries log the error on purpose; keep a passing run quiet.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => errorSpy.mockRestore());

it.each([
  { area: 'admin', PortalError: AdminError },
  { area: 'staff', PortalError: StaffError },
])(
  'the $area error screen offers a retry and hides the raw error',
  ({ PortalError }) => {
    const error = Object.assign(new Error('relation "x" does not exist'), {
      digest: 'abc123',
    });
    const reset = jest.fn();
    render(<PortalError error={error} reset={reset} />);

    expect(
      screen.getByRole('heading', { name: 'This page didn’t load' }),
    ).toBeTruthy();
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.getByText('abc123')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  },
);
