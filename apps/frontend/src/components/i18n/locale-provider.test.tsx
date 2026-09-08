/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { LocaleProvider, useI18n } from './locale-provider';
import { LanguageSwitcher } from './language-switcher';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

function Draft() {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  return (
    <label>
      {t('Password')}
      <input value={value} onChange={(e) => setValue(e.target.value)} />
    </label>
  );
}

beforeEach(() => {
  refresh.mockClear();
  document.cookie = 'd3-locale=; Path=/; Max-Age=0';
  document.documentElement.lang = 'en';
});

it('switches both ways, persists the preference and keeps an unsaved draft', () => {
  render(
    <LocaleProvider locale="en">
      <LanguageSwitcher />
      <Draft />
    </LocaleProvider>
  );
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: '未保存的草稿' },
  });
  fireEvent.change(screen.getByLabelText('Interface language'), {
    target: { value: 'zh' },
  });
  expect(document.cookie).toContain('d3-locale=zh');
  expect(document.documentElement.lang).toBe('zh-CN');
  expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe(
    '未保存的草稿'
  );
  expect(refresh).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText('界面语言'), {
    target: { value: 'en' },
  });
  expect(document.cookie).toContain('d3-locale=en');
  expect(document.documentElement.lang).toBe('en');
  expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(
    '未保存的草稿'
  );
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('uses the server preference immediately on a later visit', () => {
  render(
    <LocaleProvider locale="zh">
      <LanguageSwitcher />
      <Draft />
    </LocaleProvider>
  );
  expect((screen.getByLabelText('界面语言') as HTMLSelectElement).value).toBe(
    'zh'
  );
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(screen.getByLabelText('密码')).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
});

it('reconciles a refreshed server preference without remounting drafts', () => {
  const view = render(<LocaleProvider locale="en"><Draft /></LocaleProvider>);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'keep me' } });
  view.rerender(<LocaleProvider locale="zh"><Draft /></LocaleProvider>);
  expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('keep me');
  expect(document.documentElement.lang).toBe('zh-CN');
});

it('adopts a preference changed in another tab when this tab regains focus', () => {
  render(<LocaleProvider locale="en"><Draft /></LocaleProvider>);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'keep me' } });
  document.cookie = 'd3-locale=zh; Path=/';
  fireEvent.focus(window);
  expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('keep me');
  expect(document.documentElement.lang).toBe('zh-CN');
  expect(refresh).toHaveBeenCalledTimes(1);
});
