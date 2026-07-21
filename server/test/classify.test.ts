import { describe, it, expect } from 'vitest';
import { classify, classifyCommonsUpload, editorType } from '../src/classify.js';
import { fx } from './fixtures/recentchange.js';

describe('classify', () => {
  it('keeps a human main-namespace wikipedia edit', () => {
    const r = classify(fx.humanEdit)!;
    expect(r).toMatchObject({
      wiki: 'en.wikipedia.org', lang: 'en',
      title: 'Eiffel Tower', editor_type: 'user', size_delta: 26,
    });
    expect(r.url).toBe('https://en.wikipedia.org/w/index.php?diff=1290022222&oldid=1290011111');
    expect(r.ts).toBe(Date.parse('2026-06-11T10:00:00Z'));
  });
  it('drops non-wikipedia projects', () => expect(classify(fx.wikidataEdit)).toBeNull());
  it('drops talk pages', () => expect(classify(fx.talkEdit)).toBeNull());
  it('drops categorize events', () => expect(classify(fx.categorize)).toBeNull());
  it('flags bots', () => expect(classify(fx.botEdit)!.editor_type).toBe('bot'));
  it('flags temporary accounts as anon', () => expect(editorType(fx.tempAccountEdit)).toBe('anon'));
  it('flags IP users as anon', () => expect(editorType(fx.ipv6Edit)).toBe('anon'));
  it('reports negative size_delta for removals', () =>
    expect(classify(fx.tempAccountEdit)!.size_delta).toBe(-100));
  it('links new pages to the article', () => {
    const r = classify(fx.newPage)!;
    expect(r.url).toBe('https://en.wikipedia.org/wiki/Some_New_Place');
  });
});

describe('classifyCommonsUpload', () => {
  it('keeps a fresh photo upload with page, thumb and editor type', () => {
    const r = classifyCommonsUpload(fx.commonsUpload)!;
    expect(r).toMatchObject({
      title: 'File:Sunset over Lisbon harbour.jpg',
      file: 'Sunset over Lisbon harbour.jpg',
      editor_type: 'user',
    });
    expect(r.url).toBe('https://commons.wikimedia.org/wiki/File:Sunset_over_Lisbon_harbour.jpg');
    expect(r.img).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Sunset_over_Lisbon_harbour.jpg?width=640',
    );
    expect(r.ts).toBe(Date.parse('2026-06-11T10:00:00Z'));
  });
  it('drops overwrites of existing files', () =>
    expect(classifyCommonsUpload(fx.commonsOverwrite)).toBeNull());
  it('drops non-photo file types', () =>
    expect(classifyCommonsUpload(fx.commonsSvgUpload)).toBeNull());
  it('drops wikipedia edits', () => expect(classifyCommonsUpload(fx.humanEdit)).toBeNull());
  it('never matches in the wikipedia classifier', () =>
    expect(classify(fx.commonsUpload)).toBeNull());
});
