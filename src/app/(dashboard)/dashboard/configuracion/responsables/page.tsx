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
  Trash2,
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
import Link from "next/link";
import Drawer from "@/components/ui/Drawer";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./responsables.module.css";

// Form Validation Schema
const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const formSchema = z.object({
  nombre_completo: z.string().min(3, "Mínimo 3 caracteres"),
  dni: z.string().regex(/^(\d{7,8}|0+)$/, "DNI debe tener 7 u 8 dígitos numéricos o ceros"),
  telefono: z.string().or(z.literal("")).nullable().optional(),
  email: z.string().email("Email inválido").or(z.literal("")).nullable().optional(),
  subsecretarias_ids: z.array(z.string().regex(uuidRegex, "UUID inválido")),
  areas_ids: z.array(z.string().regex(uuidRegex, "UUID inválido")),
  cargo: z.string().or(z.literal("")).nullable().optional(),
  activo: z.boolean(),
}).refine((data) => {
  if (data.cargo === "Secretario") return true;
  return data.subsecretarias_ids.length > 0;
}, {
  message: "Seleccione al menos una subsecretaría",
  path: ["subsecretarias_ids"],
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

  // Portal Access States
  const [portalCreds, setPortalCreds] = useState<any[]>([]);
  const [drawerTab, setDrawerTab] = useState<"general" | "portal">("general");
  const [selectedRespCreds, setSelectedRespCreds] = useState<any | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [newPortalUsername, setNewPortalUsername] = useState("");
  const [newPortalPassword, setNewPortalPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);

  const suggestUsername = (name: string) => {
    if (!name) return "";
    const clean = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
    const parts = clean.split(" ").filter(p => p.length > 0);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1]}`;
    }
    return parts[0] || "";
  };

  const fetchPortalCreds = async () => {
    try {
      const res = await fetch("/api/portal/credenciales");
      if (res.ok) {
        const data = await res.json();
        setPortalCreds(data.credenciales || []);
      }
    } catch (e) {
      console.error("Error fetching portal creds:", e);
    }
  };

  const loadRespCreds = async (respId: string) => {
    setLoadingCreds(true);
    try {
      const res = await fetch(`/api/portal/credenciales?responsable_id=${respId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedRespCreds(data.credenciales || null);
        if (data.credenciales) {
          setNewPortalUsername(data.credenciales.username);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCreds(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPortalPassword(pass);
  };

  const handleCreatePortalAccess = async () => {
    if (!newPortalUsername || newPortalUsername.trim() === "") {
      toast.error("El nombre de usuario es requerido");
      return;
    }
    if (!newPortalPassword || newPortalPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    try {
      const res = await fetch("/api/portal/credenciales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsable_id: selectedResp.id,
          username: newPortalUsername.trim().toLowerCase(),
          password: newPortalPassword,
          activo: true,
        }),
      });
      if (res.ok) {
        toast.success("Acceso al portal habilitado con éxito");
        setNewPortalPassword("");
        loadRespCreds(selectedResp.id);
        fetchPortalCreds();
      } else {
        const data = await res.json();
        toast.error(data.error || "Error al otorgar acceso");
      }
    } catch (e) {
      toast.error("Error al habilitar acceso");
    }
  };

  const handleUpdatePortalUsername = async () => {
    if (!newPortalUsername || newPortalUsername.trim() === "") {
      toast.error("El nombre de usuario no puede estar vacío");
      return;
    }
    try {
      const res = await fetch("/api/portal/credenciales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsable_id: selectedResp.id,
          username: newPortalUsername.trim().toLowerCase(),
          activo: selectedRespCreds.activo,
        }),
      });
      if (res.ok) {
        toast.success("Nombre de usuario actualizado con éxito");
        loadRespCreds(selectedResp.id);
        fetchPortalCreds();
      } else {
        const data = await res.json();
        toast.error(data.error || "Error al actualizar el nombre de usuario");
      }
    } catch (e) {
      toast.error("Error al actualizar usuario");
    }
  };

  const handleTogglePortalActive = async () => {
    if (!selectedRespCreds) return;
    try {
      const res = await fetch("/api/portal/credenciales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsable_id: selectedResp.id,
          username: selectedRespCreds.username,
          activo: !selectedRespCreds.activo,
        }),
      });
      if (res.ok) {
        toast.success("Estado de acceso actualizado");
        loadRespCreds(selectedResp.id);
        fetchPortalCreds();
      }
    } catch (e) {
      toast.error("Error al actualizar estado");
    }
  };

  const handleResetPortalPassword = async () => {
    if (!newPortalPassword || newPortalPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    try {
      const res = await fetch("/api/portal/credenciales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsable_id: selectedResp.id,
          username: selectedRespCreds.username,
          password: newPortalPassword,
        }),
      });
      if (res.ok) {
        toast.success("Contraseña restablecida con éxito");
        setNewPortalPassword("");
        loadRespCreds(selectedResp.id);
      } else {
        const data = await res.json();
        toast.error(data.error || "Error al restablecer contraseña");
      }
    } catch (e) {
      toast.error("Error al restablecer contraseña");
    }
  };

  const handleDeletePortalAccess = async () => {
    if (!confirm("¿Está seguro de quitar el acceso al portal para este responsable?")) return;
    try {
      const res = await fetch(`/api/portal/credenciales?responsable_id=${selectedResp.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Acceso al portal eliminado");
        setSelectedRespCreds(null);
        fetchPortalCreds();
      }
    } catch (e) {
      toast.error("Error al eliminar acceso");
    }
  };

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

      const { data: subs } = await supabase.from("subsecretarias").select("*").eq("activa", true).order("nombre", { ascending: true });
      const { data: ars } = await supabase.from("areas").select("*").eq("activa", true).order("nombre", { ascending: true });

      setResponsables(resps || []);
      setSubsecretarias((subs || []).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setAreas((ars || []).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      await fetchPortalCreds();
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
    setDrawerTab("general");
    setSelectedRespCreds(null);
    setNewPortalPassword("");
    setNewPortalUsername(suggestUsername(resp.nombre_completo));
    loadRespCreds(resp.id);
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
      const becUpdatesMap: { [respId: string]: string[] } = {};
      const becNullUpdates: string[] = [];

      for (const b of becarios) {
        const correctRespId = findCorrectResp(b.subsecretaria_id, b.area_id);
        if (b.responsable_id !== correctRespId) {
          if (correctRespId) {
            if (!becUpdatesMap[correctRespId]) {
              becUpdatesMap[correctRespId] = [];
            }
            becUpdatesMap[correctRespId].push(b.id);
          } else {
            becNullUpdates.push(b.id);
          }
        }
      }

      // Execute updates in bulk
      for (const [respId, ids] of Object.entries(becUpdatesMap)) {
        const { error: updErr } = await supabase
          .from("becarios")
          .update({ responsable_id: respId })
          .in("id", ids);
        if (updErr) console.error(`Error updating becarios to responsible ${respId}:`, updErr);
      }

      if (becNullUpdates.length > 0) {
        const { error: updErr } = await supabase
          .from("becarios")
          .update({ responsable_id: null })
          .in("id", becNullUpdates);
        if (updErr) console.error("Error setting becarios responsable to null:", updErr);
      }
    }

    // 3. Fetch and sync active monotributistas
    const { data: monos, error: monErr } = await supabase
      .from("monotributistas")
      .select("id, subsecretaria_id, area_id, responsable_id")
      .eq("estado", "Activo");

    if (monErr) throw monErr;
    if (monos) {
      const monUpdatesMap: { [respId: string]: string[] } = {};
      const monNullUpdates: string[] = [];

      for (const m of monos) {
        const correctRespId = findCorrectResp(m.subsecretaria_id, m.area_id);
        if (m.responsable_id !== correctRespId) {
          if (correctRespId) {
            if (!monUpdatesMap[correctRespId]) {
              monUpdatesMap[correctRespId] = [];
            }
            monUpdatesMap[correctRespId].push(m.id);
          } else {
            monNullUpdates.push(m.id);
          }
        }
      }

      // Execute updates in bulk
      for (const [respId, ids] of Object.entries(monUpdatesMap)) {
        const { error: updErr } = await supabase
          .from("monotributistas")
          .update({ responsable_id: respId })
          .in("id", ids);
        if (updErr) console.error(`Error updating monotributistas to responsible ${respId}:`, updErr);
      }

      if (monNullUpdates.length > 0) {
        const { error: updErr } = await supabase
          .from("monotributistas")
          .update({ responsable_id: null })
          .in("id", monNullUpdates);
        if (updErr) console.error("Error setting monotributistas responsable to null:", updErr);
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

  const formatErrors = (errs: any): string => {
    const messages: string[] = [];
    const extract = (obj: any, path: string) => {
      if (!obj) return;
      if (obj.message) {
        messages.push(`${path}: ${obj.message}`);
        return;
      }
      if (Array.isArray(obj)) {
        obj.forEach((child, index) => {
          extract(child, `${path}[${index}]`);
        });
        return;
      }
      if (typeof obj === "object") {
        Object.entries(obj).forEach(([key, val]) => {
          extract(val, path ? `${path}.${key}` : key);
        });
      }
    };
    extract(errs, "");
    return messages.join(", ");
  };

  const onAddFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      console.log("Validation errors on add:", errors);
      const errList = formatErrors(errors);
      toast.error(`No se pudo registrar: campos inválidos. ${errList}`);
    }
    handleSubmit(onAddSubmit)(e);
  };

  const onEditFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      console.log("Validation errors on edit:", errors);
      const errList = formatErrors(errors);
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

  // Delete responsible
  const handleDelete = async (resp: any) => {
    if (!confirm(`¿Está seguro de eliminar al responsable "${resp.nombre_completo}"? Se quitará de todos los agentes asociados automáticamente.`)) {
      return;
    }

    try {
      const { error } = await supabase.from("responsables").delete().eq("id", resp.id);
      if (error) throw error;

      // Audit Log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        usuario_id: user?.id,
        accion: "Eliminación de Responsable",
        tabla_afectada: "responsables",
        registro_id: resp.id,
        datos_anteriores: resp,
      });

      toast.success("Responsable eliminado con éxito.");
      fetchData();
      
      // Trigger cascade sync in background
      toast.promise(syncMembersResponsibles(), {
        loading: "Sincronizando responsables en la nómina...",
        success: "Nómina sincronizada correctamente.",
        error: "Error al sincronizar responsables de la nómina.",
      });
    } catch (err: any) {
      console.error("Error deleting responsible:", err);
      toast.error("Error al eliminar responsable: " + err.message);
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
        cell: (info) => {
          const resp = info.row.original;
          const hasPortal = portalCreds.some((c) => c.responsable_id === resp.id);
          return (
            <div className={styles.nameCell}>
              <span className={styles.fullName}>
                {info.getValue() as string}
                {hasPortal && (
                  <span title="Tiene acceso al portal de responsables" style={{ marginLeft: "8px", cursor: "help" }}>
                    🔑
                  </span>
                )}
              </span>
              <span className={styles.dniLabel}>DNI: {resp.dni}</span>
            </div>
          );
        },
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
              <button
                onClick={() => handleDelete(resp)}
                className={`${styles.actionBtn} ${styles.delete}`}
                title="Eliminar Responsable"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        },
      },
    ],
    [subsecretarias, areas, portalCreds]
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
              <Controller
                control={control}
                name="subsecretarias_ids"
                render={({ field }) => (
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
                      const isChecked = field.value?.includes(s.id) || false;
                      return (
                        <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...(field.value || []), s.id]
                                : (field.value || []).filter((id: string) => id !== s.id);
                              field.onChange(next);
                            }}
                            style={{ cursor: "pointer" }}
                          />
                          <span>{s.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
              {errors.subsecretarias_ids && (
                <span className={styles.formError}>{errors.subsecretarias_ids.message}</span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Áreas Operativas</label>
              <Controller
                control={control}
                name="areas_ids"
                render={({ field }) => (
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
                        const isChecked = field.value?.includes(a.id) || false;
                        return (
                          <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...(field.value || []), a.id]
                                  : (field.value || []).filter((id: string) => id !== a.id);
                                field.onChange(next);
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
                )}
              />
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
      {/* Drawer: Editar Responsable */}
      <Drawer
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Editar Datos de Responsable"
        size="md"
      >
        <div className={styles.drawerTabs}>
          <button
            type="button"
            className={`${styles.drawerTabBtn} ${drawerTab === "general" ? styles.active : ""}`}
            onClick={() => setDrawerTab("general")}
          >
            Datos Generales
          </button>
          <button
            type="button"
            className={`${styles.drawerTabBtn} ${drawerTab === "portal" ? styles.active : ""}`}
            onClick={() => setDrawerTab("portal")}
          >
            Acceso al Portal
          </button>
        </div>

        {drawerTab === "general" ? (
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
                <Controller
                  control={control}
                  name="subsecretarias_ids"
                  render={({ field }) => (
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
                        const isChecked = field.value?.includes(s.id) || false;
                        return (
                          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...(field.value || []), s.id]
                                  : (field.value || []).filter((id: string) => id !== s.id);
                                field.onChange(next);
                              }}
                              style={{ cursor: "pointer" }}
                            />
                            <span>{s.nombre}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.subsecretarias_ids && (
                  <span className={styles.formError}>{errors.subsecretarias_ids.message}</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Áreas Operativas</label>
                <Controller
                  control={control}
                  name="areas_ids"
                  render={({ field }) => (
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
                          const isChecked = field.value?.includes(a.id) || false;
                          return (
                            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...(field.value || []), a.id]
                                    : (field.value || []).filter((id: string) => id !== a.id);
                                  field.onChange(next);
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
                  )}
                />
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
        ) : (
          <div className={styles.drawerForm}>
            {loadingCreds ? (
              <div className={styles.loadingSpinner}>
                <span className={styles.spin}>⏳</span>
                <span>Cargando credenciales...</span>
              </div>
            ) : selectedRespCreds ? (
              <div className={styles.formSection}>
                <div className={styles.portalCredsContainer}>
                  <div className={styles.portalCredsHeader}>Credenciales Activas</div>
                  
                  <div className={styles.formGroup}>
                    <label>Nombre de Usuario</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. secretario"
                      value={newPortalUsername}
                      onChange={(e) => setNewPortalUsername(e.target.value)}
                    />
                  </div>

                  <div className={styles.portalCredsRow} style={{ marginTop: "12px" }}>
                    <span className={styles.portalCredsLabel}>Estado de Acceso:</span>
                    <span style={{ 
                      fontSize: "12px", 
                      fontWeight: "bold",
                      color: selectedRespCreds.activo ? "#10b981" : "#ef4444",
                      background: selectedRespCreds.activo ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                      padding: "4px 8px",
                      borderRadius: "4px"
                    }}>
                      {selectedRespCreds.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className={styles.secondaryActionBtn}
                      onClick={handleTogglePortalActive}
                    >
                      {selectedRespCreds.activo ? "Desactivar Acceso" : "Activar Acceso"}
                    </button>
                    
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={handleUpdatePortalUsername}
                    >
                      Actualizar Usuario
                    </button>
                    
                    <button
                      type="button"
                      className={styles.dangerActionBtn}
                      onClick={handleDeletePortalAccess}
                      style={{ marginLeft: "auto" }}
                    >
                      Eliminar Acceso
                    </button>
                  </div>
                </div>

                <div className={styles.portalCredsContainer} style={{ marginTop: "16px" }}>
                  <div className={styles.portalCredsHeader}>Restablecer Contraseña</div>
                  
                  <div className={styles.formGroup}>
                    <label>Nueva Contraseña (mínimo 6 caracteres)</label>
                    <div className={styles.inputGroupWithBtn}>
                      <input
                        type={showPortalPassword ? "text" : "password"}
                        className="input-field"
                        placeholder="Ej. NuevaContraseña123"
                        value={newPortalPassword}
                        onChange={(e) => setNewPortalPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.secondaryActionBtn}
                        onClick={() => setShowPortalPassword(!showPortalPassword)}
                      >
                        {showPortalPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      type="button"
                      className={styles.secondaryActionBtn}
                      onClick={generateRandomPassword}
                    >
                      Generar Aleatoria
                    </button>
                    
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={handleResetPortalPassword}
                      style={{ marginLeft: "auto" }}
                    >
                      Actualizar Contraseña
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.formSection}>
                <div className={styles.portalCredsContainer}>
                  <div className={styles.portalCredsHeader}>Crear Acceso al Portal</div>
                  
                  <div className={styles.formGroup}>
                    <label>Nombre de Usuario *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. j_perez"
                      value={newPortalUsername}
                      onChange={(e) => setNewPortalUsername(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup} style={{ marginTop: "12px" }}>
                    <label>Contraseña * (mínimo 6 caracteres)</label>
                    <div className={styles.inputGroupWithBtn}>
                      <input
                        type={showPortalPassword ? "text" : "password"}
                        className="input-field"
                        placeholder="Ej. ContraseñaSegura123"
                        value={newPortalPassword}
                        onChange={(e) => setNewPortalPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.secondaryActionBtn}
                        onClick={() => setShowPortalPassword(!showPortalPassword)}
                      >
                        {showPortalPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                    <button
                      type="button"
                      className={styles.secondaryActionBtn}
                      onClick={generateRandomPassword}
                    >
                      Generar Aleatoria
                    </button>
                    
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={handleCreatePortalAccess}
                      style={{ marginLeft: "auto" }}
                    >
                      Habilitar Acceso
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                className="input-field"
                onClick={() => setIsEditOpen(false)}
                style={{ cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
