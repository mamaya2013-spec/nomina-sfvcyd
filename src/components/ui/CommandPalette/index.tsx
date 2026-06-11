"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
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
  Search,
} from "lucide-react";
import styles from "./command-palette.module.css";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <Command label="Global Command Menu">
          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <Search size={18} style={{ position: "absolute", left: "20px", color: "var(--text-muted)" }} />
            <Command.Input
              placeholder="Buscar secciones o acciones..."
              className={styles.input}
              style={{ paddingLeft: "50px" }}
              autoFocus
            />
          </div>

          <Command.List className={styles.list}>
            <Command.Empty className={styles.empty}>No se encontraron resultados.</Command.Empty>

            <Command.Group heading={<span className={styles.groupHeading}>Navegación Rápida</span>} className={styles.group}>
              <Command.Item onSelect={() => navigate("/dashboard")} className={styles.item}>
                <LayoutDashboard size={16} className={styles.itemIcon} />
                <span>Ir al Dashboard Gerencial</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate("/dashboard/becarios")} className={styles.item}>
                <Users size={16} className={styles.itemIcon} />
                <span>Ver Listado de Becarios</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate("/dashboard/monotributistas")} className={styles.item}>
                <Briefcase size={16} className={styles.itemIcon} />
                <span>Ver Listado de Monotributistas</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading={<span className={styles.groupHeading}>Operaciones</span>} className={styles.group}>
              <Command.Item onSelect={() => navigate("/dashboard/movimientos")} className={styles.item}>
                <Activity size={16} className={styles.itemIcon} />
                <span>Altas, Bajas y Cambios de Monto</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate("/dashboard/liquidacion")} className={styles.item}>
                <FileCheck size={16} className={styles.itemIcon} />
                <span>Generar Liquidación Mensual</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate("/dashboard/ordenes")} className={styles.item}>
                <CreditCard size={16} className={styles.itemIcon} />
                <span>Órdenes de Compromiso</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading={<span className={styles.groupHeading}>Herramientas</span>} className={styles.group}>
              <Command.Item onSelect={() => navigate("/dashboard/documentos")} className={styles.item}>
                <FolderOpen size={16} className={styles.itemIcon} />
                <span>Gestión de Documentación</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate("/dashboard/reportes")} className={styles.item}>
                <BarChart3 size={16} className={styles.itemIcon} />
                <span>Reportes y Exportación</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate("/dashboard/organigrama")} className={styles.item}>
                <Network size={16} className={styles.itemIcon} />
                <span>Organigrama Interactivo</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate("/dashboard/configuracion")} className={styles.item}>
                <Settings size={16} className={styles.itemIcon} />
                <span>Configuración del Sistema</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
