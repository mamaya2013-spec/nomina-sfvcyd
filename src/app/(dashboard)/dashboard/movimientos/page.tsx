"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Activity,
  User,
  Users,
  CheckCircle2,
  Trash2,
  TrendingUp,
  RefreshCw,
  Info,
  Plus,
  ArrowRightLeft
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { toast, Toaster } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Drawer from "@/components/ui/Drawer";
import styles from "./movimientos.module.css";

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Validation Schemas
const altaSchema = z.object({
  tipo_persona: z.enum(["becario", "monotributista"]),
  apellido_nombre: z.string().min(3, "Mínimo 3 caracteres"),
  dni: z.string().regex(/^\d{7,8}$/, "DNI debe tener 7 u 8 dígitos numéricos"),
  cuit: z.string().regex(/^\d{11}$/, "CUIT/CUIL debe tener 11 dígitos numéricos"),
  subsecretaria_id: z.string().regex(uuidRegex, "Seleccione una subsecretaría"),
  area_id: z.string().regex(uuidRegex, "Seleccione un área"),
  responsable_id: z.string().regex(uuidRegex, "Responsable inválido").or(z.literal("")).nullable().optional(),
  categoria_id: z.string().regex(uuidRegex, "Seleccione una categoría"),
  fecha_alta: z.string().min(1, "Fecha de alta requerida"),
  solicitado_por: z.string().min(2, "Especifique quién solicitó el alta"),
  cbu: z.string().or(z.literal("")).nullable().optional(),
  tarjeta_activa_nro: z.string().or(z.literal("")).nullable().optional(),
  telefono: z.string().or(z.literal("")).nullable().optional(),
  email: z.string().email("Email inválido").or(z.literal("")).nullable().optional(),
  nacionalidad: z.string().or(z.literal("")).nullable().optional(),
  codigo_postal: z.string().or(z.literal("")).nullable().optional(),
  provincia: z.string().or(z.literal("")).nullable().optional(),
  departamento: z.string().or(z.literal("")).nullable().optional(),
  localidad: z.string().or(z.literal("")).nullable().optional(),
  barrio: z.string().or(z.literal("")).nullable().optional(),
  calle: z.string().or(z.literal("")).nullable().optional(),
  nro: z.string().or(z.literal("")).nullable().optional(),
  piso: z.string().or(z.literal("")).nullable().optional(),
  depto: z.string().or(z.literal("")).nullable().optional(),
  lote: z.string().or(z.literal("")).nullable().optional(),
  manzana: z.string().or(z.literal("")).nullable().optional(),
  fecha_nacimiento: z.string().or(z.literal("")).nullable().optional(),
});

const bajaSchema = z.object({
  tipo_persona: z.enum(["becario", "monotributista"]),
  persona_id: z.string().regex(uuidRegex, "Seleccione una persona"),
  fecha_baja: z.string().min(1, "Fecha de baja requerida"),
  motivo_baja: z.string().min(3, "El motivo de baja es obligatorio"),
  solicitado_por: z.string().min(2, "Especifique quién solicitó la baja"),
});

const modificacionSchema = z.object({
  tipo_persona: z.enum(["becario", "monotributista"]),
  persona_id: z.string().regex(uuidRegex, "Seleccione una persona"),
  categoria_id: z.string().regex(uuidRegex, "Seleccione la nueva categoría"),
  mes: z.number().min(1).max(12),
  anio: z.number().min(2020).max(2100),
  solicitado_por: z.string().min(2, "Especifique quién solicitó la modificación"),
  observaciones: z.string().or(z.literal("")).nullable().optional(),
});

type AltaValues = z.infer<typeof altaSchema>;
type BajaValues = z.infer<typeof bajaSchema>;
type ModificacionValues = z.infer<typeof modificacionSchema>;

