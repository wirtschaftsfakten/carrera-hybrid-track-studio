/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_ENTITLEMENT_PUBLIC_JWK?: string;
  readonly VITE_APPLE_PRODUCT_MONTHLY?: string;
  readonly VITE_APPLE_PRODUCT_YEARLY?: string;
  readonly VITE_TERMS_URL?: string;
  readonly VITE_PRIVACY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
