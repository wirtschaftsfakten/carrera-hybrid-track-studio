import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Bridge to the StoreKit 2 plugin in ios/App/App/StorePlugin.swift.
 * Only available inside the native iOS app.
 */
export interface StoreProduct {
  id: string;
  displayName: string;
  displayPrice: string;
  period: string;
}

export interface StorePlugin {
  getProducts(opts: { ids: string[] }): Promise<{ products: StoreProduct[] }>;
  /** appAccountToken links the purchase to the server account (UUID). */
  purchase(opts: { id: string; appAccountToken: string }): Promise<{ status: 'purchased' | 'pending' | 'cancelled'; signedTransaction?: string }>;
  /** Syncs with the App Store and returns all current subscription transactions. */
  restore(): Promise<{ signedTransactions: string[] }>;
  manageSubscriptions(): Promise<void>;
}

export const Store = registerPlugin<StorePlugin>('TrackStudioStore');

export const isNativeIOS = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export const isNative = (): boolean => Capacitor.isNativePlatform();
