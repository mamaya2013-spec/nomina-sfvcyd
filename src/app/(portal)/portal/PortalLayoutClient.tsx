"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Activity,
  FolderOpen,
  BarChart3,
  LogOut,
  Menu,
  X,
  Building,
  Layers,
  Calendar,
  Bell,
  Sun,
  Moon,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle,
} from "lucide-react";
import { usePortalAuth } from "@/lib/contexts/PortalAuthContext";
import { usePortalFilter } from "@/lib/contexts/PortalFilterContext";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { Command } from "cmdk";
import styles from "./layout.module.css";

interface MenuItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number }>;
}

const menuItems: MenuItem[] = [
  { name: "Dashboard", path: "/portal/dashboard", icon: LayoutDashboard },
  { name: "Mis Becarios", path: "/portal/becarios", icon: Users },
  { name: "Mis Monotributistas", path: "/portal/monotributistas", icon: Briefcase },
  { name: "Movimientos", path: "/portal/movimientos", icon: Activity },
  { name: "Campañas y Docs", path: "/portal/campanas", icon: FolderOpen },
  { name: "Analíticas", path: "/portal/analiticas", icon: BarChart3 },
  { name: "Categorías y Montos", path: "/portal/montos", icon: Layers },
];

export default function PortalLayoutClient({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = usePortalAuth();
  const {
    selectedSubsecretariaId,
    selectedAreaId,
    setSelectedSubsecretariaId,
    setSelectedAreaId,
    availableSubsecretarias,
    availableAreas,
    loadingFilters,
  } = usePortalFilter();

  const { semesters, selectedSemester, selectSemester, loading: loadingSemesters } = useSemester();
  const { theme, toggleTheme } = useTheme();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Search Palette State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Notifications State
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load read notifications from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("portal_read_notifs");
    if (saved) {
      try {
        setReadNotifIds(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Fetch alerts & recent movements for notifications
  useEffect(() => {
    if (!selectedSemester || !user) return;
    const semestreId = selectedSemester.id;
    async function loadNotifications() {
      try {
        const url = `/api/portal/dashboard?semestre_id=${semestreId}&subsecretaria_id=${selectedSubsecretariaId}&area_id=${selectedAreaId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const items: any[] = [];
          
          // Map alerts (rejected docs & insurance expirations)
          (data.alertsList || []).forEach((alert: any) => {
            items.push({
              id: alert.id,
              type: alert.tipo || "alerta",
              title: alert.tipo === "seguro" ? "Vencimiento de Seguro" : "Documento Rechazado",
              message: alert.message,
              time: new Date(),
              severity: alert.severity,
              link: alert.tipo_persona === "becario" ? `/portal/becarios?id=${alert.persona_id}` : `/portal/monotributistas?id=${alert.persona_id}`,
            });
          });

          // Map recent movements (last 7 days)
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          (data.recentActivity || []).forEach((act: any) => {
            const actDate = new Date(act.fecha);
            if (actDate >= sevenDaysAgo) {
              items.push({
                id: act.id,
                type: "movimiento",
                title: act.tipo_movimiento === "alta" ? "Nueva Alta" : act.tipo_movimiento === "baja" ? "Baja Registrada" : "Cambio de Datos",
                message: `${act.nombre_persona}: ${act.descripcion}`,
                time: actDate,
                severity: act.tipo_movimiento === "baja" ? "danger" : act.tipo_movimiento === "alta" ? "success" : "info",
                link: act.tipo_persona === "becario" ? `/portal/becarios?id=${act.persona_id}` : `/portal/monotributistas?id=${act.persona_id}`,
              });
            }
          });

          setNotifications(items);
        }
      } catch (err) {
        console.error("Error loading notifications:", err);
      }
    }
    loadNotifications();
  }, [selectedSemester, selectedSubsecretariaId, selectedAreaId, user]);

  // Keyboard shortcut for Cmd+K search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Live search query handler
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await fetch(`/api/portal/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleMarkAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadNotifIds(allIds);
    localStorage.setItem("portal_read_notifs", JSON.stringify(allIds));
  };

  const navigateSearch = (path: string) => {
    router.push(path);
    setSearchOpen(false);
    setSearchQuery("");
  };

  const getPageTitle = () => {
    const activeItem = menuItems.find((item) => item.path === pathname);
    return activeItem ? activeItem.name : "Portal Responsables";
  };

  const unreadCount = notifications.filter((n) => !readNotifIds.includes(n.id)).length;

  if (loading) return null;

  return (
    <div className={styles.layout}>
      {/* Sidebar Desktop */}
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
              <span className={styles.logoTitle}>PORTAL</span>
              <span className={styles.logoSubtitle}>Responsables de Área</span>
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
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <span className={styles.userName} title={user?.nombre_completo}>
              {user?.nombre_completo}
            </span>
            <span className={styles.userRole}>Responsable</span>
          </div>
          <button onClick={logout} className={styles.logoutButton}>
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className={styles.mobileHeader}>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={styles.menuToggle}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div className={styles.mobileLogo}>
          <span className={styles.logoTitle}>PORTAL RESPONSABLES</span>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className={styles.mobileNavContainer}>
          <div className={styles.mobileNav}>
            <nav className={styles.mobileMenu}>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ""}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={20} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
            <div className={styles.mobileNavFooter}>
              <div className={styles.userInfo} style={{ marginBottom: "16px" }}>
                <span className={styles.userName}>{user?.nombre_completo}</span>
                <span className={styles.userRole}>Responsable</span>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className={styles.logoutButton}
                style={{ width: "100%" }}
              >
                <LogOut size={18} />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
          <div
            className={styles.mobileNavOverlay}
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Right Content Area */}
      <div className={styles.mainContentWrapper}>
        {/* Top Header Filter Bar */}
        <header className={styles.topHeader}>
          <div className={styles.headerLeft}>
            <h1 className={styles.pageTitle}>{getPageTitle()}</h1>
          </div>

          <div className={styles.headerRight}>
            {/* Semester Selector */}
            <div className={styles.filterGroup}>
              <Calendar size={16} className={styles.filterIcon} />
              <select
                value={selectedSemester?.id || ""}
                onChange={(e) => selectSemester(e.target.value)}
                className={styles.headerSelect}
                disabled={loadingSemesters}
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre_display} {s.bloqueado ? "🔒 (Historial)" : "🟢 (Activo)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Subsecretaría Selector */}
            {availableSubsecretarias.length > 0 && (
              <div className={styles.filterGroup}>
                <Building size={16} className={styles.filterIcon} />
                <select
                  value={selectedSubsecretariaId}
                  onChange={(e) => setSelectedSubsecretariaId(e.target.value)}
                  className={styles.headerSelect}
                >
                  <option value="all">Todas las Subsecretarías</option>
                  {availableSubsecretarias.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Area Selector */}
            {availableAreas.length > 0 && (
              <div className={styles.filterGroup}>
                <Layers size={16} className={styles.filterIcon} />
                <select
                  value={selectedAreaId}
                  onChange={(e) => setSelectedAreaId(e.target.value)}
                  className={styles.headerSelect}
                  disabled={loadingFilters}
                >
                  <option value="all">Todas las Áreas</option>
                  {availableAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Search (Cmd+K) Trigger */}
            <button
              className={styles.actionButton}
              title="Buscar Agente (Cmd+K)"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
            </button>

            {/* Theme Toggle Button */}
            <button
              className={styles.actionButton}
              title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notifications panel */}
            <div className={styles.notificationsWrapper} ref={dropdownRef}>
              <button
                className={`${styles.actionButton} ${unreadCount > 0 ? styles.bellActive : ""}`}
                title="Notificaciones"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Bell size={18} />
                {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
              </button>

              {notificationsOpen && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifHeader}>
                    <h3>Notificaciones</h3>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllAsRead}>
                        Marcar como leídas
                      </button>
                    )}
                  </div>
                  <div className={styles.notifList}>
                    {notifications.length > 0 ? (
                      notifications.map((notif) => {
                        const isRead = readNotifIds.includes(notif.id);
                        return (
                          <Link
                            key={notif.id}
                            href={notif.link}
                            className={`${styles.notifItem} ${isRead ? "" : styles.notifUnread}`}
                            onClick={() => {
                              setNotificationsOpen(false);
                              if (!isRead) {
                                const updated = [...readNotifIds, notif.id];
                                setReadNotifIds(updated);
                                localStorage.setItem("portal_read_notifs", JSON.stringify(updated));
                              }
                            }}
                          >
                            <div className={styles.notifIcon}>
                              {notif.type === "movimiento" ? (
                                <Clock size={16} className="text-purple" />
                              ) : notif.severity === "danger" ? (
                                <AlertTriangle size={16} className="text-rose" />
                              ) : (
                                <AlertTriangle size={16} className="text-amber" />
                              )}
                            </div>
                            <div className={styles.notifContent}>
                              <h4>{notif.title}</h4>
                              <p>{notif.message}</p>
                            </div>
                            {!isRead && <span className={styles.unreadDot} />}
                          </Link>
                        );
                      })
                    ) : (
                      <div className={styles.notifEmpty}>
                        <CheckCircle size={28} className="text-emerald" />
                        <p>No tienes notificaciones pendientes.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic content renders here */}
        <main className={styles.mainContent}>{children}</main>
      </div>

      {/* Global Cmd+K Search Palette Overlay */}
      {searchOpen && (
        <div className={styles.searchOverlay} onClick={() => setSearchOpen(false)}>
          <div className={styles.searchDialog} onClick={(e) => e.stopPropagation()}>
            <Command label="Portal Global Search" className={styles.cmdContainer}>
              <div className={styles.cmdHeader}>
                <Search size={18} className="text-muted" />
                <Command.Input
                  placeholder="Buscar agentes por DNI o Apellido y Nombre..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  className={styles.cmdInput}
                  autoFocus
                />
                <button className={styles.cmdClose} onClick={() => setSearchOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              <Command.List className={styles.cmdList}>
                <Command.Empty className={styles.cmdEmpty}>
                  {loadingSearch ? "Buscando..." : "No se encontraron resultados."}
                </Command.Empty>

                <Command.Group heading="Secciones del Portal" className={styles.cmdGroup}>
                  <Command.Item onSelect={() => navigateSearch("/portal/dashboard")} className={styles.cmdItem}>
                    <LayoutDashboard size={14} className={styles.cmdItemIcon} />
                    <span>Ir al Dashboard</span>
                  </Command.Item>
                  <Command.Item onSelect={() => navigateSearch("/portal/becarios")} className={styles.cmdItem}>
                    <Users size={14} className={styles.cmdItemIcon} />
                    <span>Ver Becarios</span>
                  </Command.Item>
                  <Command.Item onSelect={() => navigateSearch("/portal/monotributistas")} className={styles.cmdItem}>
                    <Briefcase size={14} className={styles.cmdItemIcon} />
                    <span>Ver Monotributistas</span>
                  </Command.Item>
                  <Command.Item onSelect={() => navigateSearch("/portal/movimientos")} className={styles.cmdItem}>
                    <Activity size={14} className={styles.cmdItemIcon} />
                    <span>Movimientos e Historial</span>
                  </Command.Item>
                  <Command.Item onSelect={() => navigateSearch("/portal/campanas")} className={styles.cmdItem}>
                    <FolderOpen size={14} className={styles.cmdItemIcon} />
                    <span>Campañas de Documentación</span>
                  </Command.Item>
                  <Command.Item onSelect={() => navigateSearch("/portal/analiticas")} className={styles.cmdItem}>
                    <BarChart3 size={14} className={styles.cmdItemIcon} />
                    <span>Estadísticas y Reportes</span>
                  </Command.Item>
                </Command.Group>

                {searchResults.length > 0 && (
                  <Command.Group heading="Agentes de tus Áreas" className={styles.cmdGroup}>
                    {searchResults.map((agent: any) => (
                      <Command.Item
                        key={agent.id}
                        onSelect={() => navigateSearch(`/portal/${agent.tipo === "becario" ? "becarios" : "monotributistas"}?id=${agent.id}`)}
                        className={styles.cmdItem}
                      >
                        <div className={styles.cmdAgentInfo}>
                          <span className={styles.cmdAgentName}>{agent.nombre}</span>
                          <span className={styles.cmdAgentMeta}>
                            DNI: {agent.dni} | {agent.tipo === "becario" ? "🎓 Becario" : "💼 Monotributista"} ({agent.area})
                          </span>
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </div>
  );
}
