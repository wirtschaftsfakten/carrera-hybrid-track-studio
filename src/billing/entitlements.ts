import type { GeneratorSettings } from '../lib/storage';
import { LIMITS, type PlanLimits, type Tier } from './plans';

/** Pure Free/Pro rules. No storage, no network: easy to test. */

export interface DailyUsage {
  /** Local date YYYY-MM-DD. */
  day: string;
  generations: number;
}

export const today = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const limitsFor = (tier: Tier): PlanLimits => LIMITS[tier];

export function generationsLeft(tier: Tier, usage: DailyUsage, day = today()): number {
  const limit = limitsFor(tier).generationsPerDay;
  const used = usage.day === day ? usage.generations : 0;
  return Math.max(0, limit - used);
}

export const canGenerate = (tier: Tier, usage: DailyUsage, day = today()): boolean => generationsLeft(tier, usage, day) > 0;

export function recordGeneration(usage: DailyUsage, day = today()): DailyUsage {
  return usage.day === day ? { day, generations: usage.generations + 1 } : { day, generations: 1 };
}

export const canSaveTrack = (tier: Tier, savedCount: number): boolean => savedCount < limitsFor(tier).maxSavedTracks;

export type Feature = 'exportPng' | 'exportPdf' | 'lengthFilter' | 'roomFilter';
export const hasFeature = (tier: Tier, f: Feature): boolean => limitsFor(tier)[f];

/** Settings the tier may actually use (locked options fall back to free values). */
export function effectiveSettings(s: GeneratorSettings, tier: Tier): GeneratorSettings {
  const l = limitsFor(tier);
  return {
    ...s,
    mode: l.modes.includes(s.mode) ? s.mode : 'auto',
    style: l.styles.includes(s.style) ? s.style : l.styles[0],
    maxResults: Math.max(1, Math.min(s.maxResults, l.maxVariants)),
    lengthEnabled: s.lengthEnabled && l.lengthFilter,
    roomEnabled: s.roomEnabled && l.roomFilter,
  };
}

/** Verified entitlement payload as signed by the server (see server/lib/entitlement.mjs). */
export interface EntitlementClaims {
  sub: string;
  tier: Tier;
  src: 'stripe' | 'apple' | 'none';
  /** Expiry, seconds since epoch. */
  exp: number;
  iat: number;
  /** End of the paid period (seconds), for display. */
  periodEnd?: number;
}

export function tierFromClaims(claims: EntitlementClaims | null, accountId: string | null, nowSec = Date.now() / 1000): Tier {
  if (!claims || !accountId) return 'free';
  if (claims.sub !== accountId) return 'free';
  if (claims.exp <= nowSec) return 'free';
  return claims.tier === 'pro' ? 'pro' : 'free';
}
