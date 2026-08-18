import { describe, expect, it } from 'vitest';
import { watchingLabel } from '../src/watching';

describe('watchingLabel', () => {
  it('hides when the server does not send the field', () => {
    expect(watchingLabel(undefined)).toBeNull();
  });

  it('hides when the viewer is alone (or the count is degenerate)', () => {
    expect(watchingLabel(0)).toBeNull();
    expect(watchingLabel(1)).toBeNull();
    expect(watchingLabel(NaN)).toBeNull();
    expect(watchingLabel(-3)).toBeNull();
  });

  it('shows a plural label from two viewers up', () => {
    expect(watchingLabel(2)).toBe('2 people watching now');
    expect(watchingLabel(347)).toBe('347 people watching now');
  });

  it('floors fractional counts rather than inventing viewers', () => {
    expect(watchingLabel(2.9)).toBe('2 people watching now');
  });
});
