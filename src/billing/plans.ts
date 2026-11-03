import type { GeneratorMode, TrackStyle } from '../generator/search';

/**
 * Central Free/Pro configuration. Prices, limits and feature flags live only
 * here; the UI, the pricing page and the server read the same values
 * (server/config.mjs mirrors the product ids).
 */
export type Tier = 'free' | 'pro';
export type BillingPeriod = 'monthly' | 'yearly';

export interface PlanLimits {
  generationsPerDay: number;
  maxSavedTracks: number;
  maxVariants: number;
  modes: GeneratorMode[];
  styles: TrackStyle[];
  lengthFilter: boolean;
  roomFilter: boolean;
  exportPng: boolean;
  exportPdf: boolean;
}

export const LIMITS: Record<Tier, PlanLimits> = {
  free: {
    generationsPerDay: 3,
    maxSavedTracks: 5,
    maxVariants: 3,
    modes: ['auto', 'custom'],
    styles: ['varied'],
    lengthFilter: false,
    roomFilter: true,
    exportPng: false,
    exportPdf: false,
  },
  pro: {
    generationsPerDay: Infinity,
    maxSavedTracks: Infinity,
    maxVariants: 24,
    modes: ['auto', 'custom', 'max'],
    styles: ['varied', 'fast', 'twisty', 'compact'],
    lengthFilter: true,
    roomFilter: true,
    exportPng: true,
    exportPdf: true,
  },
};

export interface PriceDef {
  period: BillingPeriod;
  /** Amount in cents, gross, EUR. */
  amountCents: number;
  currency: 'EUR';
  /** App Store Connect product id (auto-renewable subscription). */
  appleProductId: string;
}

export const PRICES: Record<BillingPeriod, PriceDef> = {
  monthly: {
    period: 'monthly',
    amountCents: 99,
    currency: 'EUR',
    appleProductId: import.meta.env.VITE_APPLE_PRODUCT_MONTHLY || 'trackstudio.pro.monthly',
  },
  yearly: {
    period: 'yearly',
    amountCents: 599,
    currency: 'EUR',
    appleProductId: import.meta.env.VITE_APPLE_PRODUCT_YEARLY || 'trackstudio.pro.yearly',
  },
};

export function formatPrice(p: PriceDef): string {
  return (p.amountCents / 100).toLocaleString('de-DE', { style: 'currency', currency: p.currency });
}

/** Rows for the pricing table. */
export const FEATURE_ROWS: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: 'Streckengenerierungen', free: `${LIMITS.free.generationsPerDay} pro Tag`, pro: 'unbegrenzt' },
  { label: 'Eigene Streckenteile verwalten', free: true, pro: true },
  { label: 'Strecken ansehen und im Editor bauen', free: true, pro: true },
  { label: 'Modi Automatisch und Benutzerdefiniert', free: true, pro: true },
  { label: 'Modus Maximale Ausnutzung', free: false, pro: true },
  { label: 'Streckenstile (schnell, kurvenreich, kompakt)', free: false, pro: true },
  { label: 'Längenfilter', free: false, pro: true },
  { label: 'Varianten pro Durchlauf', free: `${LIMITS.free.maxVariants}`, pro: `bis ${LIMITS.pro.maxVariants}` },
  { label: 'Gespeicherte Strecken', free: `${LIMITS.free.maxSavedTracks}`, pro: 'unbegrenzt' },
  { label: 'Export als PNG und PDF', free: false, pro: true },
];
