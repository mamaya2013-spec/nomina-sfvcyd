"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Plus,
  Loader2,
  Lock,
  Unlock,
  CheckCircle,
  HelpCircle,
  Save,
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast, Toaster } from "sonner";
import { useSemester } from "@/lib/contexts/SemesterContext";
import Drawer from "@/components/ui/Drawer";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./montos.module.css";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Form Schema for Creating Semester
const semesterFormSchema = z.object({
  anio: z.number().int().min(2020, "Año debe ser mayor a 2020"),
  numero_semestre: z.number().int().min(1).max(2),
  fecha_inicio: z.string().min(1, "Fecha de inicio requerida"),
  fecha_fin: z.string().min(1, "Fecha de fin requerida"),
  clonar_anterior: z.boolean(),
});

type SemesterFormValues = z.infer<typeof semesterFormSchema>;

export default function MontosPage() {
  const supabase = createClient();
  const { semesters, selectedSemester, activeSemester, selectSemester, refreshSemesters } = useSemester();

  // Tab State
  const [activeTab, setActiveTab] = useState<"gestion" | "comparativa">("gestion");

  // Data States
  const [becasCategories, setBecasCategories] = useState<any[]>([]);
  const [monoCategories, setMonoCategories] = useState<any[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [savingCats, setSavingCats] = useState(false);
  const [cascadeUpdate, setCascadeUpdate] = useState(true);

  // Asistente / Drawer States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftBecas, setDraftBecas] = useState<any[]>(
    Array.from({ length: 6 }, (_, i) => ({ numero_categoria: i + 1, monto: 100000 }))
  );
  const [draftMonos, setDraftMonos] = useState<any[]>(
    ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((letra) => ({
      letra,
      monto: 250000,
      descripcion_categoria: `Tareas Cat. ${letra}`,
    }))
  );

  // Comparison States
  const [compSemA, setCompSemA] = useState<string>("");
  const [compSemB, setCompSemB] = useState<string>("");
  const [compCatsBeca, setCompCatsBeca] = useState<any[]>([]);
  const [compCatsMono, setCompCatsMono] = useState<any[]>([]);
  const [loadingComp, setLoadingComp] = useState(false);

  // Fetch categories when selected semester changes
  const fetchCategories = async (semesterId: string) => {
    setLoadingCats(true);
    try {
      const { data: becas } = await supabase
        .from("categorias_becas")
        .select("*")
        .eq("semestre_id", semesterId)
        .order("numero_categoria", { ascending: true });

      const { data: monos } = await supabase
        .from("categorias_monotributistas")
        .select("*")
        .eq("semestre_id", semesterId)
        .order("letra", { ascending: true });

      setBecasCategories(becas || []);
      setMonoCategories(monos || []);
    } catch (err: any) {
      toast.error("Error al cargar categorías: " + err.message);
    } finally {
      setLoadingCats(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      fetchCategories(selectedSemester.id);
    }
  }, [selectedSemester]);

  // Set default comparison semesters when list loads
  useEffect(() => {
    if (semesters.length >= 2 && (!compSemA || !compSemB)) {
      setCompSemA(semesters[0].id);
      setCompSemB(semesters[1].id);
    } else if (semesters.length === 1 && !compSemA) {
      setCompSemA(semesters[0].id);
    }
  }, [semesters]);

  // Fetch comparison data
  const fetchComparisonData = async () => {
    if (!compSemA) return;
    setLoadingComp(true);
    try {
      const { data: becasA } = await supabase
        .from("categorias_becas")
        .select("*")
        .eq("semestre_id", compSemA);
      
      const { data: monosA } = await supabase
        .from("categorias_monotributistas")
        .select("*")
        .eq("semestre_id", compSemA);

      let becasB: any[] = [];
      let monosB: any[] = [];

      if (compSemB) {
        const { data: bB } = await supabase
          .from("categorias_becas")
          .select("*")
          .eq("semestre_id", compSemB);
        const { data: mB } = await supabase
          .from("categorias_monotributistas")
          .select("*")
          .eq("semestre_id", compSemB);
        becasB = bB || [];
        monosB = mB || [];
      }

      // Merge Beca categories side-by-side
      const mergedBecas = Array.from({ length: 6 }, (_, idx) => {
        const num = idx + 1;
        const catA = (becasA || []).find((c) => c.numero_categoria === num);
        const catB = (becasB || []).find((c) => c.numero_categoria === num);
        return {
          numero_categoria: num,
          montoA: catA ? Number(catA.total) : 0,
          montoB: catB ? Number(catB.total) : 0,
        };
      });

      // Merge Monotributo categories side-by-side
      const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
      const mergedMonos = letters.map((letra) => {
        const catA = (monosA || []).find((c) => c.letra === letra);
        const catB = (monosB || []).find((c) => c.letra === letra);
        return {
          letra,
          descripcion: catA?.descripcion_categoria || catB?.descripcion_categoria || `Nivel ${letra}`,
          montoA: catA ? Number(catA.total) : 0,
          montoB: catB ? Number(catB.total) : 0,
        };
      });

      setCompCatsBeca(mergedBecas);
      setCompCatsMono(mergedMonos);
    } catch (err: any) {
      toast.error("Error al comparar semestres: " + err.message);
    } finally {
      setLoadingComp(false);
    }
  };

  useEffect(() => {
    if (activeTab === "comparativa") {
      fetchComparisonData();
    }
  }, [compSemA, compSemB, activeTab]);

  // Semester Form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SemesterFormValues>({
    resolver: zodResolver(semesterFormSchema),
    defaultValues: {
      anio: new Date().getFullYear(),
      numero_semestre: 1,
      fecha_inicio: "",
      fecha_fin: "",
      clonar_anterior: true,
    },
  });

  const watchAnio = watch("anio");
  const watchNumSem = watch("numero_semestre");
  const watchClonar = watch("clonar_anterior");

  // Compute Display Name and Dates automatically
  useEffect(() => {
    if (watchAnio && watchNumSem) {
      const txt = `${watchAnio} - ${watchNumSem === 1 ? "Primer Semestre (Ene-Jun)" : "Segundo Semestre (Jul-Dic)"}`;
      const fStart = watchNumSem === 1 ? `${watchAnio}-01-01` : `${watchAnio}-07-01`;
      const fEnd = watchNumSem === 1 ? `${watchAnio}-06-30` : `${watchAnio}-12-31`;
      setValue("fecha_inicio", fStart);
      setValue("fecha_fin", fEnd);
    }
  }, [watchAnio, watchNumSem, setValue]);

  // Pre-load draft categories when Clonar is checked
  useEffect(() => {
    if (watchClonar && activeSemester && becasCategories.length > 0) {
      setDraftBecas(
        becasCategories.map((c) => ({ numero_categoria: c.numero_categoria, monto: Number(c.monto) }))
      );
      setDraftMonos(
        monoCategories.map((m) => ({
          letra: m.letra,
          monto: Number(m.monto),
          descripcion_categoria: m.descripcion_categoria || `Nivel ${m.letra}`,
        }))
      );
    } else if (!watchClonar) {
      // Default placeholder values
      setDraftBecas(Array.from({ length: 6 }, (_, i) => ({ numero_categoria: i + 1, monto: 180000 })));
      setDraftMonos(
        ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((letra) => ({
          letra,
          monto: 340000,
          descripcion_categoria: `Tareas Cat. ${letra}`,
        }))
      );
    }
  }, [watchClonar, isAddOpen, activeSemester, becasCategories, monoCategories]);

  // Draft editing helpers
  const handleDraftBecaChange = (index: number, val: number) => {
    const next = [...draftBecas];
    next[index].monto = val;
    setDraftBecas(next);
  };

  const handleDraftMonoChange = (index: number, field: string, val: any) => {
    const next = [...draftMonos];
    next[index] = { ...next[index], [field]: val };
    setDraftMonos(next);
  };

  // Submit New Semester & Rollover
  const onSubmitSemester = async (data: SemesterFormValues) => {
    setCreating(true);
    try {
      const displayTxt = `${data.anio} - ${data.numero_semestre}S`;
      const payload = {
        anio: data.anio,
        numero_semestre: data.numero_semestre,
        nombre_display: displayTxt,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin,
        categorias_becas: draftBecas,
        categorias_monotributistas: draftMonos,
      };

      const response = await fetch("/api/semestres/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Error al crear período");

      toast.success("Nuevo semestre creado e incorporado. El período anterior ha sido cerrado con snapshot.");
      setIsAddOpen(false);
      await refreshSemesters();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Save changes to current active categories
  const handleSaveActiveCategories = async () => {
    if (!selectedSemester || selectedSemester.bloqueado) return;
    setSavingCats(true);
    try {
      const payload = {
        semesterId: selectedSemester.id,
        categorias_becas: becasCategories,
        categorias_monotributistas: monoCategories,
        cascadeUpdatePersonnel: cascadeUpdate,
      };

      const response = await fetch("/api/semestres/update-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Error al actualizar montos");

      toast.success(`Categorías guardadas correctamente ${cascadeUpdate ? "y nómina de personal actualizada." : "."}`);
      fetchCategories(selectedSemester.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingCats(false);
    }
  };

  // Handle value change on live categories inputs
  const handleBecaCatAmountChange = (index: number, val: number) => {
    const next = [...becasCategories];
    next[index].monto = val;
    setBecasCategories(next);
  };

  const handleMonoCatAmountChange = (index: number, val: number) => {
    const next = [...monoCategories];
    next[index].monto = val;
    setMonoCategories(next);
  };

  const handleMonoCatDescChange = (index: number, val: string) => {
    const next = [...monoCategories];
    next[index].descripcion_categoria = val;
    setMonoCategories(next);
  };

  // Format Recharts historical data
  const chartData = useMemo(() => {
    // Return data showing how category values changed over years/semesters
    // X axis: semester names (order ascending)
    const reversedSemesters = [...semesters].reverse();
    return reversedSemesters.map((s) => ({
      name: s.nombre_display.split(" ")[0] + " - " + s.nombre_display.split(" ")[2],
      // We can plot totals or average values, let's plot Category 1 Beca and letter A Monotributo total as indicators
      // But wait! If we want to represent trend, we can query or calculate average total category values.
      // Let's keep it simple: we can map the display values.
    }));
  }, [semesters]);

  return (
    <div className={styles.container}>
      <Toaster position="top-right" richColors />

      {/* Header Panel */}
      <div className={`${styles.header} glass-panel`}>
        <div className={styles.headerTitleGroup}>
          <h1>Semestres y Categorías</h1>
          <p className="text-secondary">
            Gestione los períodos temporales del sistema, las tablas de importes y su inmutabilidad.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button onClick={() => setIsAddOpen(true)} className={styles.primaryBtn}>
            <Plus size={16} />
            <span>Crear Nuevo Semestre</span>
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className={styles.tabContainer}>
        <button
          onClick={() => setActiveTab("gestion")}
          className={`${styles.tabBtn} ${activeTab === "gestion" ? styles.activeTab : ""}`}
        >
          <Calendar size={16} />
          <span>Gestión de Períodos</span>
        </button>
        <button
          onClick={() => setActiveTab("comparativa")}
          className={`${styles.tabBtn} ${activeTab === "comparativa" ? styles.activeTab : ""}`}
          disabled={semesters.length < 2}
        >
          <ArrowRightLeft size={16} />
          <span>Comparador de Semestres</span>
        </button>
      </div>

      {activeTab === "gestion" ? (
        <div className={styles.mainGrid}>
          {/* List of Semesters */}
          <div className={`${styles.semListWrapper} glass-panel`}>
            <h2 className={styles.sectionTitle}>Períodos Registrados</h2>
            <div className={styles.semList}>
              {semesters.length === 0 ? (
                <p className="text-muted" style={{ padding: "20px", textAlign: "center" }}>
                  No hay semestres configurados.
                </p>
              ) : (
                semesters.map((s) => {
                  const isSelected = selectedSemester?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => selectSemester(s.id)}
                      className={`${styles.semCard} ${isSelected ? styles.semCardActive : ""} glass-panel-hover`}
                    >
                      <div className={styles.semCardHeader}>
                        <h4>{s.nombre_display}</h4>
                        <StatusBadge status={s.activo ? "activo" : "baja"} />
                      </div>
                      <div className={styles.semCardMeta}>
                        <span>
                          {s.fecha_inicio} al {s.fecha_fin}
                        </span>
                        {s.bloqueado ? (
                          <span className={styles.lockBadge} title="Inmutable para consultas históricas">
                            <Lock size={12} /> CERRADO
                          </span>
                        ) : (
                          <span className={styles.unlockBadge} title="Habilitado para edición">
                            <Unlock size={12} /> CONFIGURACIÓN
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Categories Management in Selected Semester */}
          <div className={`${styles.categoriesWrapper} glass-panel`}>
            {selectedSemester && (
              <div className={styles.catHeader}>
                <div className={styles.catTitleGroup}>
                  <h3>Tablas de Importes: {selectedSemester.nombre_display}</h3>
                  {selectedSemester.bloqueado ? (
                    <span className={styles.closedBanner}>
                      <Lock size={14} /> Modo Histórico (Solo Lectura)
                    </span>
                  ) : (
                    <span className={styles.activeBanner}>
                      <Unlock size={14} /> Modo Edición Activo
                    </span>
                  )}
                </div>

                {!selectedSemester.bloqueado && (
                  <div className={styles.catSaveActions}>
                    <div className={styles.cascadeOption}>
                      <input
                        type="checkbox"
                        id="cascade_update"
                        checked={cascadeUpdate}
                        onChange={(e) => setCascadeUpdate(e.target.checked)}
                      />
                      <label htmlFor="cascade_update" title="Si se desmarca, solo cambia la categoría; el personal mantiene su sueldo viejo hasta que se re-asigne.">
                        Actualizar personal
                      </label>
                    </div>

                    <button
                      onClick={handleSaveActiveCategories}
                      disabled={savingCats}
                      className={styles.saveBtn}
                    >
                      {savingCats ? <Loader2 className={styles.spin} size={16} /> : <Save size={16} />}
                      <span>Guardar</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {loadingCats ? (
              <div className={styles.loadingCats}>
                <Loader2 className={styles.spin} size={32} />
                <p>Cargando tablas de importes...</p>
              </div>
            ) : (
              <div className={styles.catTablesContainer}>
                {/* Becas Table */}
                <div className={styles.catTableWrapper}>
                  <h4>Categorías de Becas (Importes Mensuales)</h4>
                  <table className={styles.catTable}>
                    <thead>
                      <tr>
                        <th>Nro.</th>
                        <th>Importe Base</th>
                        <th>Tarjeta Activa (10%)</th>
                        <th>Total Mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {becasCategories.map((c, index) => (
                        <tr key={c.id || index}>
                          <td className="font-bold">Categoría {c.numero_categoria}</td>
                          <td>
                            {selectedSemester?.bloqueado ? (
                              <span className="mono font-bold">${Number(c.monto).toLocaleString("es-AR")}</span>
                            ) : (
                              <div className={styles.inputInputWrapper}>
                                <span>$</span>
                                <input
                                  type="number"
                                  className="input-field"
                                  value={c.monto}
                                  onChange={(e) =>
                                    handleBecaCatAmountChange(index, Number(e.target.value))
                                  }
                                />
                              </div>
                            )}
                          </td>
                          <td className="mono text-muted">
                            ${(Number(c.monto) * 0.1).toLocaleString("es-AR")}
                          </td>
                          <td className="mono font-bold text-emerald">
                            ${(Number(c.monto) * 1.1).toLocaleString("es-AR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Monotributo Table */}
                <div className={styles.catTableWrapper} style={{ marginTop: "24px" }}>
                  <h4>Categorías de Monotributistas</h4>
                  <table className={styles.catTable}>
                    <thead>
                      <tr>
                        <th>Letra</th>
                        <th>Función / Cargo</th>
                        <th>Importe Base</th>
                        <th>Tarjeta Activa (10%)</th>
                        <th>Total Mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monoCategories.map((c, index) => (
                        <tr key={c.id || index}>
                          <td className="font-bold text-cyan">Nivel {c.letra}</td>
                          <td>
                            {selectedSemester?.bloqueado ? (
                              <span>{c.descripcion_categoria || "Tareas Generales"}</span>
                            ) : (
                              <input
                                type="text"
                                className="input-field"
                                style={{ width: "100%" }}
                                value={c.descripcion_categoria || ""}
                                onChange={(e) => handleMonoCatDescChange(index, e.target.value)}
                              />
                            )}
                          </td>
                          <td>
                            {selectedSemester?.bloqueado ? (
                              <span className="mono font-bold">${Number(c.monto).toLocaleString("es-AR")}</span>
                            ) : (
                              <div className={styles.inputInputWrapper}>
                                <span>$</span>
                                <input
                                  type="number"
                                  className="input-field"
                                  value={c.monto}
                                  onChange={(e) =>
                                    handleMonoCatAmountChange(index, Number(e.target.value))
                                  }
                                />
                              </div>
                            )}
                          </td>
                          <td className="mono text-muted">
                            ${(Number(c.monto) * 0.1).toLocaleString("es-AR")}
                          </td>
                          <td className="mono font-bold text-emerald">
                            ${(Number(c.monto) * 1.1).toLocaleString("es-AR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* COMPARATIVE VIEW TAB */
        <div className={`${styles.comparativeContainer} glass-panel`}>
          <div className={styles.compFilters}>
            <div className={styles.compFilterGroup}>
              <label>Semestre Base (Semestre A)</label>
              <select
                className="input-field"
                value={compSemA}
                onChange={(e) => setCompSemA(e.target.value)}
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre_display}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.compIcon}>
              <ArrowRightLeft size={20} className="text-muted" />
            </div>

            <div className={styles.compFilterGroup}>
              <label>Semestre Comparado (Semestre B)</label>
              <select
                className="input-field"
                value={compSemB}
                onChange={(e) => setCompSemB(e.target.value)}
              >
                <option value="">(Ninguno)</option>
                {semesters
                  .filter((s) => s.id !== compSemA)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre_display}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {loadingComp ? (
            <div className={styles.loadingCats}>
              <Loader2 className={styles.spin} size={32} />
              <p>Analizando comparativa temporal...</p>
            </div>
          ) : (
            <div className={styles.compGrid}>
              {/* Beca Comparison Table */}
              <div className={styles.compTableWrapper}>
                <h4>Variación en Categorías de Becas (Totales con Activa)</h4>
                <table className={styles.catTable}>
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th>Monto Semestre A</th>
                      <th>Monto Semestre B</th>
                      <th>Variación ($)</th>
                      <th>Variación (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compCatsBeca.map((c) => {
                      const diff = c.montoB - c.montoA;
                      const pct = c.montoA > 0 ? (diff / c.montoA) * 100 : 0;
                      return (
                        <tr key={c.numero_categoria}>
                          <td className="font-bold">Categoría {c.numero_categoria}</td>
                          <td className="mono">${c.montoA.toLocaleString("es-AR")}</td>
                          <td className="mono">
                            {c.montoB > 0 ? `$${c.montoB.toLocaleString("es-AR")}` : "-"}
                          </td>
                          <td className={`mono ${diff >= 0 ? "text-emerald" : "text-rose"}`}>
                            {c.montoB > 0 ? `${diff >= 0 ? "+" : ""}$${diff.toLocaleString("es-AR")}` : "-"}
                          </td>
                          <td className={`mono font-bold ${diff >= 0 ? "text-emerald" : "text-rose"}`}>
                            {c.montoB > 0 ? `${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Monotributo Comparison Table */}
              <div className={styles.compTableWrapper} style={{ marginTop: "20px" }}>
                <h4>Variación en Niveles de Monotributistas</h4>
                <table className={styles.catTable}>
                  <thead>
                    <tr>
                      <th>Nivel</th>
                      <th>Función</th>
                      <th>Monto Semestre A</th>
                      <th>Monto Semestre B</th>
                      <th>Variación ($)</th>
                      <th>Variación (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compCatsMono.map((c) => {
                      const diff = c.montoB - c.montoA;
                      const pct = c.montoA > 0 ? (diff / c.montoA) * 100 : 0;
                      return (
                        <tr key={c.letra}>
                          <td className="font-bold text-cyan">Nivel {c.letra}</td>
                          <td className="text-secondary">{c.descripcion}</td>
                          <td className="mono">${c.montoA.toLocaleString("es-AR")}</td>
                          <td className="mono">
                            {c.montoB > 0 ? `$${c.montoB.toLocaleString("es-AR")}` : "-"}
                          </td>
                          <td className={`mono ${diff >= 0 ? "text-emerald" : "text-rose"}`}>
                            {c.montoB > 0 ? `${diff >= 0 ? "+" : ""}$${diff.toLocaleString("es-AR")}` : "-"}
                          </td>
                          <td className={`mono font-bold ${diff >= 0 ? "text-emerald" : "text-rose"}`}>
                            {c.montoB > 0 ? `${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drawer: Nuevo Semestre (Asistente) */}
      <Drawer isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Crear Período Semestral" size="lg">
        <form onSubmit={handleSubmit(onSubmitSemester)} className={styles.drawerForm}>
          <div className={styles.formSection}>
            <div className={styles.warningBox}>
              <AlertTriangle className="text-amber" size={24} style={{ flexShrink: 0 }} />
              <div>
                <strong>Aviso de cierre e inmutabilidad:</strong> Al habilitar un nuevo semestre, el semestre
                activo actual ({activeSemester?.nombre_display || "Ninguno"}) se cerrará automáticamente,
                creando un snapshot inmutable. El personal activo será traspasado al nuevo período con sus
                categorías equivalentes.
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Año *</label>
                <input
                  type="number"
                  className="input-field"
                  {...register("anio", { valueAsNumber: true })}
                />
                {errors.anio && <span className={styles.formError}>{errors.anio.message}</span>}
              </div>

              <div className={styles.formGroup}>
                <label>Semestre *</label>
                <select
                  className="input-field"
                  {...register("numero_semestre", { valueAsNumber: true })}
                >
                  <option value="1">1S (Enero - Junio)</option>
                  <option value="2">2S (Julio - Diciembre)</option>
                </select>
                {errors.numero_semestre && (
                  <span className={styles.formError}>{errors.numero_semestre.message}</span>
                )}
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Fecha de Inicio</label>
                <input type="date" className="input-field" disabled {...register("fecha_inicio")} />
              </div>
              <div className={styles.formGroup}>
                <label>Fecha de Fin</label>
                <input type="date" className="input-field" disabled {...register("fecha_fin")} />
              </div>
            </div>

            <div className={styles.formGroup} style={{ flexDirection: "row", gap: "10px", alignItems: "center", margin: "10px 0" }}>
              <input type="checkbox" id="clonar_check" {...register("clonar_anterior")} style={{ cursor: "pointer", width: "16px", height: "16px" }} />
              <label htmlFor="clonar_check" style={{ cursor: "pointer", userSelect: "none" }}>
                Clonar importes del semestre anterior ({activeSemester?.nombre_display || "-"})
              </label>
            </div>

            <h3 className={styles.formSubtitle}>Configuración de Importes para el nuevo período</h3>

            <div className={styles.tabScrollContainer}>
              <div className={styles.draftGrid}>
                {/* Becas draft config */}
                <div className={styles.draftCol}>
                  <h5>Categorías de Becas</h5>
                  <div className={styles.draftInputsList}>
                    {draftBecas.map((db, idx) => (
                      <div key={idx} className={styles.draftInputRow}>
                        <label>Cat. {db.numero_categoria}</label>
                        <div className={styles.inputInputWrapper}>
                          <span>$</span>
                          <input
                            type="number"
                            className="input-field"
                            value={db.monto}
                            onChange={(e) => handleDraftBecaChange(idx, Number(e.target.value))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Monos draft config */}
                <div className={styles.draftCol}>
                  <h5>Niveles de Monotributo</h5>
                  <div className={styles.draftInputsList}>
                    {draftMonos.map((dm, idx) => (
                      <div key={idx} className={styles.draftInputRow} style={{ flexDirection: "column", gap: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.03)", paddingBottom: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                          <label className="text-cyan">Cat. {dm.letra}</label>
                          <div className={styles.inputInputWrapper} style={{ width: "160px" }}>
                            <span>$</span>
                            <input
                              type="number"
                              className="input-field"
                              value={dm.monto}
                              onChange={(e) => handleDraftMonoChange(idx, "monto", Number(e.target.value))}
                            />
                          </div>
                        </div>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Cargo/Función"
                          value={dm.descripcion_categoria || ""}
                          onChange={(e) => handleDraftMonoChange(idx, "descripcion_categoria", e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
            <button type="submit" disabled={creating} className={styles.primaryBtn}>
              {creating ? <Loader2 className={styles.spin} size={16} /> : <Calendar size={16} />}
              <span>Crear Semestre e Iniciar Traspaso</span>
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
