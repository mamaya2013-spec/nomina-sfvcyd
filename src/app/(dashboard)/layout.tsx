"use client";

import dynamic from "next/dynamic";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Activity,
  Calendar,
  CreditCard,
  FileCheck,
  FolderOpen,
  BarChart3,
  Network,
  Settings,
  LogOut,
  Bell,
  Menu,
  X,
  Search,
} from "lucide-react";
import styles from "./layout.module.css";

const CommandPalette = dynamic(() => import("@/components/ui/CommandPalette"), { ssr: false });
const NotificationPanel = dynamic(() => import("@/components/ui/NotificationPanel"), { ssr: false });
import { SemesterProvider, useSemester } from "@/lib/contexts/SemesterContext";

interface MenuItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number }>;
}

const menuItems: MenuItem[] = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Becarios", path: "/dashboard/becarios", icon: Users },
  { name: "Monotributistas", path: "/dashboard/monotributistas", icon: Briefcase },
  { name: "Movimientos", path: "/dashboard/movimientos", icon: Activity },
  { name: "Semestres", path: "/dashboard/montos", icon: Calendar },
  { name: "Órdenes de Comp.", path: "/dashboard/ordenes", icon: CreditCard },
  { name: "Devengamientos", path: "/dashboard/liquidaciones", icon: FileCheck },
  { name: "Documentos", path: "/dashboard/documentos", icon: FolderOpen },
  { name: "Reportes", path: "/dashboard/reportes", icon: BarChart3 },
  { name: "Organigrama", path: "/dashboard/organigrama", icon: Network },
  { name: "Configuración", path: "/dashboard/configuracion", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SemesterProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SemesterProvider>
  );
}

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userName, setUserName] = useState<string>("Cargando...");
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { semesters, selectedSemester, selectSemester, loading: loadingSemesters } = useSemester();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserName(user.user_metadata?.nombre_completo || user.email || "Usuario");
      }
    };
    fetchUser();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  };

  const getPageTitle = () => {
    const activeItem = menuItems.find((item) => item.path === pathname);
    return activeItem ? activeItem.name : "Sistema de Nóminas";
  };

  const triggerSearch = () => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  return (
    <div className={styles.layout}>
      {/* Desktop & Tablet Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logoContainer}>
            <Image
              src="/logo_ok.png"
              alt="Logo Secretaría"
              width={36}
              height={36}
              className={styles.logoImage}
              priority
            />
            <div className={styles.logoTextGroup}>
              <span className={styles.logoTitle}>SFVCyD</span>
              <span className={styles.logoSubtitle}>Fortalecimiento Vecinal, Cultura y Deportes</span>
            </div>
          </div>
        </div>

        <nav className={styles.sidebarMenu}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ""}`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            onClick={handleLogout}
            className={styles.menuItem}
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main App Container */}
      <div className={styles.mainContainer}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={styles.toggleButton}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className={styles.pageTitle}>{getPageTitle()}</h1>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.semesterSelectorWrapper}>
              <Calendar size={14} className="text-secondary" />
              <select
                className={styles.semesterSelect}
                value={selectedSemester?.id || ""}
                onChange={(e) => selectSemester(e.target.value)}
                disabled={loadingSemesters}
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre_display} {s.bloqueado ? " 🔒 (Historial)" : " 🟢 (Activo)"}
                  </option>
                ))}
              </select>
            </div>

            <button className={styles.actionButton} title="Buscar (Cmd+K)" onClick={triggerSearch}>
              <Search size={20} />
            </button>

            <div style={{ position: "relative" }}>
              <button
                className={styles.actionButton}
                title="Notificaciones"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Bell size={20} />
                <div className={styles.notificationBadge} />
              </button>
              {notificationsOpen && (
                <NotificationPanel onClose={() => setNotificationsOpen(false)} />
              )}
            </div>

            <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-secondary)" }}>
              {userName}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className={styles.content}>{children}</main>

        {/* Bottom Nav (Mobile) */}
        <nav className={styles.bottomNav}>
          {menuItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`${styles.bottomItem} ${isActive ? styles.bottomItemActive : ""}`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Command Palette (Spotlight Search) */}
      <CommandPalette />
    </div>
  );
}
