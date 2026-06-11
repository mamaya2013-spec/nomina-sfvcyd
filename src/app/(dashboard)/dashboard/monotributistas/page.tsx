"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useForm, Controller } from "react-hook-form";
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


import Drawer from "@/components/ui/Drawer";
import StatusBadge from "@/components/ui/StatusBadge";
import FileDropzone from "@/components/ui/FileDropzone";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { parsePeopleExcel, ExcelImportRow, ValidationError } from "@/lib/excel-parser";
import styles from "./monotributistas.module.css";
import Link from "next/link";

// 1. Zod Form Schema for Monotributista
const formSchema = z.object({
  apellido_nombre: z.string().min(3, "Mínimo 3 caracteres"),
  dni: z.string().regex(/^\d{7,8}$/, "DNI debe tener 7 u 8 dígitos numéricos"),
  cuit: z.string().regex(/^\d{11}$/, "CUIT/CUIL debe tener 11 dígitos numéricos"),
  subsecretaria_id: z.string().uuid("Seleccione una subsecretaría"),
  area_id: z.string().uuid("Seleccione un área"),
  responsable_id: z.string().uuid().nullable().optional(),
  categoria_mono_id: z.string().uuid("Seleccione una categoría"),
  fecha_nacimiento: z.string().nullable().optional(),
  cbu: z.string().nullable().optional(),
  tarjeta_activa_nro: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  email: z.string().email("Email inválido").or(z.literal("")).nullable().optional(),
  nacionalidad: z.string().nullable().optional(),
  codigo_postal: z.string().nullable().optional(),
  provincia: z.string().nullable().optional(),
  departamento: z.string().nullable().optional(),
  localidad: z.string().nullable().optional(),
  barrio: z.string().nullable().optional(),
  calle: z.string().nullable().optional(),
  nro: z.string().nullable().optional(),
  piso: z.string().nullable().optional(),
  depto: z.string().nullable().optional(),
  lote: z.string().nullable().optional(),
  manzana: z.string().nullable().optional(),
  fecha_alta: z.string().min(1, "Fecha de alta requerida"),
});

type FormValues = z.infer<typeof formSchema>;

