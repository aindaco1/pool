import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveState } from '../../worker/src/campaigns.js';

describe('getEffectiveState', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes legacy pre state to upcoming before launch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-27T05:30:00Z'));

    expect(
      getEffectiveState({
        state: 'pre',
        start_date: '2026-03-27',
        goal_deadline: '2026-03-30'
      })
    ).toBe('upcoming');
  });

  it('treats upcoming campaigns as live once the platform start time passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-27T06:30:00Z'));

    expect(
      getEffectiveState({
        state: 'upcoming',
        start_date: '2026-03-27',
        goal_deadline: '2026-03-30'
      })
    ).toBe('live');
  });

  it('treats live campaigns as post once the platform deadline passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-28T06:00:00Z'));

    expect(
      getEffectiveState({
        state: 'live',
        start_date: '2026-03-20',
        goal_deadline: '2026-03-27'
      })
    ).toBe('post');
  });

  it('honors a non-Denver platform timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T15:30:00Z'));

    expect(
      getEffectiveState({
        state: 'upcoming',
        start_date: '2026-04-21',
        goal_deadline: '2026-04-30'
      }, { PLATFORM_TIMEZONE: 'Asia/Tokyo' })
    ).toBe('live');
  });
});
