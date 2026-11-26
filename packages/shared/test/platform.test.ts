import { describe, expect, it } from 'vitest';
import { AVATARS, AVATAR_IDS, announcementUpdateSchema, gameInputSchema, gameUpdateSchema, internalPathSchema, profileUpdateSchema } from '../src/index.ts';

describe('DominicanGames platform contracts', () => {
  it('fills catalog defaults on create but never on partial updates', () => {
    const created = gameInputSchema.parse({ id: 'moto-rd', title: 'Moto RD', status: 'coming_soon' });
    expect(created).toMatchObject({ featured: false, launchPath: null, developer: 'DominicanGames', categories: [] });
    // a PATCH that only changes the status must not reset any other field
    expect(gameUpdateSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
    expect(announcementUpdateSchema.parse({ published: false })).toEqual({ published: false });
  });

  it('only accepts internal launch paths and site images (no open redirects, no external hosts)', () => {
    expect(internalPathSchema.safeParse('/jugar').success).toBe(true);
    expect(internalPathSchema.safeParse('/juegos/moto-rd/jugar').success).toBe(true);
    for (const bad of ['https://evil.example.com', '//evil.example.com', 'javascript:alert(1)', '/\\evil']) expect(internalPathSchema.safeParse(bad).success).toBe(false);
    expect(gameInputSchema.safeParse({ id: 'x-y', title: 'X', status: 'coming_soon', coverImage: 'https://cdn.example.com/a.jpg' }).success).toBe(false);
    expect(gameInputSchema.safeParse({ id: 'Bad Id', title: 'X', status: 'coming_soon' }).success).toBe(false);
  });

  it('defines original preset avatars and validates profile updates', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(AVATAR_IDS).size).toBe(AVATAR_IDS.length);
    expect(profileUpdateSchema.safeParse({ avatar: 'palma', showInRankings: false }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ avatar: 'not-an-avatar' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ avatar: null }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ locale: 'fr' }).success).toBe(false);
  });
});
