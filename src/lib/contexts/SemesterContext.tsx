"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Semestre {
  id: string;
  anio: number;
  numero_semestre: number;
  nombre_display: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  bloqueado: boolean;
  created_at?: string;
}

interface SemesterContextType {
  semesters: Semestre[];
  selectedSemester: Semestre | null;
  activeSemester: Semestre | null;
  selectSemester: (id: string) => void;
  refreshSemesters: () => Promise<void>;
  loading: boolean;
}

const SemesterContext = createContext<SemesterContextType | undefined>(undefined);

export function SemesterProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [semesters, setSemesters] = useState<Semestre[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<Semestre | null>(null);
  const [activeSemester, setActiveSemester] = useState<Semestre | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSemesters = async () => {
    try {
      const { data, error } = await supabase
        .from("semestres")
        .select("*")
        .order("anio", { ascending: false })
        .order("numero_semestre", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setSemesters(data);
        const active = data.find((s) => s.activo === true);
        setActiveSemester(active || null);

        // Load previously selected semester from local storage if valid
        const cachedId = localStorage.getItem("selected_semester_id");
        const cached = cachedId ? data.find((s) => s.id === cachedId) : null;

        // Default to cached, active, or first semester
        setSelectedSemester(cached || active || data[0] || null);
      } else {
        setSemesters([]);
        setSelectedSemester(null);
        setActiveSemester(null);
      }
    } catch (err) {
      console.error("Error fetching semesters:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSemesters();
  }, []);

  const selectSemester = (id: string) => {
    const sem = semesters.find((s) => s.id === id);
    if (sem) {
      setSelectedSemester(sem);
      localStorage.setItem("selected_semester_id", id);
    }
  };

  return (
    <SemesterContext.Provider
      value={{
        semesters,
        selectedSemester,
        activeSemester,
        selectSemester,
        refreshSemesters: fetchSemesters,
        loading,
      }}
    >
      {children}
    </SemesterContext.Provider>
  );
}

export function useSemester() {
  const context = useContext(SemesterContext);
  if (context === undefined) {
    throw new Error("useSemester must be used within a SemesterProvider");
  }
  return context;
}
