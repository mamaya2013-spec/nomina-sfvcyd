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
  subsecretarias_ids: z.array(z.string().uuid()).min(1, "Seleccione al menos una subsecretaría"),
  areas_ids: z.array(z.string().uuid()),
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
      subsecretarias_ids: [],
      areas_ids: [],
      cargo: "",
      activo: true,
    },
  });

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.log("Validation errors:", errors);
      const firstKey = Object.keys(errors)[0];
      const firstError = errors[firstKey as keyof typeof errors];
      if (firstError?.message) {
        toast.error(`Error de validación (${firstKey}): ${firstError.message}`);
      }
    }
  }, [errors]);

  useEffect(() => {
    register("subsecretarias_ids");
    register("areas_ids");
  }, [register]);

  const selectedSubs = watch("subsecretarias_ids") || [];

  // Filter Areas based on selected Subsecretarías in the form
  const filteredAreasForForm = useMemo(() => {
    if (selectedSubs.length === 0) return [];
    return areas.filter((a) => selectedSubs.includes(a.subsecretaria_id));
  }, [selectedSubs, areas]);

  // Adjust areas in form if subsecretarías changes and selected area doesn't belong to any of them
  useEffect(() => {
    const currentAreas = watch("areas_ids") || [];
    if (selectedSubs.length > 0 && currentAreas.length > 0) {
      const validAreas = currentAreas.filter((areaId) =>
        areas.some((a) => a.id === areaId && selectedSubs.includes(a.subsecretaria_id))
      );
      if (validAreas.length !== currentAreas.length) {
        setValue("areas_ids", validAreas);
      }
    } else if (selectedSubs.length === 0 && currentAreas.length > 0) {
      setValue("areas_ids", []);
    }
  }, [selectedSubs, areas, setValue, watch]);

  // Setup edit form
  const handleEditClick = (resp: any) => {
    setSelectedResp(resp);
    reset({
      nombre_completo: resp.nombre_completo,
      dni: resp.dni,
      telefono: resp.telefono || "",
      email: resp.email || "",
      subsecretarias_ids: resp.subsecretarias_ids && resp.subsecretarias_ids.length > 0
        ? resp.subsecretarias_ids
        : (resp.subsecretaria_id ? [resp.subsecretaria_id] : []),
      areas_ids: resp.areas_ids && resp.areas_ids.length > 0
        ? resp.areas_ids
        : (resp.area_id ? [resp.area_id] : []),
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
      .select("id, subsecretaria_id, area_id, subsecretarias_ids, areas_ids")
      .eq("activo", true);
    
    if (respErr) throw respErr;
    if (!resps) return;

    const findCorrectResp = (subId: string, areaId: string) => {
      // 1. Try to find a responsible who has this area in their areas_ids
      const areaResp = resps.find((r) => r.areas_ids && r.areas_ids.includes(areaId));
      if (areaResp) return areaResp.id;

      // 2. Fall back to finding a responsible who has this subsecretaria in their subsecretarias_ids and no areas assigned
      const subResp = resps.find((r) => 
        r.subsecretarias_ids && 
        r.subsecretarias_ids.includes(subId) && 
        (!r.areas_ids || r.areas_ids.length === 0)
      );
      if (subResp) return subResp.id;

      // 3. Legacy compatibility
      const legacyAreaResp = resps.find((r) => r.subsecretaria_id === subId && r.area_id === areaId);
      if (legacyAreaResp) return legacyAreaResp.id;
      const legacySubResp = resps.find((r) => r.subsecretaria_id === subId && !r.area_id);
      return legacySubResp ? legacySubResp.id : null;
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
        subsecretaria_id: data.subsecretarias_ids && data.subsecretarias_ids.length > 0 ? data.subsecretarias_ids[0] : null,
        area_id: data.areas_ids && data.areas_ids.length > 0 ? data.areas_ids[0] : null,
        subsecretarias_ids: data.subsecretarias_ids || [],
        areas_ids: data.areas_ids || [],
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
        subsecretaria_id: data.subsecretarias_ids && data.subsecretarias_ids.length > 0 ? data.subsecretarias_ids[0] : null,
        area_id: data.areas_ids && data.areas_ids.length > 0 ? data.areas_ids[0] : null,
        subsecretarias_ids: data.subsecretarias_ids || [],
        areas_ids: data.areas_ids || [],
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

  const onAddFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      const errList = Object.entries(errors).map(([key, val]) => `${key}: ${val?.message}`).join(", ");
      toast.error(`No se pudo registrar: campos inválidos. ${errList}`);
    }
    handleSubmit(onAddSubmit)(e);
  };

  const onEditFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      const errList = Object.entries(errors).map(([key, val]) => `${key}: ${val?.message}`).join(", ");
      toast.error(`No se pudo guardar: campos inválidos. ${errList}`);
    }
    handleSubmit(onEditSubmit)(e);
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

      const rSubIds = r.subsecretarias_ids && r.subsecretarias_ids.length > 0
        ? r.subsecretarias_ids
        : (r.subsecretaria_id ? [r.subsecretaria_id] : []);
      const rAreaIds = r.areas_ids && r.areas_ids.length > 0
        ? r.areas_ids
        : (r.area_id ? [r.area_id] : []);

      const subMatch = !filterSub || rSubIds.includes(filterSub);
      const areaMatch = !filterArea || rAreaIds.includes(filterArea);

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
        header: "Subsecretarías",
        cell: (info) => {
          const resp = info.row.original;
          const subIds = resp.subsecretarias_ids && resp.subsecretarias_ids.length > 0
            ? resp.subsecretarias_ids
            : (resp.subsecretaria_id ? [resp.subsecretaria_id] : []);
          
          if (subIds.length === 0) return <span className="text-muted">-</span>;
          
          const names = subIds.map((id: string) => subsecretarias.find((s) => s.id === id)?.nombre || "Desconocida");
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "12.5px" }}>
              {names.map((name: string, idx: number) => (
                <span key={idx} style={{ opacity: 0.85 }}>{name}</span>
              ))}
            </div>
          );
        }
      },
      {
        id: "area",
        header: "Áreas Operativas",
        cell: (info) => {
          const resp = info.row.original;
          const areaIds = resp.areas_ids && resp.areas_ids.length > 0
            ? resp.areas_ids
            : (resp.area_id ? [resp.area_id] : []);
          
          if (areaIds.length === 0) return <span className="text-muted">-</span>;
          
          const names = areaIds.map((id: string) => areas.find((a) => a.id === id)?.nombre || "Desconocida");
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "12.5px" }}>
              {names.map((name: string, idx: number) => (
                <span key={idx} style={{ opacity: 0.75 }}>{name}</span>
              ))}
            </div>
          );
        }
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
    [subsecretarias, areas]
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
        <form onSubmit={onAddFormSubmit} className={styles.drawerForm}>
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
              <label>Subsecretarías Organizativas *</label>
              <div style={{
                maxHeight: "150px",
                overflowY: "auto",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "10px",
                background: "rgba(255, 255, 255, 0.02)",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                {subsecretarias.map((s) => {
                  const currentSubs = watch("subsecretarias_ids") || [];
                  const isChecked = currentSubs.includes(s.id);
                  return (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...currentSubs, s.id]
                            : currentSubs.filter((id: string) => id !== s.id);
                          setValue("subsecretarias_ids", next, { shouldValidate: true });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      <span>{s.nombre}</span>
                    </label>
                  );
                })}
              </div>
              {errors.subsecretarias_ids && (
                <span className={styles.formError}>{errors.subsecretarias_ids.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Áreas Operativas</label>
              <div style={{
                maxHeight: "180px",
                overflowY: "auto",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "10px",
                background: "rgba(255, 255, 255, 0.02)",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                {selectedSubs.length === 0 ? (
                  <span style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.4)", textAlign: "center", padding: "10px" }}>
                    Seleccione al menos una subsecretaría para ver sus áreas.
                  </span>
                ) : filteredAreasForForm.length === 0 ? (
                  <span style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.4)", textAlign: "center", padding: "10px" }}>
                    No hay áreas activas vinculadas a las subsecretarías seleccionadas.
                  </span>
                ) : (
                  filteredAreasForForm.map((a) => {
                    const currentAreas = watch("areas_ids") || [];
                    const isChecked = currentAreas.includes(a.id);
                    return (
                      <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...currentAreas, a.id]
                              : currentAreas.filter((id: string) => id !== a.id);
                            setValue("areas_ids", next, { shouldValidate: true });
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span>{a.nombre}</span>
                          <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)" }}>
                            ({subsecretarias.find(s => s.id === a.subsecretaria_id)?.nombre || ""})
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              {errors.areas_ids && <span className={styles.formError}>{errors.areas_ids.message}</span>}
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
        <form onSubmit={onEditFormSubmit} className={styles.drawerForm}>
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
              <label>Subsecretarías Organizativas *</label>
              <div style={{
                maxHeight: "150px",
                overflowY: "auto",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "10px",
                background: "rgba(255, 255, 255, 0.02)",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                {subsecretarias.map((s) => {
                  const currentSubs = watch("subsecretarias_ids") || [];
                  const isChecked = currentSubs.includes(s.id);
                  return (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...currentSubs, s.id]
                            : currentSubs.filter((id: string) => id !== s.id);
                          setValue("subsecretarias_ids", next, { shouldValidate: true });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      <span>{s.nombre}</span>
                    </label>
                  );
                })}
              </div>
              {errors.subsecretarias_ids && (
                <span className={styles.formError}>{errors.subsecretarias_ids.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Áreas Operativas</label>
              <div style={{
                maxHeight: "180px",
                overflowY: "auto",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "10px",
                background: "rgba(255, 255, 255, 0.02)",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                {selectedSubs.length === 0 ? (
                  <span style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.4)", textAlign: "center", padding: "10px" }}>
                    Seleccione al menos una subsecretaría para ver sus áreas.
                  </span>
                ) : filteredAreasForForm.length === 0 ? (
                  <span style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.4)", textAlign: "center", padding: "10px" }}>
                    No hay áreas activas vinculadas a las subsecretarías seleccionadas.
                  </span>
                ) : (
                  filteredAreasForForm.map((a) => {
                    const currentAreas = watch("areas_ids") || [];
                    const isChecked = currentAreas.includes(a.id);
                    return (
                      <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...currentAreas, a.id]
                              : currentAreas.filter((id: string) => id !== a.id);
                            setValue("areas_ids", next, { shouldValidate: true });
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span>{a.nombre}</span>
                          <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)" }}>
                            ({subsecretarias.find(s => s.id === a.subsecretaria_id)?.nombre || ""})
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              {errors.areas_ids && <span className={styles.formError}>{errors.areas_ids.message}</span>}
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
