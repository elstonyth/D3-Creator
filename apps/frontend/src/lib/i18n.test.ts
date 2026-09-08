import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { chineseMessages, localeCookie, parseLocale, translate } from './i18n';

it('defaults unsupported or missing locale cookies to English', () => {
  for (const value of [undefined, null, '', 'zh-CN', 'fr', 'ZH'])
    expect(parseLocale(value)).toBe('en');
  expect(parseLocale('zh')).toBe('zh');
  expect(localeCookie('zh', true)).toBe(
    'd3-locale=zh; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
  );
  expect(localeCookie('en', false)).not.toContain('Secure');
});

it('interpolates values without recursively translating or interpreting user content', () => {
  expect(
    translate('zh', 'Based on {lesson}', { lesson: 'My <lesson> {value}' })
  ).toBe('依据 My <lesson> {value}');
  expect(translate('en', '{count} results', { count: 0 })).toBe('0 results');
  expect(translate('zh', 'Unknown product label')).toBe(
    'Unknown product label'
  );
});

it('preserves every interpolation placeholder in Chinese translations', () => {
  const tokens = (s: string) =>
    [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const invalid = Object.entries(chineseMessages).filter(
    ([en, zh]) =>
      !zh.trim() || JSON.stringify(tokens(en)) !== JSON.stringify(tokens(zh))
  );
  expect(invalid).toEqual([]);
});

it('includes Chinese copy for every literal translation call in the website', () => {
  const missing = new Set<string>();
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(file);
        continue;
      }
      if (!/\.tsx?$/.test(file) || /\.(test|spec)\./.test(file)) continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 't' &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          const key = node.arguments[0].text;
          if (!Object.hasOwn(chineseMessages, key)) missing.add(key);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(join(__dirname, '..'));
  expect([...missing].sort()).toEqual([]);
});
