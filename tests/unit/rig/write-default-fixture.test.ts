import { it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLottie } from '../../../src/lottie/build';
import { loadSheet } from '../../../src/sheet/load';
import { templateSvg } from '../../../src/sheet/template';
import { ANIMATIONS } from '../../../src/anim';

// tests/fixtures/default-template-idle.json is the build output from before rigs existed.
// The default rig must keep reproducing it exactly. Only (re)write it with WRITE_DEFAULT_FIXTURE=1.
it('default template build matches the pre-rig fixture', () => {
  const path = resolve(process.cwd(), 'tests/fixtures/default-template-idle.json');
  const doc = buildLottie(loadSheet(templateSvg(), 'template.svg'), ANIMATIONS[0], { debug: false });
  if (process.env.WRITE_DEFAULT_FIXTURE || !existsSync(path)) writeFileSync(path, JSON.stringify(doc));
  expect(doc).toEqual(JSON.parse(readFileSync(path, 'utf8')));
});
