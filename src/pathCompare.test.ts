import { describe, it, expect } from 'vitest';
import { getAtPath, compareWatchedPaths, deepEqual } from './pathCompare';

describe('Path Comparison Engine', () => {
  const data = {
    user: { id: 1, profile: { name: 'Gemini' } },
    items: [{ id: 'a', val: 10 }, { id: 'b', val: 20 }]
  };

  it('should extract nested values correctly (getAtPath)', () => {
    expect(getAtPath(data, 'user.profile.name')).toBe('Gemini');
    expect(getAtPath(data, 'items[1].val')).toBe(20);
  });

  it('should detect stability in watched paths', () => {
    const nextData = { ...data, user: { ...data.user, profile: { name: 'Gemini' } } };
    const result = compareWatchedPaths(data, nextData, ['user.profile.name']);
    
    expect(result.watchedEqual).toBe(true);
    expect(result.watchedStable).toContain('user.profile.name');
  });

  it('should detect changes in watched paths', () => {
    const nextData = { ...data, user: { ...data.user, id: 2 } };
    const result = compareWatchedPaths(data, nextData, ['user.id']);
    
    expect(result.watchedEqual).toBe(false);
    expect(result.watchedChanged).toContain('user.id');
  });
});