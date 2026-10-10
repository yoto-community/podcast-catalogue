/// <reference types="astro/client" />

/// <reference types="vite-plugin-pwa/client" />

interface RegisterSW {
  (options?: { immediate?: boolean; onNeedRefresh?: () => void; onOfflineReady?: () => void }): Promise<ServiceWorkerRegistration | undefined>;
}

declare module "virtual:pwa-register" {
  export const registerSW: RegisterSW;
}