export default function MonotributistasPage() {
  const supabase = createClient();

  // Data States
  const [monotributistas, setMonotributistas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSemestre, setActiveSemestre] = useState<any | null>(null);

  // Lookups
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [responsables, setResponsables] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterEstado, setFilterEstado] = useState("Activo"); // default view active
  const [filterResp, setFilterResp] = useState("");
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [filterTag, setFilterTag] = useState("");

  // UI Drawer States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isBajaOpen, setIsBajaOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [formTab, setFormTab] = useState<"personal" | "asignacion" | "contacto">("personal");

  // Excel Import States
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ExcelImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<ValidationError[]>([]);
  const [importSummary, setImportSummary] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  // Baja Form States
  const [bajaMotivo, setBajaMotivo] = useState("");
  const [bajaFecha, setBajaFecha] = useState(new Date().toISOString().split("T")[0]);

  // React Table Sorting
  const [sorting, setSorting] = useState<SortingState>([]);

  const { selectedSemester, loading: semesterLoading } = useSemester();

  // Fetch Core Data
  const fetchData = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      // 1. Fetch subsecretarías, areas, responsables
      const { data: subs } = await supabase.from("subsecretarias").select("*").eq("activa", true).order("orden");
      const { data: ars } = await supabase.from("areas").select("*").eq("activa", true).order("orden");
      const { data: resps } = await supabase.from("responsables").select("*").eq("activo", true).order("nombre_completo");

      setSubsecretarias(subs || []);
      setAreas(ars || []);
      setResponsables(resps || []);

      if (selectedSemester.bloqueado) {
        // Fetch from snapshot
        const { data: snapshot, error: snapErr } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .maybeSingle();

        if (snapErr) throw snapErr;

        if (snapshot) {
          setMonotributistas(snapshot.nomina_monos_snapshot || []);
          setCategorias(snapshot.categorias_monos_snapshot || []);
          setActiveSemestre(selectedSemester);
        } else {
          setMonotributistas([]);
          setCategorias([]);
          setActiveSemestre(selectedSemester);
        }
      } else {
        // Fetch active semester categories
        const { data: cats } = await supabase
          .from("categorias_monotributistas")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .order("letra", { ascending: true });
        setCategorias(cats || []);
        setActiveSemestre(selectedSemester);

        // Fetch live monotributistas with their joins
        const { data: monos, error: monosErr } = await supabase
          .from("monotributistas")
          .select(`
            *,
            subsecretarias(id, nombre),
            areas(id, nombre),
            responsables(id, nombre_completo),
            categorias_monotributistas(id, letra, monto, total),
            persona_tags(
              tags(id, nombre, color)
            )
          `)
          .order("apellido_nombre", { ascending: true });

        if (monosErr) throw monosErr;

        const transformedMonos = (monos || []).map((m: any) => ({
          ...m,
          tags: m.persona_tags?.map((pt: any) => pt.tags).filter(Boolean) || []
        }));
        setMonotributistas(transformedMonos);
      }

      // Fetch available tags
      const { data: allTags } = await supabase.from("tags").select("*").order("nombre");
      setAvailableTags(allTags || []);
    } catch (err: any) {
      toast.error("Error al cargar datos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      fetchData();
    }
  }, [selectedSemester]);

  // Form Setup
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      apellido_nombre: "",
      dni: "",
      cuit: "",
      subsecretaria_id: "",
      area_id: "",
      responsable_id: null,
      categoria_mono_id: "",
      fecha_nacimiento: "",
      cbu: "",
      tarjeta_activa_nro: "",
      telefono: "",
      email: "",
      nacionalidad: "Argentina",
      provincia: "Córdoba",
      localidad: "Córdoba",
      codigo_postal: "5000",
      departamento: "Capital",
      barrio: "",
      calle: "",
      nro: "",
      piso: "",
      depto: "",
      lote: "",
      manzana: "",
      fecha_alta: new Date().toISOString().split("T")[0],
    },
  });

  const selectedSub = watch("subsecretaria_id");
  const selectedCat = watch("categoria_mono_id");

  // Filter Areas based on selected Subsecretaría in form
  const filteredAreasForForm = useMemo(() => {
    if (!selectedSub) return [];
    return areas.filter((a) => a.subsecretaria_id === selectedSub);
  }, [selectedSub, areas]);

  // Live amount calculation for Form
  const formAmountPreview = useMemo(() => {
    if (!selectedCat || categorias.length === 0) return { base: 0, activa: 0, total: 0 };
    const cat = categorias.find((c) => c.id === selectedCat);
    if (!cat) return { base: 0, activa: 0, total: 0 };
    return {
      base: Number(cat.monto),
      activa: Number(cat.monto_activa),
      total: Number(cat.total),
    };
  }, [selectedCat, categorias]);

  // Handle Edit Action Setup
  const handleEditClick = (person: any) => {
    setSelectedPerson(person);
    reset({
      apellido_nombre: person.apellido_nombre,
      dni: person.dni,
      cuit: person.cuit,
      subsecretaria_id: person.subsecretaria_id,
      area_id: person.area_id,
      responsable_id: person.responsable_id,
      categoria_mono_id: person.categoria_mono_id,
      fecha_nacimiento: person.fecha_nacimiento || "",
      cbu: person.cbu || "",
      tarjeta_activa_nro: person.tarjeta_activa_nro || "",
      telefono: person.telefono || "",
      email: person.email || "",
      nacionalidad: person.nacionalidad || "Argentina",
      codigo_postal: person.codigo_postal || "",
      provincia: person.provincia || "",
      departamento: person.departamento || "",
      localidad: person.localidad || "",
      barrio: person.barrio || "",
      calle: person.calle || "",
      nro: person.nro || "",
      piso: person.piso || "",
      depto: person.depto || "",
      lote: person.lote || "",
      manzana: person.manzana || "",
      fecha_alta: person.fecha_alta,
    });
    setFormTab("personal");
    setIsEditOpen(true);
  };

  // Submit Add Form
  const onAddSubmit = async (data: FormValues) => {
    try {
      const selectedCategory = categorias.find((c) => c.id === data.categoria_mono_id);
      
      const payload = {
        ...data,
        importe_mensual_monotributo: Number(selectedCategory.monto),
        importe_tarjeta_activa: Number(selectedCategory.monto_activa),
        importe_total: Number(selectedCategory.total),
        estado: "Activo",
      };

      const { error } = await supabase.from("monotributistas").insert(payload);
      if (error) throw error;

      // Log audit
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: "Creación de Monotributista",
        tabla_afectada: "monotributistas",
        datos_nuevos: payload,
      });

      toast.success("Monotributista registrado exitosamente.");
      setIsAddOpen(false);
      reset();
      fetchData();
    } catch (err: any) {
      toast.error("Error al registrar monotributista: " + err.message);
    }
  };

  // Submit Edit Form
  const onEditSubmit = async (data: FormValues) => {
    if (!selectedPerson) return;
    try {
      const selectedCategory = categorias.find((c) => c.id === data.categoria_mono_id);
      
      const payload = {
        ...data,
        importe_mensual_monotributo: Number(selectedCategory.monto),
        importe_tarjeta_activa: Number(selectedCategory.monto_activa),
        importe_total: Number(selectedCategory.total),
      };

      const { error } = await supabase
        .from("monotributistas")
        .update(payload)
        .eq("id", selectedPerson.id);

      if (error) throw error;

      // Log movement / audit if amount changed
      if (Number(selectedPerson.importe_mensual_monotributo) !== Number(selectedCategory.monto)) {
        const { data: { user } } = await supabase.auth.getUser();
        
        await supabase.from("movimientos").insert({
          tipo_persona: "monotributista",
          persona_id: selectedPerson.id,
          tipo_movimiento: "cambio_monto",
          anio: activeSemestre?.anio || new Date().getFullYear(),
          mes: new Date().getMonth() + 1,
          descripcion: `Cambio de monto: de $${selectedPerson.importe_mensual_monotributo} a $${selectedCategory.monto}`,
          datos_anteriores: {
            monto: selectedPerson.importe_mensual_monotributo,
            categoria_id: selectedPerson.categoria_mono_id,
          },
          datos_nuevos: {
            monto: selectedCategory.monto,
            categoria_id: selectedCategory.id,
          },
          usuario_id: user?.id,
        });
      }

      toast.success("Datos actualizados correctamente.");
      setIsEditOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error("Error al actualizar datos: " + err.message);
    }
  };

  // Submit Baja Form
  const handleBajaSubmit = async () => {
    if (!selectedPerson || !bajaMotivo.trim()) {
      toast.error("El motivo de baja es obligatorio.");
      return;
    }

    try {
      const { error } = await supabase
        .from("monotributistas")
        .update({
          estado: "Baja",
          fecha_baja: bajaFecha,
          motivo_baja: bajaMotivo,
        })
        .eq("id", selectedPerson.id);

      if (error) throw error;

      // Log movement
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("movimientos").insert({
        tipo_persona: "monotributista",
        persona_id: selectedPerson.id,
        tipo_movimiento: "baja",
        anio: parseInt(bajaFecha.split("-")[0]),
        mes: parseInt(bajaFecha.split("-")[1]),
        descripcion: `Baja procesada por motivo: ${bajaMotivo}`,
        datos_anteriores: { estado: "Activo" },
        datos_nuevos: { estado: "Baja", fecha_baja: bajaFecha, motivo_baja: bajaMotivo },
        usuario_id: user?.id,
      });

      toast.success("Baja procesada con éxito.");
      setIsBajaOpen(false);
      setBajaMotivo("");
      fetchData();
    } catch (err: any) {
      toast.error("Error al procesar la baja: " + err.message);
    }
  };

  // Excel parsing callback
  const handleExcelSelected = async (file: File) => {
    setImportFile(file);
    try {
      const result = await parsePeopleExcel(file, "monotributistas");
      setImportPreview(result.data);
      setImportErrors(result.errors);
      setImportSummary(result.summary);
      if (result.errors.some((e) => e.severity === "error")) {
        toast.warning("El archivo contiene algunos errores de formato.");
      } else {
        toast.success("Archivo verificado con éxito. Listo para importar.");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Confirm Excel Bulk Import
  const handleConfirmImport = async () => {
    if (!importPreview.length || importing) return;
    setImporting(true);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "monotributistas",
          rows: importPreview,
          fileName: importFile?.name || "import_monos.xlsx",
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Error al importar nómina");

      toast.success(`Importación exitosa: ${result.successful} monotributistas ingresados.`);
      setIsImportOpen(false);
      setImportFile(null);
      setImportPreview([]);
      setImportErrors([]);
      setImportSummary(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  // Export to Excel
  const handleExportData = async () => {
    if (monotributistas.length === 0) return;

    const XLSX = await import('xlsx');

    const dataToExport = filteredMonotributistas.map((m) => ({
      Apellido_Nombre: m.apellido_nombre,
      DNI: m.dni,
      CUIT_CUIL: m.cuit,
      Subsecretaria: m.subsecretarias?.nombre,
      Area: m.areas?.nombre,
      Responsable: m.responsables?.nombre_completo || "Sin Asignar",
      Letra: m.categorias_monotributistas?.letra || "-",
      Importe_Monotributo: m.importe_mensual_monotributo,
      Tarjeta_Activa: m.importe_tarjeta_activa,
      Total: m.importe_total,
      Estado: m.estado,
      Fecha_Alta: m.fecha_alta,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monotributistas");
    XLSX.writeFile(wb, `Monotributistas_Export_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Filters logic
  const filteredMonotributistas = useMemo(() => {
    return monotributistas.filter((m) => {
      const nameMatch = m.apellido_nombre.toLowerCase().includes(searchTerm.toLowerCase());
      const dniMatch = m.dni.includes(searchTerm);
      const cuitMatch = m.cuit.includes(searchTerm);
      const searchMatch = nameMatch || dniMatch || cuitMatch;

      const subMatch = !filterSub || m.subsecretaria_id === filterSub;
      const areaMatch = !filterArea || m.area_id === filterArea;
      const catMatch = !filterCat || m.categorias_monotributistas?.id === filterCat;
      const estadoMatch = !filterEstado || m.estado === filterEstado;
      const respMatch = !filterResp || m.responsable_id === filterResp;
      const tagMatch = !filterTag || m.tags?.some((t: any) => t.id === filterTag);

      return searchMatch && subMatch && areaMatch && catMatch && estadoMatch && respMatch && tagMatch;
    });
  }, [monotributistas, searchTerm, filterSub, filterArea, filterCat, filterEstado, filterResp, filterTag]);

  // TanStack Table setup
  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "apellido_nombre",
        header: "Apellido y Nombre",
        cell: (info) => (
          <div className={styles.nameCell}>
            <span className={styles.fullName}>{info.getValue() as string}</span>
            <span className={styles.cuil}>{info.row.original.cuit}</span>
            {info.row.original.tags && info.row.original.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                {info.row.original.tags.map((t: any) => (
                  <span
                    key={t.id}
                    style={{
                      fontSize: "9px",
                      fontWeight: "600",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: `${t.color}20`,
                      border: `1px solid ${t.color}`,
                      color: t.color,
                      textTransform: "uppercase"
                    }}
                  >
                    {t.nombre}
                  </span>
                ))}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "dni",
        header: "DNI",
        cell: (info) => <span className="mono">{info.getValue() as string}</span>,
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
        id: "responsable",
        header: "Responsable",
        accessorFn: (row) => row.responsables?.nombre_completo || "Sin Asignar",
      },
      {
        id: "letra",
        header: "Letra",
        cell: (info) => (
          <span className={styles.categoryBadge}>
            Categoría {info.row.original.categorias_monotributistas?.letra || "-"}
          </span>
        ),
      },
      {
        accessorKey: "importe_total",
        header: "Monto Total",
        cell: (info) => (
          <span className="mono font-bold text-emerald">
            ${Number(info.getValue() as number).toLocaleString("es-AR")}
          </span>
        ),
      },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: (info) => <StatusBadge status={info.getValue() as string} />,
      },
      {
        id: "acciones",
        header: "Acciones",
        cell: (info) => {
          const person = info.row.original;
          return (
            <div className={styles.actionsCell}>
              <Link href={`/dashboard/monotributistas/${person.id}`} className={styles.actionBtn} title="Ver Ficha">
                <Eye size={16} />
              </Link>
              {person.estado === "Activo" && !selectedSemester?.bloqueado && (
                <>
                  <button
                    onClick={() => handleEditClick(person)}
                    className={`${styles.actionBtn} ${styles.edit}`}
                    title="Editar Datos"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPerson(person);
                      setIsBajaOpen(true);
                    }}
                    className={`${styles.actionBtn} ${styles.delete}`}
                    title="Procesar Baja"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [categorias]
  );

  const table = useReactTable({
    data: filteredMonotributistas,
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
          <h1>Monotributistas</h1>
          <p className="text-secondary">
            Administración de nómina de monotributistas, categorías y facturación.
          </p>
        </div>

        <div className={styles.headerActions}>
          {!selectedSemester?.bloqueado && (
            <button
              onClick={() => setIsImportOpen(true)}
              className="input-field"
              style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
            >
              <FileSpreadsheet size={16} />
              <span>Importación Inicial</span>
            </button>
          )}

          <button
            onClick={handleExportData}
            className="input-field"
            style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
            disabled={filteredMonotributistas.length === 0}
          >
            <Download size={16} />
            <span>Exportar</span>
          </button>

          {!selectedSemester?.bloqueado && (
            <button
              onClick={() => {
                reset();
                setFormTab("personal");
                setIsAddOpen(true);
              }}
              className={styles.primaryBtn}
            >
              <Plus size={16} />
              <span>Nuevo Monotributista</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de bloqueo para semestre histórico */}
      {selectedSemester?.bloqueado && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 20px",
          background: "rgba(244, 63, 94, 0.08)",
          border: "1px solid rgba(244, 63, 94, 0.2)",
          borderRadius: "var(--border-radius-md)",
          color: "var(--accent-rose)",
          fontSize: "13.5px",
          fontWeight: "500",
          marginBottom: "8px"
        }}>
          <Lock size={16} style={{ flexShrink: 0 }} />
          <span>Modo Consulta Histórica: Estás visualizando los registros congelados del Semestre {selectedSemester.nombre_display}. No se permiten modificaciones.</span>
        </div>
      )}

      {/* Filter Panel */}
      <div className={`${styles.filtersContainer} glass-panel`}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={18} />
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por DNI, CUIL, Nombre..."
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
            <label>Responsable</label>
            <select
              className="input-field"
              value={filterResp}
              onChange={(e) => setFilterResp(e.target.value)}
            >
              <option value="">Todos</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre_completo}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>Letra Categoría</label>
            <select
              className="input-field"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  Letra {c.letra} (${Number(c.monto).toLocaleString("es-AR")})
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
              <option value="Activo">Activos</option>
              <option value="Baja">Bajas</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>Etiqueta</label>
            <select
              className="input-field"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
            >
              <option value="">Todas</option>
              {availableTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Cargando información de nómina...</p>
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
                      No se encontraron monotributistas con los filtros seleccionados.
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

          {/* Table Paginator */}
          <div className={styles.pagination}>
            <div className={styles.paginationInfo}>
              Mostrando {table.getRowModel().rows.length} de {filteredMonotributistas.length} registros
            </div>
            <div className={styles.paginationControls}>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className={styles.paginationBtn}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.pageNumber}>
                Pág. {table.getState().pagination.pageIndex + 1}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className={styles.paginationBtn}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: Add Monotributista */}
      <Drawer
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Registrar Nuevo Monotributista"
        size="lg"
      >
        <div className={styles.drawerTabs}>
          <button
            className={`${styles.tabBtn} ${formTab === "personal" ? styles.activeTab : ""}`}
            onClick={() => setFormTab("personal")}
          >
            Datos Personales
          </button>
          <button
            className={`${styles.tabBtn} ${formTab === "asignacion" ? styles.activeTab : ""}`}
            onClick={() => setFormTab("asignacion")}
          >
            Asignación y Monto
          </button>
          <button
            className={`${styles.tabBtn} ${formTab === "contacto" ? styles.activeTab : ""}`}
            onClick={() => setFormTab("contacto")}
          >
            Contacto y Domicilio
          </button>
        </div>

        <form onSubmit={handleSubmit(onAddSubmit)} className={styles.drawerForm}>
          {formTab === "personal" && (
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Apellido y Nombre *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej: Gómez María Inés"
                    {...register("apellido_nombre")}
                  />
                  {errors.apellido_nombre && <span className={styles.formError}>{errors.apellido_nombre.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>DNI *</label>
                  <input
                    type="text"
                    className="input-field mono"
                    placeholder="Ej: 36222111"
                    {...register("dni")}
                  />
                  {errors.dni && <span className={styles.formError}>{errors.dni.message}</span>}
                </div>
                <div className={styles.formGroup}>
                  <label>CUIT/CUIL *</label>
                  <input
                    type="text"
                    className="input-field mono"
                    placeholder="Ej: 27362221112"
                    {...register("cuit")}
                  />
                  {errors.cuit && <span className={styles.formError}>{errors.cuit.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Fecha de Nacimiento</label>
                  <input type="date" className="input-field" {...register("fecha_nacimiento")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Nacionalidad</label>
                  <input type="text" className="input-field" {...register("nacionalidad")} />
                </div>
              </div>
            </div>
          )}

          {formTab === "asignacion" && (
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Subsecretaría *</label>
                  <select className="input-field" {...register("subsecretaria_id")}>
                    <option value="">Seleccione una opción</option>
                    {subsecretarias.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                  {errors.subsecretaria_id && <span className={styles.formError}>{errors.subsecretaria_id.message}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label>Área *</label>
                  <select
                    className="input-field"
                    {...register("area_id")}
                    disabled={!selectedSub}
                  >
                    <option value="">Seleccione una opción</option>
                    {filteredAreasForForm.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                  {errors.area_id && <span className={styles.formError}>{errors.area_id.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Responsable Directo</label>
                  <Controller
                    control={control}
                    name="responsable_id"
                    render={({ field }) => (
                      <SearchableSelect
                        options={responsables.map((r) => ({ value: r.id, label: r.nombre_completo }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Buscar responsable..."
                      />
                    )}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Categoría ARCA (Letra) *</label>
                  <select className="input-field" {...register("categoria_mono_id")}>
                    <option value="">Seleccione una categoría</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        Letra {c.letra} (${Number(c.monto).toLocaleString("es-AR")}) - {c.descripcion_categoria || "Tareas Generales"}
                      </option>
                    ))}
                  </select>
                  {errors.categoria_mono_id && <span className={styles.formError}>{errors.categoria_mono_id.message}</span>}
                </div>
              </div>

              {/* Import Calculation Preview */}
              {selectedCat && (
                <div className={`${styles.calculationPreview} glass-panel`}>
                  <h3>Desglose de Haberes (Semestre {activeSemestre?.nombre_display})</h3>
                  <div className={styles.calcRow}>
                    <span>Importe Monotributo Base:</span>
                    <span className="mono font-semibold">${formAmountPreview.base.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={styles.calcRow}>
                    <span>Tarjeta Activa (10%):</span>
                    <span className="mono font-semibold">+ ${formAmountPreview.activa.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={`${styles.calcRow} ${styles.calcTotal}`}>
                    <span>Total Liquidado:</span>
                    <span className="mono font-bold text-emerald">${formAmountPreview.total.toLocaleString("es-AR")}</span>
                  </div>
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Fecha de Alta en Nómina *</label>
                  <input type="date" className="input-field" {...register("fecha_alta")} />
                  {errors.fecha_alta && <span className={styles.formError}>{errors.fecha_alta.message}</span>}
                </div>
              </div>
            </div>
          )}

          {formTab === "contacto" && (
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Teléfono de Contacto</label>
                  <input type="text" className="input-field" placeholder="Ej: 3515554433" {...register("telefono")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Correo Electrónico</label>
                  <input type="email" className="input-field" placeholder="Ej: maria@gmail.com" {...register("email")} />
                  {errors.email && <span className={styles.formError}>{errors.email.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>CBU Bancario</label>
                  <input type="text" className="input-field mono" placeholder="22 dígitos" {...register("cbu")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Nro Tarjeta Activa</label>
                  <input type="text" className="input-field mono" placeholder="16 dígitos" {...register("tarjeta_activa_nro")} />
                </div>
              </div>

              <h3 className={styles.formSubtitle}>Domicilio</h3>
              
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Provincia</label>
                  <input type="text" className="input-field" {...register("provincia")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Localidad</label>
                  <input type="text" className="input-field" {...register("localidad")} />
                </div>
                <div className={styles.formGroup}>
                  <label>C.P.</label>
                  <input type="text" className="input-field mono" {...register("codigo_postal")} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Barrio</label>
                  <input type="text" className="input-field" {...register("barrio")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Calle</label>
                  <input type="text" className="input-field" {...register("calle")} />
                </div>
                <div className={styles.formGroup} style={{ flex: 0.5 }}>
                  <label>Nro</label>
                  <input type="text" className="input-field" {...register("nro")} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Piso</label>
                  <input type="text" className="input-field" {...register("piso")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Depto</label>
                  <input type="text" className="input-field" {...register("depto")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Lote</label>
                  <input type="text" className="input-field" {...register("lote")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Manzana</label>
                  <input type="text" className="input-field" {...register("manzana")} />
                </div>
              </div>
            </div>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="input-field"
              style={{ cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.primaryBtn}>
              Registrar Monotributista
            </button>
          </div>
        </form>
      </Drawer>

      {/* DRAWER: Edit Monotributista */}
      <Drawer
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Modificar Monotributista: ${selectedPerson?.apellido_nombre || ""}`}
        size="lg"
      >
        <div className={styles.drawerTabs}>
          <button
            className={`${styles.tabBtn} ${formTab === "personal" ? styles.activeTab : ""}`}
            onClick={() => setFormTab("personal")}
          >
            Datos Personales
          </button>
          <button
            className={`${styles.tabBtn} ${formTab === "asignacion" ? styles.activeTab : ""}`}
            onClick={() => setFormTab("asignacion")}
          >
            Asignación y Monto
          </button>
          <button
            className={`${styles.tabBtn} ${formTab === "contacto" ? styles.activeTab : ""}`}
            onClick={() => setFormTab("contacto")}
          >
            Contacto y Domicilio
          </button>
        </div>

        <form onSubmit={handleSubmit(onEditSubmit)} className={styles.drawerForm}>
          {formTab === "personal" && (
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Apellido y Nombre *</label>
                  <input type="text" className="input-field" {...register("apellido_nombre")} />
                  {errors.apellido_nombre && <span className={styles.formError}>{errors.apellido_nombre.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>DNI *</label>
                  <input type="text" className="input-field mono" {...register("dni")} />
                  {errors.dni && <span className={styles.formError}>{errors.dni.message}</span>}
                </div>
                <div className={styles.formGroup}>
                  <label>CUIT/CUIL *</label>
                  <input type="text" className="input-field mono" {...register("cuit")} />
                  {errors.cuit && <span className={styles.formError}>{errors.cuit.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Fecha de Nacimiento</label>
                  <input type="date" className="input-field" {...register("fecha_nacimiento")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Nacionalidad</label>
                  <input type="text" className="input-field" {...register("nacionalidad")} />
                </div>
              </div>
            </div>
          )}

          {formTab === "asignacion" && (
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Subsecretaría *</label>
                  <select className="input-field" {...register("subsecretaria_id")}>
                    <option value="">Seleccione una opción</option>
                    {subsecretarias.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                  {errors.subsecretaria_id && <span className={styles.formError}>{errors.subsecretaria_id.message}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label>Área *</label>
                  <select className="input-field" {...register("area_id")}>
                    <option value="">Seleccione una opción</option>
                    {areas
                      .filter((a) => a.subsecretaria_id === selectedSub)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                  </select>
                  {errors.area_id && <span className={styles.formError}>{errors.area_id.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Responsable Directo</label>
                  <Controller
                    control={control}
                    name="responsable_id"
                    render={({ field }) => (
                      <SearchableSelect
                        options={responsables.map((r) => ({ value: r.id, label: r.nombre_completo }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Buscar responsable..."
                      />
                    )}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Categoría ARCA (Letra) *</label>
                  <select className="input-field" {...register("categoria_mono_id")}>
                    <option value="">Seleccione una categoría</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        Letra {c.letra} (${Number(c.monto).toLocaleString("es-AR")})
                      </option>
                    ))}
                  </select>
                  {errors.categoria_mono_id && <span className={styles.formError}>{errors.categoria_mono_id.message}</span>}
                </div>
              </div>

              {/* Import Calculation Preview */}
              {selectedCat && (
                <div className={`${styles.calculationPreview} glass-panel`}>
                  <h3>Desglose de Haberes (Semestre {activeSemestre?.nombre_display})</h3>
                  <div className={styles.calcRow}>
                    <span>Importe Monotributo Base:</span>
                    <span className="mono font-semibold">${formAmountPreview.base.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={styles.calcRow}>
                    <span>Tarjeta Activa (10%):</span>
                    <span className="mono font-semibold">+ ${formAmountPreview.activa.toLocaleString("es-AR")}</span>
                  </div>
                  <div className={`${styles.calcRow} ${styles.calcTotal}`}>
                    <span>Total Liquidado:</span>
                    <span className="mono font-bold text-emerald">${formAmountPreview.total.toLocaleString("es-AR")}</span>
                  </div>
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Fecha de Alta en Nómina *</label>
                  <input type="date" className="input-field" {...register("fecha_alta")} />
                  {errors.fecha_alta && <span className={styles.formError}>{errors.fecha_alta.message}</span>}
                </div>
              </div>
            </div>
          )}

          {formTab === "contacto" && (
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Teléfono de Contacto</label>
                  <input type="text" className="input-field" {...register("telefono")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Correo Electrónico</label>
                  <input type="email" className="input-field" {...register("email")} />
                  {errors.email && <span className={styles.formError}>{errors.email.message}</span>}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>CBU Bancario</label>
                  <input type="text" className="input-field mono" {...register("cbu")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Nro Tarjeta Activa</label>
                  <input type="text" className="input-field mono" {...register("tarjeta_activa_nro")} />
                </div>
              </div>

              <h3 className={styles.formSubtitle}>Domicilio</h3>
              
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Provincia</label>
                  <input type="text" className="input-field" {...register("provincia")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Localidad</label>
                  <input type="text" className="input-field" {...register("localidad")} />
                </div>
                <div className={styles.formGroup}>
                  <label>C.P.</label>
                  <input type="text" className="input-field mono" {...register("codigo_postal")} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Barrio</label>
                  <input type="text" className="input-field" {...register("barrio")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Calle</label>
                  <input type="text" className="input-field" {...register("calle")} />
                </div>
                <div className={styles.formGroup} style={{ flex: 0.5 }}>
                  <label>Nro</label>
                  <input type="text" className="input-field" {...register("nro")} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Piso</label>
                  <input type="text" className="input-field" {...register("piso")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Depto</label>
                  <input type="text" className="input-field" {...register("depto")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Lote</label>
                  <input type="text" className="input-field" {...register("lote")} />
                </div>
                <div className={styles.formGroup}>
                  <label>Manzana</label>
                  <input type="text" className="input-field" {...register("manzana")} />
                </div>
              </div>
            </div>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="input-field"
              style={{ cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.primaryBtn}>
              Modificar Datos
            </button>
          </div>
        </form>
      </Drawer>

      {/* DRAWER: Procesar Baja */}
      <Drawer
        isOpen={isBajaOpen}
        onClose={() => setIsBajaOpen(false)}
        title="Procesar Baja de Monotributista"
        size="sm"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className={styles.warningBox}>
            <AlertTriangle size={24} className="text-amber" />
            <p>
              Está por procesar la baja de <strong>{selectedPerson?.apellido_nombre}</strong>. El registro se mantendrá en estado inactivo con fines históricos.
            </p>
          </div>

          <div className={styles.formGroup}>
            <label>Fecha de Baja *</label>
            <input
              type="date"
              className="input-field"
              value={bajaFecha}
              onChange={(e) => setBajaFecha(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Motivo de Baja *</label>
            <textarea
              className="input-field"
              rows={4}
              placeholder="Indique el motivo detallado de la baja (Obligatorio)"
              value={bajaMotivo}
              onChange={(e) => setBajaMotivo(e.target.value)}
              style={{ resize: "none", fontSize: "14px" }}
            />
          </div>

          <div className={styles.formActions} style={{ marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => setIsBajaOpen(false)}
              className="input-field"
              style={{ cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleBajaSubmit}
              className={`${styles.primaryBtn} ${styles.dangerBtn}`}
              disabled={!bajaMotivo.trim()}
            >
              Confirmar Baja
            </button>
          </div>
        </div>
      </Drawer>

      {/* DRAWER: Importar Excel (Carga Única) */}
      <Drawer
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setImportFile(null);
          setImportPreview([]);
          setImportErrors([]);
          setImportSummary(null);
        }}
        title="Importación Inicial de Nómina (Carga Única)"
        size="xl"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className={styles.infoBox}>
            <Info size={20} className="text-blue" />
            <p>
              Utilice esta herramienta para cargar la nómina de monotributistas por primera vez. Si el archivo contiene nuevas áreas, subsecretarías o responsables, se crearán automáticamente. Los montos se vincularán al semestre activo.
            </p>
          </div>

          <FileDropzone onFileSelect={handleExcelSelected} />

          {/* Import Summary & Warnings */}
          {importSummary && (
            <div className={styles.importDashboard}>
              <div className={styles.summaryGrid}>
                <div className={`${styles.summaryCard} glass-panel`}>
                  <span className={styles.summaryCardLabel}>Total Registros</span>
                  <span className={styles.summaryCardValue}>{importSummary.totalRows}</span>
                </div>
                <div className={`${styles.summaryCard} glass-panel`}>
                  <span className={styles.summaryCardLabel}>Filas Válidas</span>
                  <span className={`${styles.summaryCardValue} text-emerald`}>
                    {importSummary.validRows}
                  </span>
                </div>
                <div className={`${styles.summaryCard} glass-panel`}>
                  <span className={styles.summaryCardLabel}>Filas con Error</span>
                  <span className={`${styles.summaryCardValue} ${importSummary.errorRows > 0 ? "text-rose" : ""}`}>
                    {importSummary.errorRows}
                  </span>
                </div>
                <div className={`${styles.summaryCard} glass-panel`}>
                  <span className={styles.summaryCardLabel}>Total Presupuesto</span>
                  <span className="mono font-bold text-emerald" style={{ fontSize: "20px" }}>
                    ${importSummary.totalAmount.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>

              {/* Warnings and Errors List */}
              {importErrors.length > 0 && (
                <div className={`${styles.errorsBox} glass-panel`}>
                  <h3>Reporte de Advertencias y Errores ({importErrors.length})</h3>
                  <div className={styles.errorsList}>
                    {importErrors.map((err, i) => (
                      <div
                        key={i}
                        className={`${styles.errorItem} ${
                          err.severity === "error" ? styles.errItemError : styles.errItemWarning
                        }`}
                      >
                        <span className={styles.errRow}>Fila {err.row}:</span>
                        <span className={styles.errField}>[{err.field}]</span>
                        <span className={styles.errMessage}>{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table Preview */}
              {importPreview.length > 0 && (
                <div className={`${styles.previewTableWrapper} glass-panel`}>
                  <h3>Vista Previa de Carga</h3>
                  <div className={styles.tableResponsive}>
                    <table className={styles.table} style={{ fontSize: "13px" }}>
                      <thead>
                        <tr>
                          <th>Apellido y Nombre</th>
                          <th>DNI</th>
                          <th>Subsecretaría</th>
                          <th>Área</th>
                          <th>Responsable</th>
                          <th>Importe Beca</th>
                          <th>Tarjeta Activa (10%)</th>
                          <th>Monto Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 15).map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.apellido_nombre}</td>
                            <td className="mono">{row.dni}</td>
                            <td>{row.subsecretaria}</td>
                            <td>{row.area}</td>
                            <td>{row.responsable}</td>
                            <td className="mono">${row.importe_mensual.toLocaleString("es-AR")}</td>
                            <td className="mono">${row.importe_tarjeta_activa.toLocaleString("es-AR")}</td>
                            <td className="mono text-emerald">${row.importe_total.toLocaleString("es-AR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.length > 15 && (
                    <p className={styles.tableFooterNote}>
                      ... y {importPreview.length - 15} monotributistas más en el archivo.
                    </p>
                  )}
                </div>
              )}

              {/* Confirm Import */}
              <div className={styles.formActions}>
                <button
                  onClick={() => {
                    setImportFile(null);
                    setImportPreview([]);
                    setImportErrors([]);
                    setImportSummary(null);
                  }}
                  className="input-field"
                  style={{ cursor: "pointer" }}
                  disabled={importing}
                >
                  Limpiar Archivo
                </button>
                <button
                  onClick={handleConfirmImport}
                  className={styles.primaryBtn}
                  disabled={importing || importSummary.validRows === 0}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  {importing && <Loader2 className={styles.spin} size={16} />}
                  <span>
                    {importing ? "Importando nómina..." : "Confirmar Importación Completa"}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
