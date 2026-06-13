"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  Eye,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Mail,
  Phone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast, Toaster } from "sonner";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import Drawer from "@/components/ui/Drawer";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./responsables.module.css";

// Form Validation Schema
const formSchema = z.object({
  nombre_completo: z.string().min(3, "Mínimo 3 caracteres"),
  dni: z.string().regex(/^\d{7,8}$/, "DNI debe tener 7 u 8 dígitos numéricos"),
  telefono: z.string().or(z.literal("")).nullable().optional(),
  email: z.string().email("Email inválido").or(z.literal("")).nullable().optional(),
  subsecretaria_id: z.string().uuid("Seleccione una subsecretaría").or(z.literal("")).nullable().optional(),
  area_id: z.string().uuid("Seleccione un área").or(z.literal("")).nullable().optional(),
  cargo: z.string().or(z.literal("")).nullable().optional(),
  activo: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ResponsablesConfigPage() {
  const supabase = createClient();

  // Data States
  const [responsables, setResponsables] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterEstado, setFilterEstado] = useState(""); // empty means all, or "activo", "inactivo"

  // Drawer States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedResp, setSelectedResp] = useState<any | null>(null);

  // React Table Sorting
  const [sorting, setSorting] = useState<SortingState>([]);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: resps, error: respsErr } = await supabase
        .from("responsables")
        .select(`
          *,
          areas(id, nombre),
          subsecretarias(id, nombre)
        `)
        .order("nombre_completo", { ascending: true });

      if (respsErr) throw respsErr;

      const { data: subs } = await supabase.from("subsecretarias").select("*").eq("activa", true).order("orden");
      const { data: ars } = await supabase.from("areas").select("*").eq("activa", true).order("orden");

      setResponsables(resps || []);
      setSubsecretarias(subs || []);
      setAreas(ars || []);
    } catch (err: any) {
      toast.error("Error al cargar responsables: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Form setup
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre_completo: "",
      dni: "",
      telefono: "",
      email: "",
      subsecretaria_id: "",
      area_id: "",
      cargo: "",
      activo: true,
    },
  });

  const selectedSub = watch("subsecretaria_id");

  // Filter Areas based on selected Subsecretaría in the form
  const filteredAreasForForm = useMemo(() => {
    if (!selectedSub) return [];
    return areas.filter((a) => a.subsecretaria_id === selectedSub);
  }, [selectedSub, areas]);

  // Adjust area in form if subsecretaría changes and selected area doesn't belong to it
  useEffect(() => {
    if (selectedSub) {
      const currentArea = watch("area_id");
      if (currentArea) {
        const belongs = areas.some((a) => a.id === currentArea && a.subsecretaria_id === selectedSub);
        if (!belongs) {
          setValue("area_id", "");
        }
      }
    } else {
      setValue("area_id", "");
    }
  }, [selectedSub, areas, setValue, watch]);

  // Setup edit form
  const handleEditClick = (resp: any) => {
    setSelectedResp(resp);
    reset({
      nombre_completo: resp.nombre_completo,
      dni: resp.dni,
      telefono: resp.telefono || "",
      email: resp.email || "",
      subsecretaria_id: resp.subsecretaria_id || "",
      area_id: resp.area_id || "",
      cargo: resp.cargo || "",
      activo: resp.activo,
    });
    setIsEditOpen(true);
  };

  // Synchronize members' responsable_id with active responsibles from config
  const syncMembersResponsibles = async () => {
    // 1. Fetch active responsibles
    const { data: resps, error: respErr } = await supabase
      .from("responsables")
      .select("id, subsecretaria_id, area_id")
      .eq("activo", true);
    
    if (respErr) throw respErr;
    if (!resps) return;

    const findCorrectResp = (subId: string, areaId: string) => {
      const areaResp = resps.find((r) => r.subsecretaria_id === subId && r.area_id === areaId);
      if (areaResp) return areaResp.id;
      const subResp = resps.find((r) => r.subsecretaria_id === subId && !r.area_id);
      return subResp ? subResp.id : null;
    };

    // 2. Fetch and sync active becarios
    const { data: becarios, error: becErr } = await supabase
      .from("becarios")
      .select("id, subsecretaria_id, area_id, responsable_id")
      .eq("estado", "Activo");

    if (becErr) throw becErr;
    if (becarios) {
      for (const b of becarios) {
        const correctRespId = findCorrectResp(b.subsecretaria_id, b.area_id);
        if (b.responsable_id !== correctRespId) {
          const { error: updErr } = await supabase
            .from("becarios")
            .update({ responsable_id: correctRespId })
            .eq("id", b.id);
          if (updErr) console.error("Error updating becario:", updErr);
        }
      }
    }

    // 3. Fetch and sync active monotributistas
    const { data: monos, error: monErr } = await supabase
      .from("monotributistas")
      .select("id, subsecretaria_id, area_id, responsable_id")
      .eq("estado", "Activo");

    if (monErr) throw monErr;
    if (monos) {
      for (const m of monos) {
        const correctRespId = findCorrectResp(m.subsecretaria_id, m.area_id);
        if (m.responsable_id !== correctRespId) {
          const { error: updErr } = await supabase
            .from("monotributistas")
            .update({ responsable_id: correctRespId })
            .eq("id", m.id);
          if (updErr) console.error("Error updating monotributista:", updErr);
        }
      }
    }
  };

  // Submit Add
  const onAddSubmit = async (data: FormValues) => {
    try {
      const payload = {
        nombre_completo: data.nombre_completo,
        dni: data.dni,
        telefono: data.telefono || null,
        email: data.email || null,
        subsecretaria_id: data.subsecretaria_id || null,
        area_id: data.area_id || null,
        cargo: data.cargo || null,
        activo: data.activo,
      };

      const { error } = await supabase.from("responsables").insert(payload);
      if (error) throw error;

      // Audit Log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: "Creación de Responsable",
        tabla_afectada: "responsables",
        datos_nuevos: payload,
      });

      toast.success("Responsable registrado con éxito.");
      setIsAddOpen(false);
      reset();
      fetchData();
      
      // Trigger cascade sync in background
      toast.promise(syncMembersResponsibles(), {
        loading: "Sincronizando responsables en la nómina...",
        success: "Nómina sincronizada correctamente.",
        error: "Error al sincronizar responsables de la nómina.",
      });
    } catch (err: any) {
      toast.error("Error al registrar responsable: " + err.message);
    }
  };

  // Submit Edit
  const onEditSubmit = async (data: FormValues) => {
    if (!selectedResp) return;
    try {
      const payload = {
        nombre_completo: data.nombre_completo,
        dni: data.dni,
        telefono: data.telefono || null,
        email: data.email || null,
        subsecretaria_id: data.subsecretaria_id || null,
        area_id: data.area_id || null,
        cargo: data.cargo || null,
        activo: data.activo,
      };

      const { error } = await supabase
        .from("responsables")
        .update(payload)
        .eq("id", selectedResp.id);

      if (error) throw error;

      // Audit Log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: "Actualización de Responsable",
        tabla_afectada: "responsables",
        registro_id: selectedResp.id,
        datos_anteriores: selectedResp,
        datos_nuevos: payload,
      });

      toast.success("Responsable actualizado con éxito.");
      setIsEditOpen(false);
      fetchData();

      // Trigger cascade sync in background
      toast.promise(syncMembersResponsibles(), {
        loading: "Sincronizando responsables en la nómina...",
        success: "Nómina sincronizada correctamente.",
        error: "Error al sincronizar responsables de la nómina.",
      });
    } catch (err: any) {
      toast.error("Error al actualizar responsable: " + err.message);
    }
  };

  // Toggle active status
  const handleToggleActive = async (resp: any) => {
    const newStatus = !resp.activo;
    try {
      const { error } = await supabase
        .from("responsables")
        .update({ activo: newStatus })
        .eq("id", resp.id);

      if (error) throw error;

      // Audit Log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: newStatus ? "Activar Responsable" : "Desactivar Responsable",
        tabla_afectada: "responsables",
        registro_id: resp.id,
        datos_anteriores: { activo: resp.activo },
        datos_nuevos: { activo: newStatus },
      });

      toast.success(`Responsable ${newStatus ? "activado" : "desactivado"} con éxito.`);
      fetchData();

      // Trigger cascade sync in background
      toast.promise(syncMembersResponsibles(), {
        loading: "Sincronizando responsables en la nómina...",
        success: "Nómina sincronizada correctamente.",
        error: "Error al sincronizar responsables de la nómina.",
      });
    } catch (err: any) {
      toast.error("Error al cambiar estado: " + err.message);
    }
  };

  // Filter logic
  const filteredResponsables = useMemo(() => {
    return responsables.filter((r) => {
      const nameMatch = r.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase());
      const dniMatch = r.dni.includes(searchTerm);
      const searchMatch = nameMatch || dniMatch;

      const subMatch = !filterSub || r.subsecretaria_id === filterSub;
      const areaMatch = !filterArea || r.area_id === filterArea;

      let estadoMatch = true;
      if (filterEstado === "activo") estadoMatch = r.activo === true;
      if (filterEstado === "inactivo") estadoMatch = r.activo === false;

      return searchMatch && subMatch && areaMatch && estadoMatch;
    });
  }, [responsables, searchTerm, filterSub, filterArea, filterEstado]);

  // TanStack Table columns
  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "nombre_completo",
        header: "Nombre y DNI",
        cell: (info) => (
          <div className={styles.nameCell}>
            <span className={styles.fullName}>{info.getValue() as string}</span>
            <span className={styles.dniLabel}>DNI: {info.row.original.dni}</span>
          </div>
        ),
      },
      {
        accessorKey: "cargo",
        header: "Cargo / Función",
        cell: (info) => <span className={styles.cargoTxt}>{(info.getValue() as string) || "-"}</span>,
      },
      {
        id: "subsecretaria",
        header: "Subsecretaría",
        accessorFn: (row) => row.subsecretarias?.nombre || "-",
      },
      {
        id: "area",
        header: "Área",
        accessorFn: (row) => row.areas?.nombre || "-",
      },
      {
        id: "contacto",
        header: "Contacto",
        cell: (info) => {
          const resp = info.row.original;
          return (
            <div className={styles.contactCell}>
              {resp.email && (
                <span className={styles.contactItem} title={resp.email}>
                  <Mail size={12} /> {resp.email}
                </span>
              )}
              {resp.telefono && (
                <span className={styles.contactItem} title={resp.telefono}>
                  <Phone size={12} /> {resp.telefono}
                </span>
              )}
              {!resp.email && !resp.telefono && <span className="text-muted">-</span>}
            </div>
          );
        },
      },
      {
        accessorKey: "activo",
        header: "Estado",
        cell: (info) => (
          <StatusBadge status={info.getValue() ? "activo" : "inactivo"} />
        ),
      },
      {
        id: "acciones",
        header: "Acciones",
        cell: (info) => {
          const resp = info.row.original;
          return (
            <div className={styles.actionsCell}>
              <Link
                href={`/dashboard/configuracion/responsables/${resp.id}`}
                className={styles.actionBtn}
                title="Ver Ficha y Personal a cargo"
              >
                <Eye size={16} />
              </Link>
              <button
                onClick={() => handleEditClick(resp)}
                className={`${styles.actionBtn} ${styles.edit}`}
                title="Editar Datos"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => handleToggleActive(resp)}
                className={`${styles.actionBtn} ${resp.activo ? styles.deactivate : styles.activate}`}
                title={resp.activo ? "Desactivar Responsable" : "Activar Responsable"}
              >
                {resp.activo ? <ToggleRight size={18} className="text-emerald" /> : <ToggleLeft size={18} className="text-muted" />}
              </button>
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredResponsables,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header Panel */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.backLinkWrapper}>
            <Link href="/dashboard/configuracion" className={styles.backLink}>
              <ArrowLeft size={16} />
              <span>Volver a Configuración</span>
            </Link>
          </div>
          <h1 style={{ marginTop: "8px" }}>Administración de Responsables</h1>
          <p className="text-secondary">
            Gestione las autoridades y coordinadores responsables del personal (Becarios y Monotributistas).
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            onClick={() => {
              reset();
              setIsAddOpen(true);
            }}
            className={styles.primaryBtn}
          >
            <Plus size={16} />
            <span>Nuevo Responsable</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className={`${styles.filtersContainer} glass-panel`}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={18} />
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por Nombre, DNI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className={styles.filtersGrid}>
          <div className={styles.filterGroup}>
            <label>Subsecretaría</label>
            <select
              className="input-field"
              value={filterSub}
              onChange={(e) => {
                setFilterSub(e.target.value);
                setFilterArea("");
              }}
            >
              <option value="">Todas</option>
              {subsecretarias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>Área</label>
            <select
              className="input-field"
              value={filterArea}
              disabled={!filterSub}
              onChange={(e) => setFilterArea(e.target.value)}
            >
              <option value="">Todas</option>
              {areas
                .filter((a) => a.subsecretaria_id === filterSub)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>Estado</label>
            <select
              className="input-field"
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Cargando lista de responsables...</p>
        </div>
      ) : (
        <div className={`${styles.tableWrapper} glass-panel`}>
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                        style={{ cursor: h.column.getCanSort() ? "pointer" : "default" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc" && " 🔼"}
                          {h.column.getIsSorted() === "desc" && " 🔽"}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={{ textAlign: "center", padding: "40px" }}>
                      No se encontraron responsables registrados.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className={styles.pagination}>
            <div className={styles.paginationInfo}>
              Mostrando {table.getRowModel().rows.length} de {filteredResponsables.length} responsables
            </div>
            <div className={styles.paginationControls}>
              <button
                className={styles.paginationBtn}
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.pageNumber}>
                Pág. {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
              </span>
              <button
                className={styles.paginationBtn}
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Nuevo Responsable */}
      <Drawer
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Registrar Nuevo Responsable"
        size="md"
      >
        <form onSubmit={handleSubmit(onAddSubmit)} className={styles.drawerForm}>
          <div className={styles.formSection}>
            <div className={styles.formGroup}>
              <label>Nombre Completo *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. Juan Pérez"
                {...register("nombre_completo")}
              />
              {errors.nombre_completo && (
                <span className={styles.formError}>{errors.nombre_completo.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>DNI *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. 35123456"
                {...register("dni")}
              />
              {errors.dni && <span className={styles.formError}>{errors.dni.message}</span>}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Teléfono</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. 3515556677"
                  {...register("telefono")}
                />
                {errors.telefono && (
                  <span className={styles.formError}>{errors.telefono.message}</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Email</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. juan.perez@example.com"
                  {...register("email")}
                />
                {errors.email && <span className={styles.formError}>{errors.email.message}</span>}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Cargo / Función</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. Director de Deportes"
                {...register("cargo")}
              />
              {errors.cargo && <span className={styles.formError}>{errors.cargo.message}</span>}
            </div>

            <div className={styles.formGroup}>
              <label>Subsecretaría Organizativa</label>
              <select className="input-field" {...register("subsecretaria_id")}>
                <option value="">Ninguna</option>
                {subsecretarias.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              {errors.subsecretaria_id && (
                <span className={styles.formError}>{errors.subsecretaria_id.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Área Operativa</label>
              <select
                className="input-field"
                disabled={!selectedSub}
                {...register("area_id")}
              >
                <option value="">Ninguna</option>
                {filteredAreasForForm.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              {errors.area_id && <span className={styles.formError}>{errors.area_id.message}</span>}
            </div>

            <div className={styles.formGroup} style={{ flexDirection: "row", gap: "10px", alignItems: "center", marginTop: "10px" }}>
              <input type="checkbox" id="add_activo" {...register("activo")} style={{ cursor: "pointer", width: "16px", height: "16px" }} />
              <label htmlFor="add_activo" style={{ cursor: "pointer", userSelect: "none" }}>Responsable Activo (Habilitado para asignaciones)</label>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className="input-field"
              onClick={() => setIsAddOpen(false)}
              style={{ cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.primaryBtn}>
              Registrar Responsable
            </button>
          </div>
        </form>
      </Drawer>

      {/* Drawer: Editar Responsable */}
      <Drawer
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Editar Datos de Responsable"
        size="md"
      >
        <form onSubmit={handleSubmit(onEditSubmit)} className={styles.drawerForm}>
          <div className={styles.formSection}>
            <div className={styles.formGroup}>
              <label>Nombre Completo *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. Juan Pérez"
                {...register("nombre_completo")}
              />
              {errors.nombre_completo && (
                <span className={styles.formError}>{errors.nombre_completo.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>DNI *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. 35123456"
                {...register("dni")}
              />
              {errors.dni && <span className={styles.formError}>{errors.dni.message}</span>}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Teléfono</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. 3515556677"
                  {...register("telefono")}
                />
                {errors.telefono && (
                  <span className={styles.formError}>{errors.telefono.message}</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Email</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. juan.perez@example.com"
                  {...register("email")}
                />
                {errors.email && <span className={styles.formError}>{errors.email.message}</span>}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Cargo / Función</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. Director de Deportes"
                {...register("cargo")}
              />
              {errors.cargo && <span className={styles.formError}>{errors.cargo.message}</span>}
            </div>

            <div className={styles.formGroup}>
              <label>Subsecretaría Organizativa</label>
              <select className="input-field" {...register("subsecretaria_id")}>
                <option value="">Ninguna</option>
                {subsecretarias.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              {errors.subsecretaria_id && (
                <span className={styles.formError}>{errors.subsecretaria_id.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Área Operativa</label>
              <select
                className="input-field"
                disabled={!selectedSub}
                {...register("area_id")}
              >
                <option value="">Ninguna</option>
                {filteredAreasForForm.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              {errors.area_id && <span className={styles.formError}>{errors.area_id.message}</span>}
            </div>

            <div className={styles.formGroup} style={{ flexDirection: "row", gap: "10px", alignItems: "center", marginTop: "10px" }}>
              <input type="checkbox" id="edit_activo" {...register("activo")} style={{ cursor: "pointer", width: "16px", height: "16px" }} />
              <label htmlFor="edit_activo" style={{ cursor: "pointer", userSelect: "none" }}>Responsable Activo (Habilitado para asignaciones)</label>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className="input-field"
              onClick={() => setIsEditOpen(false)}
              style={{ cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.primaryBtn}>
              Guardar Cambios
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
