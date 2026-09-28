import { describe, it, expect } from 'vitest';
import { classify, classifyCommonsUpload, editorType, isRevert } from '../src/classify.js';
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

describe('isRevert', () => {
  it('recognises the summaries the revert tools write', () => {
    // Sampled from the live feed on 27 September 2026.
    expect(isRevert('Undid revision [[Special:Diff/1377036483|1377036483]] by [[Special:Contributions/~2026-52030-02|x]]')).toBe(true);
    expect(isRevert('Reverted edits by 203.0.113.7 to last version by Someone')).toBe(true);
    expect(isRevert('Reverted 1 edit by Example (talk)')).toBe(true);
    expect(isRevert('Reverted good faith edits by Newcomer')).toBe(true);
    expect(isRevert('Reverted to revision 1377049192 by Bot')).toBe(true);
    expect(isRevert('rvv')).toBe(true);
    expect(isRevert('/* History */ Undid revision 12345 by Someone')).toBe(true);
  });

  it('does not count an edit that merely mentions reverting', () => {
    expect(isRevert('expanded the section on revert wars')).toBe(false);
    expect(isRevert('I will revert this if nobody objects')).toBe(false);
    expect(isRevert('added a source')).toBe(false);
    expect(isRevert('')).toBe(false);
    expect(isRevert(undefined)).toBe(false);
  });

  it('flags reverts on the English Wikipedia only', () => {
    const base = {
      type: 'edit', namespace: 0, title: 'Berlin',
      length: { old: 10, new: 12 }, revision: { old: 1, new: 2 },
      comment: 'Undid revision 999 by Someone',
    };
    expect(classify({ ...base, server_name: 'en.wikipedia.org' })?.is_revert).toBe(true);
    // Same summary text, different edition: the detector has no German patterns, so
    // claiming to know is worse than staying silent.
    expect(classify({ ...base, server_name: 'de.wikipedia.org' })?.is_revert).toBeUndefined();
  });
});
