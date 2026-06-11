import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

self.addEventListener("push", (event: any) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Notificación de Nómina";
    const options = {
      body: data.body || "Tienes una nueva alerta en el sistema.",
      icon: "/logo_ok.png",
      badge: "/logo_ok.png",
      data: {
        url: data.url || "/dashboard",
      },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Error displaying push notification:", err);
  }
});

self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      const url = event.notification.data.url;
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
