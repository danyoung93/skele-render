import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serialize } from '../../../src/editor/serialize';
import { fixtureDoc } from './fixture-doc';

// tests/fixtures/editor.svg is serialize(fixtureDoc()); regenerate with UPDATE_FIXTURES=1.
it('editor.svg fixture matches serialize(fixtureDoc())', async () => {
  const path = resolve(process.cwd(), 'tests/fixtures/editor.svg');
  const text = serialize(fixtureDoc());
  if (process.env.UPDATE_FIXTURES) (await import('node:fs')).writeFileSync(path, text);
  expect(readFileSync(path, 'utf8')).toBe(text);
});
