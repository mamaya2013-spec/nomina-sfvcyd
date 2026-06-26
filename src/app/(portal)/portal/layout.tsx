import type { Metadata } from "next";
import { PortalAuthProvider } from "@/lib/contexts/PortalAuthContext";
import { PortalFilterProvider } from "@/lib/contexts/PortalFilterContext";
import { SemesterProvider } from "@/lib/contexts/SemesterContext";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import PortalLayoutClient from "./PortalLayoutClient";

export const metadata: Metadata = {
  title: "Portal de Responsables - NOMINA SFVCyD",
  description: "Acceso ejecutivo para responsables de área - Secretaría de Fortalecimiento Vecinal, Cultura y Deportes",
  manifest: "/manifest-portal.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Portal NOMINA",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SemesterProvider>
        <PortalAuthProvider>
          <PortalFilterProvider>
            <PortalLayoutClient>{children}</PortalLayoutClient>
          </PortalFilterProvider>
        </PortalAuthProvider>
      </SemesterProvider>
    </ThemeProvider>
  );
}
