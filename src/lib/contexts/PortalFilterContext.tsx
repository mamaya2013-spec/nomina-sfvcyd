"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePortalAuth } from "./PortalAuthContext";

interface Subsecretaria {
  id: string;
  nombre: string;
}

interface Area {
  id: string;
  nombre: string;
  subsecretaria_id: string;
}

interface PortalFilterContextType {
  selectedSubsecretariaId: string; // "all" or specific uuid
  selectedAreaId: string; // "all" or specific uuid
  setSelectedSubsecretariaId: (id: string) => void;
  setSelectedAreaId: (id: string) => void;
  availableSubsecretarias: Subsecretaria[];
  availableAreas: Area[];
  loadingFilters: boolean;
}

const PortalFilterContext = createContext<PortalFilterContextType | undefined>(undefined);

export function PortalFilterProvider({ children }: { children: React.ReactNode }) {
  const { user } = usePortalAuth();
  const [selectedSubsecretariaId, setSelectedSubsecretariaId] = useState<string>("all");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("all");
  const [availableSubsecretarias, setAvailableSubsecretarias] = useState<Subsecretaria[]>([]);
  const [availableAreas, setAvailableAreas] = useState<Area[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  useEffect(() => {
    if (!user) {
      setAvailableSubsecretarias([]);
      setAvailableAreas([]);
      return;
    }

    async function fetchAssignedAreas() {
      setLoadingFilters(true);
      try {
        const res = await fetch("/api/portal/areas");
        if (res.ok) {
          const data = await res.json();
          setAvailableSubsecretarias(data.subsecretarias || []);
          setAvailableAreas(data.areas || []);
        }
      } catch (err) {
        console.error("Error fetching assigned areas:", err);
      } finally {
        setLoadingFilters(false);
      }
    }

    fetchAssignedAreas();
  }, [user]);

  // If subsecretaria changes, we should reset area to "all" if the currently selected area does not belong to the selected subsecretaria
  useEffect(() => {
    if (selectedSubsecretariaId !== "all" && selectedAreaId !== "all") {
      const activeArea = availableAreas.find(a => a.id === selectedAreaId);
      if (activeArea && activeArea.subsecretaria_id !== selectedSubsecretariaId) {
        setSelectedAreaId("all");
      }
    }
  }, [selectedSubsecretariaId, selectedAreaId, availableAreas]);

  // Filter available areas based on selected subsecretaria
  const filteredAreas = selectedSubsecretariaId === "all"
    ? availableAreas
    : availableAreas.filter(area => area.subsecretaria_id === selectedSubsecretariaId);

  return (
    <PortalFilterContext.Provider
      value={{
        selectedSubsecretariaId,
        selectedAreaId,
        setSelectedSubsecretariaId,
        setSelectedAreaId,
        availableSubsecretarias,
        availableAreas: filteredAreas,
        loadingFilters,
      }}
    >
      {children}
    </PortalFilterContext.Provider>
  );
}

export function usePortalFilter() {
  const context = useContext(PortalFilterContext);
  if (context === undefined) {
    throw new Error("usePortalFilter must be used within a PortalFilterProvider");
  }
  return context;
}