export default function MovimientosPage() {
  const supabase = createClient();
  const { selectedSemester } = useSemester();

  // Data States
  const [movements, setMovements] = useState<any[]>([]);
  const [peopleMap, setPeopleMap] = useState<Record<string, { nombre: string; dni?: string }>>({});
  const [usersMap, setUsersMap] = useState<Record<string, { nombre: string; email: string }>>({});
  const [loading, setLoading] = useState(true);

  // Core catalogs for forms
  const [subsecretarias, setSubsecretarias] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [responsables, setResponsables] = useState<any[]>([]);
  const [categoriasBecas, setCategoriasBecas] = useState<any[]>([]);
  const [categoriasMonos, setCategoriasMonos] = useState<any[]>([]);
  const [activePeople, setActivePeople] = useState<any[]>([]);

  // Search filter for dropdowns
  const [dropdownSearch, setDropdownSearch] = useState("");

  // Drawer States
  const [activeDrawer, setActiveDrawer] = useState<"alta" | "baja" | "modificacion" | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterMovimiento, setFilterMovimiento] = useState<string>("all");

  // Available Years
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => current - 3 + i);
  }, []);

  // Period Filter States
  const [periodType, setPeriodType] = useState<"todos" | "semestre" | "mes">("todos");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedSemesterNum, setSelectedSemesterNum] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(1);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // React Hook Forms setup
  const altaForm = useForm<AltaValues>({
    resolver: zodResolver(altaSchema),
    defaultValues: {
      tipo_persona: "becario",
      apellido_nombre: "",
      dni: "",
      cuit: "",
      subsecretaria_id: "",
      area_id: "",
      responsable_id: "",
      categoria_id: "",
      fecha_alta: new Date().toISOString().split("T")[0],
      solicitado_por: "",
      cbu: "",
      tarjeta_activa_nro: "",
      telefono: "",
      email: "",
      nacionalidad: "",
      codigo_postal: "",
      provincia: "",
      departamento: "",
      localidad: "",
      barrio: "",
      calle: "",
      nro: "",
      piso: "",
      depto: "",
      lote: "",
      manzana: "",
      fecha_nacimiento: "",
    }
  });

  const bajaForm = useForm<BajaValues>({
    resolver: zodResolver(bajaSchema),
    defaultValues: {
      tipo_persona: "becario",
      persona_id: "",
      fecha_baja: new Date().toISOString().split("T")[0],
      motivo_baja: "",
      solicitado_por: "",
    }
  });

  const modForm = useForm<ModificacionValues>({
    resolver: zodResolver(modificacionSchema),
    defaultValues: {
      tipo_persona: "becario",
      persona_id: "",
      categoria_id: "",
      mes: new Date().getMonth() + 1,
      anio: new Date().getFullYear(),
      solicitado_por: "",
      observaciones: "",
    }
  });

  // Watchers to filter areas/categories
  const selectedAltaTipo = altaForm.watch("tipo_persona");
  const selectedAltaSub = altaForm.watch("subsecretaria_id");
  const selectedBajaTipo = bajaForm.watch("tipo_persona");
  const selectedModTipo = modForm.watch("tipo_persona");

  // Dynamic area list based on selected subsecretaria in Alta
  const filteredAreasForAlta = useMemo(() => {
    if (!selectedAltaSub) return [];
    return areas.filter((a) => a.subsecretaria_id === selectedAltaSub);
  }, [selectedAltaSub, areas]);

  // Dynamic categories list based on type of person in Alta
  const dynamicCategoriesForAlta = useMemo(() => {
    return selectedAltaTipo === "becario" ? categoriasBecas : categoriasMonos;
  }, [selectedAltaTipo, categoriasBecas, categoriasMonos]);

  // Dynamic categories list for Modificación
  const dynamicCategoriesForMod = useMemo(() => {
    return selectedModTipo === "becario" ? categoriasBecas : categoriasMonos;
  }, [selectedModTipo, categoriasBecas, categoriasMonos]);

  // Filtered active people based on chosen type in Baja or Modificación
  const filteredActivePeople = useMemo(() => {
    const type = activeDrawer === "baja" ? selectedBajaTipo : selectedModTipo;
    const people = activePeople.filter((p) => p.tipo === type);
    if (!dropdownSearch.trim()) return people;
    const term = dropdownSearch.toLowerCase();
    return people.filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.dni.includes(term)
    );
  }, [activePeople, selectedBajaTipo, selectedModTipo, activeDrawer, dropdownSearch]);

  // Fetch core catalogs (areas, subsecretarias, categories)
  const fetchCatalogs = async () => {
    if (!selectedSemester) return;
    try {
      const { data: subs } = await supabase.from("subsecretarias").select("*").eq("activa", true).order("orden");
      const { data: ars } = await supabase.from("areas").select("*").eq("activa", true).order("orden");
      const { data: resps } = await supabase.from("responsables").select("*").eq("activo", true).order("nombre_completo");
      const { data: cb } = await supabase.from("categorias_becas").select("*").eq("semestre_id", selectedSemester.id).order("numero_categoria");
      const { data: cm } = await supabase.from("categorias_monotributistas").select("*").eq("semestre_id", selectedSemester.id).order("letra");

      setSubsecretarias(subs || []);
      setAreas(ars || []);
      setResponsables(resps || []);
      setCategoriasBecas(cb || []);
      setCategoriasMonos(cm || []);

      // Fetch active people
      const { data: activeBecs } = await supabase
        .from("becarios")
        .select("id, apellido_nombre, dni, subsecretaria_id, area_id, responsable_id, categoria_beca_id, importe_mensual_beca, importe_tarjeta_activa, importe_total")
        .eq("estado", "Activo");

      const { data: activeMonos } = await supabase
        .from("monotributistas")
        .select("id, apellido_nombre, dni, subsecretaria_id, area_id, responsable_id, categoria_mono_id, importe_tarjeta_activa, importe_total")
        .eq("estado", "Activo");

      const peopleList = [
        ...(activeBecs || []).map((b) => ({
          id: b.id,
          nombre: b.apellido_nombre,
          dni: b.dni,
          tipo: "becario",
          info: b
        })),
        ...(activeMonos || []).map((m) => ({
          id: m.id,
          nombre: m.apellido_nombre,
          dni: m.dni,
          tipo: "monotributista",
          info: m
        }))
      ].sort((a, b) => a.nombre.localeCompare(b.nombre));

      setActivePeople(peopleList);
    } catch (err: any) {
      console.error("Error loading catalogs:", err);
    }
  };

  const fetchMovementsData = async () => {
    if (!selectedYear) return;
    setLoading(true);
    try {
      // 1. Fetch movements for selected year
      const { data: movs, error: movsErr } = await supabase
        .from("movimientos")
        .select("*")
        .eq("anio", selectedYear)
        .order("created_at", { ascending: false });

      if (movsErr) throw movsErr;
      const fetchedMovs = movs || [];
      setMovements(fetchedMovs);

      // 2. Resolve persona names and DNIs
      const becarioIds = fetchedMovs
        .filter((m) => m.tipo_persona === "becario")
        .map((m) => m.persona_id);
      const monotributistaIds = fetchedMovs
        .filter((m) => m.tipo_persona === "monotributista")
        .map((m) => m.persona_id);

      const resolvedPeople: Record<string, { nombre: string; dni?: string }> = {};

      if (becarioIds.length > 0) {
        const { data: becariosData } = await supabase
          .from("becarios")
          .select("id, apellido_nombre, dni")
          .in("id", becarioIds);
        becariosData?.forEach((b) => {
          resolvedPeople[b.id] = { nombre: b.apellido_nombre, dni: b.dni };
        });
      }

      if (monotributistaIds.length > 0) {
        const { data: monosData } = await supabase
          .from("monotributistas")
          .select("id, apellido_nombre, dni")
          .in("id", monotributistaIds);
        monosData?.forEach((m) => {
          resolvedPeople[m.id] = { nombre: m.apellido_nombre, dni: m.dni };
        });
      }

      setPeopleMap(resolvedPeople);

      // 3. Resolve user details
      const userIds = Array.from(
        new Set(fetchedMovs.filter((m) => m.usuario_id).map((m) => m.usuario_id))
      );

      const resolvedUsers: Record<string, { nombre: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, email, nombre_completo")
          .in("id", userIds);
        usersData?.forEach((u) => {
          resolvedUsers[u.id] = {
            nombre: u.nombre_completo || u.email.split("@")[0],
            email: u.email
          };
        });
      }
      setUsersMap(resolvedUsers);

    } catch (err: any) {
      toast.error("Error al cargar movimientos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      setSelectedYear(selectedSemester.anio);
      setSelectedSemesterNum(selectedSemester.numero_semestre);
      setSelectedMonth(selectedSemester.numero_semestre === 1 ? 1 : 7);
      fetchCatalogs();
    }
  }, [selectedSemester]);

  useEffect(() => {
    if (selectedYear) {
      fetchMovementsData();
      setCurrentPage(1);
    }
  }, [selectedYear]);

  // Adjust categories in forms when types of person change
  useEffect(() => {
    altaForm.setValue("categoria_id", "");
  }, [selectedAltaTipo]);

  useEffect(() => {
    bajaForm.setValue("persona_id", "");
    setDropdownSearch("");
  }, [selectedBajaTipo, activeDrawer]);

  useEffect(() => {
    modForm.setValue("persona_id", "");
    modForm.setValue("categoria_id", "");
    setDropdownSearch("");
  }, [selectedModTipo, activeDrawer]);

  // Period filter logic
  const periodFilteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (periodType === "todos") {
        return true;
      }
      if (periodType === "semestre") {
        if (selectedSemesterNum === 1) {
          return m.mes >= 1 && m.mes <= 6;
        } else {
          return m.mes >= 7 && m.mes <= 12;
        }
      }
      if (periodType === "mes") {
        return m.mes === selectedMonth;
      }
      return true;
    });
  }, [movements, periodType, selectedSemesterNum, selectedMonth]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const total = periodFilteredMovements.length;
    const altas = periodFilteredMovements.filter((m) => m.tipo_movimiento === "alta").length;
    const bajas = periodFilteredMovements.filter((m) => m.tipo_movimiento === "baja").length;
    const cambios = periodFilteredMovements.filter(
      (m) => m.tipo_movimiento === "cambio_monto" || m.tipo_movimiento === "cambio_categoria"
    ).length;

    return { total, altas, bajas, cambios };
  }, [periodFilteredMovements]);

  // Filtering Logic
  const filteredMovements = useMemo(() => {
    return periodFilteredMovements.filter((m) => {
      if (filterPersona !== "all" && m.tipo_persona !== filterPersona) {
        return false;
      }

      if (filterMovimiento !== "all" && m.tipo_movimiento !== filterMovimiento) {
        return false;
      }

      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const person = peopleMap[m.persona_id];
        const personName = person?.nombre?.toLowerCase() || "";
        const personDni = person?.dni || "";
        const description = m.descripcion?.toLowerCase() || "";
        const solicitado = m.solicitado_por?.toLowerCase() || "";

        return (
          personName.includes(term) ||
          personDni.includes(term) ||
          description.includes(term) ||
          solicitado.includes(term)
        );
      }

      return true;
    });
  }, [periodFilteredMovements, filterPersona, filterMovimiento, searchTerm, peopleMap]);

  // Pagination Logic
  const totalItems = filteredMovements.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const paginatedMovements = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMovements.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMovements, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Submit Alta Action
  const handleAltaSubmit = async (data: AltaValues) => {
    setSubmitLoading(true);
    try {
      const isBecario = data.tipo_persona === "becario";
      const targetTable = isBecario ? "becarios" : "monotributistas";
      const catList = isBecario ? categoriasBecas : categoriasMonos;
      const selectedCategory = catList.find((c) => c.id === data.categoria_id);

      if (!selectedCategory) {
        throw new Error("Categoría no encontrada");
      }

      const fechaAlta = new Date(data.fecha_alta + "T12:00:00");
      const altaMes = fechaAlta.getMonth() + 1;
      const altaAnio = fechaAlta.getFullYear();

      // Setup payload based on person type
      let payload: Record<string, any> = {
        apellido_nombre: data.apellido_nombre,
        dni: data.dni,
        cuit: data.cuit,
        subsecretaria_id: data.subsecretaria_id,
        area_id: data.area_id,
        responsable_id: data.responsable_id || null,
        fecha_alta: data.fecha_alta,
        cbu: data.cbu || null,
        tarjeta_activa_nro: data.tarjeta_activa_nro || null,
        telefono: data.telefono || null,
        email: data.email || null,
        nacionalidad: data.nacionalidad || null,
        codigo_postal: data.codigo_postal || null,
        provincia: data.provincia || null,
        departamento: data.departamento || null,
        localidad: data.localidad || null,
        barrio: data.barrio || null,
        calle: data.calle || null,
        nro: data.nro || null,
        piso: data.piso || null,
        depto: data.depto || null,
        lote: data.lote || null,
        manzana: data.manzana || null,
        fecha_nacimiento: data.fecha_nacimiento || null,
        estado: "Activo"
      };

      if (isBecario) {
        payload.categoria_beca_id = data.categoria_id;
        payload.importe_mensual_beca = Number(selectedCategory.monto);
        payload.importe_tarjeta_activa = Number(selectedCategory.monto_activa);
        payload.importe_total = Number(selectedCategory.total);
      } else {
        payload.categoria_mono_id = data.categoria_id;
        payload.importe_mensual_monotributo = Number(selectedCategory.monto);
        payload.importe_tarjeta_activa = Number(selectedCategory.monto_activa);
        payload.importe_total = Number(selectedCategory.total);
      }

      const { data: newPerson, error: insErr } = await supabase
        .from(targetTable)
        .insert(payload)
        .select("id")
        .single();

      if (insErr) throw insErr;

      const { data: { user } } = await supabase.auth.getUser();

      // Log in audit log
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: `Alta de ${isBecario ? "Becario" : "Monotributista"} desde Movimientos`,
        tabla_afectada: targetTable,
        datos_nuevos: payload,
      });

      // Log in movements log
      await supabase.from("movimientos").insert({
        tipo_persona: data.tipo_persona,
        persona_id: newPerson.id,
        tipo_movimiento: "alta",
        anio: altaAnio,
        mes: altaMes,
        descripcion: `Alta registrada. Solicitado por: ${data.solicitado_por}`,
        datos_nuevos: { estado: "Activo", fecha_alta: data.fecha_alta },
        solicitado_por: data.solicitado_por,
        usuario_id: user?.id
      });

      toast.success(`${isBecario ? "Becario" : "Monotributista"} registrado exitosamente.`);
      setActiveDrawer(null);
      altaForm.reset();
      fetchMovementsData();
      fetchCatalogs();
    } catch (err: any) {
      toast.error("Error al registrar alta: " + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  // Submit Baja Action
  const handleBajaSubmit = async (data: BajaValues) => {
    setSubmitLoading(true);
    try {
      const isBecario = data.tipo_persona === "becario";
      const targetTable = isBecario ? "becarios" : "monotributistas";
      
      const { error: updErr } = await supabase
        .from(targetTable)
        .update({
          estado: "Baja",
          fecha_baja: data.fecha_baja,
          motivo_baja: data.motivo_baja
        })
        .eq("id", data.persona_id);

      if (updErr) throw updErr;

      const fechaBaja = new Date(data.fecha_baja + "T12:00:00");
      const { data: { user } } = await supabase.auth.getUser();

      // Log in audit log
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: `Baja de ${isBecario ? "Becario" : "Monotributista"} desde Movimientos`,
        tabla_afectada: targetTable,
        registro_id: data.persona_id,
        datos_nuevos: { estado: "Baja", fecha_baja: data.fecha_baja, motivo_baja: data.motivo_baja }
      });

      // Log in movements log
      await supabase.from("movimientos").insert({
        tipo_persona: data.tipo_persona,
        persona_id: data.persona_id,
        tipo_movimiento: "baja",
        anio: fechaBaja.getFullYear(),
        mes: fechaBaja.getMonth() + 1,
        descripcion: `Baja procesada. Motivo: ${data.motivo_baja}. Solicitado por: ${data.solicitado_por}`,
        datos_anteriores: { estado: "Activo" },
        datos_nuevos: { estado: "Baja", fecha_baja: data.fecha_baja, motivo_baja: data.motivo_baja },
        solicitado_por: data.solicitado_por,
        usuario_id: user?.id
      });

      toast.success("Baja procesada con éxito.");
      setActiveDrawer(null);
      bajaForm.reset();
      fetchMovementsData();
      fetchCatalogs();
    } catch (err: any) {
      toast.error("Error al registrar baja: " + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  // Submit Modificación Action
  const handleModSubmit = async (data: ModificacionValues) => {
    setSubmitLoading(true);
    try {
      const isBecario = data.tipo_persona === "becario";
      const targetTable = isBecario ? "becarios" : "monotributistas";
      const catList = isBecario ? categoriasBecas : categoriasMonos;
      const selectedCategory = catList.find((c) => c.id === data.categoria_id);
      
      if (!selectedCategory) {
        throw new Error("Categoría no encontrada");
      }

      const person = activePeople.find((p) => p.id === data.persona_id);
      if (!person) {
        throw new Error("Persona no encontrada");
      }

      const oldMonto = isBecario
        ? Number(person.info.importe_mensual_beca)
        : Number(person.info.importe_mensual_monotributo || 0);

      const oldCatId = isBecario
        ? person.info.categoria_beca_id
        : person.info.categoria_mono_id;

      let payload: Record<string, any> = {};

      if (isBecario) {
        payload.categoria_beca_id = data.categoria_id;
        payload.importe_mensual_beca = Number(selectedCategory.monto);
        payload.importe_tarjeta_activa = Number(selectedCategory.monto_activa);
        payload.importe_total = Number(selectedCategory.total);
      } else {
        payload.categoria_mono_id = data.categoria_id;
        payload.importe_mensual_monotributo = Number(selectedCategory.monto);
        payload.importe_tarjeta_activa = Number(selectedCategory.monto_activa);
        payload.importe_total = Number(selectedCategory.total);
      }

      const { error: updErr } = await supabase
        .from(targetTable)
        .update(payload)
        .eq("id", data.persona_id);

      if (updErr) throw updErr;

      const { data: { user } } = await supabase.auth.getUser();

      // Log in audit log
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: `Modificación de monto/categoría desde Movimientos`,
        tabla_afectada: targetTable,
        registro_id: data.persona_id,
        datos_nuevos: payload
      });

      // Log in movements log
      await supabase.from("movimientos").insert({
        tipo_persona: data.tipo_persona,
        persona_id: data.persona_id,
        tipo_movimiento: isBecario ? "cambio_monto" : "cambio_categoria",
        anio: data.anio,
        mes: data.mes,
        descripcion: `Modificación de categoría. Solicitado por: ${data.solicitado_por}. Observaciones: ${data.observaciones || "Ninguna"}`,
        datos_anteriores: {
          monto: oldMonto,
          categoria_id: oldCatId
        },
        datos_nuevos: {
          monto: Number(selectedCategory.monto),
          categoria_id: selectedCategory.id
        },
        solicitado_por: data.solicitado_por,
        usuario_id: user?.id
      });

      toast.success("Categoría modificada con éxito.");
      setActiveDrawer(null);
      modForm.reset();
      fetchMovementsData();
      fetchCatalogs();
    } catch (err: any) {
      toast.error("Error al modificar categoría: " + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  // Date Formatting Helper
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  const getMonthName = (monthNum: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return months[monthNum - 1] || monthNum;
  };

  const getPersonaBadgeClass = (tipo: string) => {
    return tipo === "becario" ? styles.badge_becario : styles.badge_monotributista;
  };

  const getMovimientoBadgeClass = (tipo: string) => {
    switch (tipo) {
      case "alta":
        return styles.badge_alta;
      case "baja":
        return styles.badge_baja;
      case "cambio_monto":
        return styles.badge_cambio_monto;
      case "cambio_categoria":
        return styles.badge_cambio_categoria;
      default:
        return "";
    }
  };

  const getMovimientoLabel = (tipo: string) => {
    switch (tipo) {
      case "alta":
        return "Alta";
      case "baja":
        return "Baja";
      case "cambio_monto":
        return "Monto";
      case "cambio_categoria":
        return "Categoría";
      default:
        return tipo;
    }
  };

  // Visual diff renderer for changes
  const renderChanges = (mov: any) => {
    if (!mov.datos_anteriores || !mov.datos_nuevos) return null;

    const changes = [];
    const oldData = mov.datos_anteriores;
    const newData = mov.datos_nuevos;

    if (mov.tipo_movimiento === "cambio_monto" || mov.tipo_movimiento === "cambio_categoria") {
      const oldM = Number(oldData.monto || 0);
      const newM = Number(newData.monto || 0);
      if (oldM !== newM) {
        changes.push({
          label: "Monto",
          oldVal: `$${oldM.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
          newVal: `$${newM.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
        });
      }
    } else if (mov.tipo_movimiento === "baja") {
      if (newData.motivo_baja) {
        changes.push({
          label: "Motivo",
          newVal: newData.motivo_baja
        });
      }
      if (newData.fecha_baja) {
        changes.push({
          label: "Fecha",
          newVal: formatDate(newData.fecha_baja).split(" ")[0]
        });
      }
    }

    if (changes.length === 0) return null;

    return (
      <div className={styles.detailGrid}>
        {changes.map((c, idx) => (
          <div key={idx} className={styles.detailRow}>
            <span className={styles.detailLabel}>{c.label}:</span>
            {c.oldVal !== undefined && (
              <>
                <span className={styles.oldValue}>{c.oldVal}</span>
                <span className={styles.detailArrow}>→</span>
              </>
            )}
            <span className={styles.newValue}>{c.newVal}</span>
          </div>
        ))}
      </div>
    );
  };

  if (!selectedSemester) {
    return (
      <div className={styles.emptyCard}>
        <div className={styles.emptyIconWrapper}>
          <Info size={48} />
        </div>
        <h4>Sin Semestre Seleccionado</h4>
        <p>Por favor, seleccione un semestre en el menú superior para ver los movimientos de nómina.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1>Movimientos</h1>
          <p>
            Historial de auditoría de altas, bajas y cambios realizados durante el año {selectedYear}.
          </p>
        </div>

        <div className={styles.headerActionsGroup}>
          <button
            onClick={() => setActiveDrawer("alta")}
            className={styles.primaryBtn}
            style={{ background: "#10b981", boxShadow: "0 0 16px rgba(16, 185, 129, 0.2)" }}
          >
            <Plus size={16} />
            <span>Registrar Alta</span>
          </button>

          <button
            onClick={() => setActiveDrawer("baja")}
            className={styles.primaryBtn}
            style={{ background: "#f43f5e", boxShadow: "0 0 16px rgba(244, 63, 94, 0.2)" }}
          >
            <Trash2 size={16} />
            <span>Procesar Baja</span>
          </button>

          <button
            onClick={() => setActiveDrawer("modificacion")}
            className={styles.primaryBtn}
            style={{ background: "#f59e0b", boxShadow: "0 0 16px rgba(245, 158, 11, 0.2)" }}
          >
            <ArrowRightLeft size={16} />
            <span>Modificar Categoría</span>
          </button>

          <button
            onClick={fetchMovementsData}
            className="secondaryBtn"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? styles.spin : ""} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCard_total}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Movimientos</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <Activity size={24} />
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCard_alta}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Altas</span>
            <span className={styles.statValue}>{stats.altas}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCard_baja}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Bajas</span>
            <span className={styles.statValue}>{stats.bajas}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <Trash2 size={24} />
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCard_cambio}`}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Modificaciones</span>
            <span className={styles.statValue}>{stats.cambios}</span>
          </div>
          <div className={styles.statIconWrapper}>
            <TrendingUp size={24} />
          </div>
        </div>
      </div>

      {/* Filters Wrapper */}
      <div className={styles.filtersWrapper}>
        {/* Row 1: Period Filters */}
        <div className={styles.periodRow}>
          <div className={styles.periodSelector}>
            <span className={styles.filterLabel}>Año:</span>
            <select
              className={styles.filterSelect}
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Período:</span>
            <div className={styles.periodTabs}>
              <button
                className={`${styles.periodTab} ${periodType === "todos" ? styles.periodTabActive : ""}`}
                onClick={() => {
                  setPeriodType("todos");
                  setCurrentPage(1);
                }}
              >
                Todo el Año
              </button>
              <button
                className={`${styles.periodTab} ${periodType === "semestre" ? styles.periodTabActive : ""}`}
                onClick={() => {
                  setPeriodType("semestre");
                  setCurrentPage(1);
                }}
              >
                Por Semestre
              </button>
              <button
                className={`${styles.periodTab} ${periodType === "mes" ? styles.periodTabActive : ""}`}
                onClick={() => {
                  setPeriodType("mes");
                  setCurrentPage(1);
                }}
              >
                Por Mes
              </button>
            </div>
          </div>

          {periodType === "semestre" && (
            <div className={styles.periodSelector}>
              <span className={styles.filterLabel}>Semestre:</span>
              <select
                className={styles.filterSelect}
                value={selectedSemesterNum}
                onChange={(e) => {
                  setSelectedSemesterNum(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={1}>1º Semestre (Enero - Junio)</option>
                <option value={2}>2º Semestre (Julio - Diciembre)</option>
              </select>
            </div>
          )}

          {periodType === "mes" && (
            <div className={styles.periodSelector}>
              <span className={styles.filterLabel}>Mes:</span>
              <select
                className={styles.filterSelect}
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={1}>Enero</option>
                <option value={2}>Febrero</option>
                <option value={3}>Marzo</option>
                <option value={4}>Abril</option>
                <option value={5}>Mayo</option>
                <option value={6}>Junio</option>
                <option value={7}>Julio</option>
                <option value={8}>Agosto</option>
                <option value={9}>Septiembre</option>
                <option value={10}>Octubre</option>
                <option value={11}>Noviembre</option>
                <option value={12}>Diciembre</option>
              </select>
            </div>
          )}
        </div>

        {/* Row 2: Search & Traditional Filters */}
        <div className={styles.filtersBar}>
          <div className={styles.searchGroup}>
            <Search className={styles.searchIcon} size={18} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Buscar por persona, DNI, descripción o solicitante..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Persona:</span>
            <select
              className={styles.filterSelect}
              value={filterPersona}
              onChange={(e) => {
                setFilterPersona(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="becario">Becarios</option>
              <option value="monotributista">Monotributistas</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Movimiento:</span>
            <select
              className={styles.filterSelect}
              value={filterMovimiento}
              onChange={(e) => {
                setFilterMovimiento(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="alta">Alta</option>
              <option value="baja">Baja</option>
              <option value="cambio_monto">Cambio Monto</option>
              <option value="cambio_categoria">Cambio Categoría</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Data */}
      {loading ? (
        <div className={styles.loadingSpinner}>
          <Loader2 className={styles.spin} size={48} />
          <p>Cargando auditoría de movimientos...</p>
        </div>
      ) : totalItems === 0 ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIconWrapper}>
            <Activity size={32} />
          </div>
          <h4>No se encontraron movimientos</h4>
          <p>
            {searchTerm.trim() !== "" || filterPersona !== "all" || filterMovimiento !== "all"
              ? "Pruebe ajustando los filtros de búsqueda."
              : `Aún no se registran movimientos para el año ${selectedYear}.`}
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Persona</th>
                <th>Tipo Persona</th>
                <th>Tipo Movimiento</th>
                <th>Descripción</th>
                <th>Período</th>
                <th>Solicitado por</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMovements.map((mov) => {
                const person = peopleMap[mov.persona_id];
                const userObj = usersMap[mov.usuario_id];
                const initials = userObj?.nombre
                  ? userObj.nombre
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .substring(0, 2)
                  : "U";

                return (
                  <tr key={mov.id}>
                    <td className={styles.dateCell}>{formatDate(mov.created_at)}</td>
                    <td>
                      <div className={styles.personCell}>
                        <span className={styles.personName}>
                          {person?.nombre || "Persona Desconocida"}
                        </span>
                        <span className={styles.personDni}>
                          {person?.dni ? `DNI: ${person.dni}` : `ID: ${mov.persona_id.substring(0, 8)}...`}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${getPersonaBadgeClass(mov.tipo_persona)}`}>
                        {mov.tipo_persona === "becario" ? "Becario" : "Monotributista"}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${getMovimientoBadgeClass(mov.tipo_movimiento)}`}>
                        {getMovimientoLabel(mov.tipo_movimiento)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.descriptionCell}>
                        <span>{mov.descripcion || "Sin descripción"}</span>
                        {renderChanges(mov)}
                      </div>
                    </td>
                    <td className={styles.dateCell}>
                      {getMonthName(mov.mes)} / {mov.anio}
                    </td>
                    <td>
                      <span className={styles.solicitanteTxt}>{mov.solicitado_por || "—"}</span>
                    </td>
                    <td>
                      {userObj ? (
                        <div className={styles.userCell}>
                          <div className={styles.userAvatar}>{initials}</div>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{userObj.nombre}</span>
                            <span className={styles.userEmail}>{userObj.email}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalItems)} de {totalItems} movimientos
              </span>
              <div className={styles.paginationButtons}>
                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className={styles.paginationBtn}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "14px",
                    fontWeight: "600",
                    pointerEvents: "none",
                    border: "none",
                    background: "none"
                  }}
                >
                  {currentPage} / {totalPages}
                </button>
                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DRAWER: REGISTRAR ALTA */}
      <Drawer
        isOpen={activeDrawer === "alta"}
        onClose={() => {
          setActiveDrawer(null);
          altaForm.reset();
        }}
        title="Registrar Alta de Personal"
        size="md"
      >
        <form onSubmit={altaForm.handleSubmit(handleAltaSubmit)} className={styles.drawerForm}>
          <div className={styles.formSection}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Tipo de Persona *</label>
                <select className="input-field" {...altaForm.register("tipo_persona")}>
                  <option value="becario">Becario</option>
                  <option value="monotributista">Monotributista</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Solicitado por *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. Juan Pérez (Secretario)"
                  {...altaForm.register("solicitado_por")}
                />
                {altaForm.formState.errors.solicitado_por && (
                  <span className={styles.formError}>{altaForm.formState.errors.solicitado_por.message}</span>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Apellido y Nombre *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Apellido Nombre"
                {...altaForm.register("apellido_nombre")}
              />
              {altaForm.formState.errors.apellido_nombre && (
                <span className={styles.formError}>{altaForm.formState.errors.apellido_nombre.message}</span>
              )}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>DNI *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="8 dígitos"
                  {...altaForm.register("dni")}
                />
                {altaForm.formState.errors.dni && (
                  <span className={styles.formError}>{altaForm.formState.errors.dni.message}</span>
                )}
              </div>
              <div className={styles.formGroup}>
                <label>CUIT/CUIL *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="11 dígitos"
                  {...altaForm.register("cuit")}
                />
                {altaForm.formState.errors.cuit && (
                  <span className={styles.formError}>{altaForm.formState.errors.cuit.message}</span>
                )}
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Subsecretaría *</label>
                <select className="input-field" {...altaForm.register("subsecretaria_id")}>
                  <option value="">Seleccione una...</option>
                  {subsecretarias.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
                {altaForm.formState.errors.subsecretaria_id && (
                  <span className={styles.formError}>{altaForm.formState.errors.subsecretaria_id.message}</span>
                )}
              </div>
              <div className={styles.formGroup}>
                <label>Área *</label>
                <select className="input-field" {...altaForm.register("area_id")} disabled={!selectedAltaSub}>
                  <option value="">Seleccione una...</option>
                  {filteredAreasForAlta.map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </select>
                {altaForm.formState.errors.area_id && (
                  <span className={styles.formError}>{altaForm.formState.errors.area_id.message}</span>
                )}
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Responsable</label>
                <select className="input-field" {...altaForm.register("responsable_id")}>
                  <option value="">Seleccione uno...</option>
                  {responsables.map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre_completo}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Categoría *</label>
                <select className="input-field" {...altaForm.register("categoria_id")}>
                  <option value="">Seleccione una...</option>
                  {dynamicCategoriesForAlta.map((c) => (
                    <option key={c.id} value={c.id}>
                      {selectedAltaTipo === "becario"
                        ? `Cat ${c.numero_categoria} ($${Number(c.monto).toLocaleString("es-AR")})`
                        : `Letra ${c.letra} ($${Number(c.monto).toLocaleString("es-AR")})`}
                    </option>
                  ))}
                </select>
                {altaForm.formState.errors.categoria_id && (
                  <span className={styles.formError}>{altaForm.formState.errors.categoria_id.message}</span>
                )}
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Fecha de Alta *</label>
                <input type="date" className="input-field" {...altaForm.register("fecha_alta")} />
              </div>
              <div className={styles.formGroup}>
                <label>CBU</label>
                <input type="text" className="input-field" placeholder="22 dígitos" {...altaForm.register("cbu")} />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Teléfono</label>
                <input type="text" className="input-field" placeholder="Ej. 351..." {...altaForm.register("telefono")} />
              </div>
              <div className={styles.formGroup}>
                <label>Email</label>
                <input type="text" className="input-field" placeholder="mail@example.com" {...altaForm.register("email")} />
                {altaForm.formState.errors.email && (
                  <span className={styles.formError}>{altaForm.formState.errors.email.message}</span>
                )}
              </div>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className="input-field"
              onClick={() => {
                setActiveDrawer(null);
                altaForm.reset();
              }}
              disabled={submitLoading}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.primaryBtn} disabled={submitLoading}>
              {submitLoading ? (
                <>
                  <Loader2 className={styles.spin} size={16} />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Confirmar Alta</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>

      {/* DRAWER: PROCESAR BAJA */}
      <Drawer
        isOpen={activeDrawer === "baja"}
        onClose={() => {
          setActiveDrawer(null);
          bajaForm.reset();
        }}
        title="Procesar Baja de Personal"
        size="md"
      >
        <form onSubmit={bajaForm.handleSubmit(handleBajaSubmit)} className={styles.drawerForm}>
          <div className={styles.formSection}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Tipo de Persona *</label>
                <select className="input-field" {...bajaForm.register("tipo_persona")}>
                  <option value="becario">Becario</option>
                  <option value="monotributista">Monotributista</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Solicitado por *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. Juan Pérez (Secretario)"
                  {...bajaForm.register("solicitado_por")}
                />
                {bajaForm.formState.errors.solicitado_por && (
                  <span className={styles.formError}>{bajaForm.formState.errors.solicitado_por.message}</span>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Buscar Persona Activa *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Filtrar por nombre o DNI..."
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Seleccionar Persona *</label>
              <select className="input-field" {...bajaForm.register("persona_id")}>
                <option value="">Seleccione una...</option>
                {filteredActivePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} (DNI: {p.dni})
                  </option>
                ))}
              </select>
              {bajaForm.formState.errors.persona_id && (
                <span className={styles.formError}>{bajaForm.formState.errors.persona_id.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Fecha de Baja *</label>
              <input type="date" className="input-field" {...bajaForm.register("fecha_baja")} />
            </div>

            <div className={styles.formGroup}>
              <label>Motivo de la Baja *</label>
              <textarea
                className="input-field"
                style={{ minHeight: "100px", padding: "10px", fontFamily: "inherit" }}
                placeholder="Detalle el motivo de la desvinculación..."
                {...bajaForm.register("motivo_baja")}
              />
              {bajaForm.formState.errors.motivo_baja && (
                <span className={styles.formError}>{bajaForm.formState.errors.motivo_baja.message}</span>
              )}
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className="input-field"
              onClick={() => {
                setActiveDrawer(null);
                bajaForm.reset();
              }}
              disabled={submitLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              style={{ background: "#f43f5e" }}
              disabled={submitLoading}
            >
              {submitLoading ? (
                <>
                  <Loader2 className={styles.spin} size={16} />
                  <span>Procesando...</span>
                </>
              ) : (
                <span>Confirmar Baja</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>

      {/* DRAWER: MODIFICAR CATEGORÍA */}
      <Drawer
        isOpen={activeDrawer === "modificacion"}
        onClose={() => {
          setActiveDrawer(null);
          modForm.reset();
        }}
        title="Modificar Monto / Categoría"
        size="md"
      >
        <form onSubmit={modForm.handleSubmit(handleModSubmit)} className={styles.drawerForm}>
          <div className={styles.formSection}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Tipo de Persona *</label>
                <select className="input-field" {...modForm.register("tipo_persona")}>
                  <option value="becario">Becario</option>
                  <option value="monotributista">Monotributista</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Solicitado por *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. Juan Pérez (Secretario)"
                  {...modForm.register("solicitado_por")}
                />
                {modForm.formState.errors.solicitado_por && (
                  <span className={styles.formError}>{modForm.formState.errors.solicitado_por.message}</span>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Buscar Persona Activa *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Filtrar por nombre o DNI..."
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Seleccionar Persona *</label>
              <select className="input-field" {...modForm.register("persona_id")}>
                <option value="">Seleccione una...</option>
                {filteredActivePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} (DNI: {p.dni})
                  </option>
                ))}
              </select>
              {modForm.formState.errors.persona_id && (
                <span className={styles.formError}>{modForm.formState.errors.persona_id.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Nueva Categoría *</label>
              <select className="input-field" {...modForm.register("categoria_id")}>
                <option value="">Seleccione una...</option>
                {dynamicCategoriesForMod.map((c) => (
                  <option key={c.id} value={c.id}>
                    {selectedModTipo === "becario"
                      ? `Cat ${c.numero_categoria} ($${Number(c.monto).toLocaleString("es-AR")})`
                      : `Letra ${c.letra} ($${Number(c.monto).toLocaleString("es-AR")})`}
                  </option>
                ))}
              </select>
              {modForm.formState.errors.categoria_id && (
                <span className={styles.formError}>{modForm.formState.errors.categoria_id.message}</span>
              )}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Mes de Vigencia *</label>
                <select className="input-field" {...modForm.register("mes", { valueAsNumber: true })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{getMonthName(m)}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Año de Vigencia *</label>
                <select className="input-field" {...modForm.register("anio", { valueAsNumber: true })}>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Observaciones / Descripción del Cambio</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. Ascenso por desempeño"
                {...modForm.register("observaciones")}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className="input-field"
              onClick={() => {
                setActiveDrawer(null);
                modForm.reset();
              }}
              disabled={submitLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              style={{ background: "#f59e0b" }}
              disabled={submitLoading}
            >
              {submitLoading ? (
                <>
                  <Loader2 className={styles.spin} size={16} />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Confirmar Modificación</span>
              )}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
