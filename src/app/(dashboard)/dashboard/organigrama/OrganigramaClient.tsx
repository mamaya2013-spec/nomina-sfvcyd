"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createClient } from "@/lib/supabase/client";
import { useSemester } from "@/lib/contexts/SemesterContext";
import { Search, X, Users, ArrowUpRight, ShieldCheck, Layers, Building2, Network } from "lucide-react";
import Link from "next/link";
import styles from "./organigrama.module.css";

// ----------------------------------------------------
// NODE TYPES & CUSTOM COMPONENTS DEFINITION
// ----------------------------------------------------
interface NodeData {
  label: string;
  count: number;
  budget: number;
  level: "secretaria" | "subsecretaria" | "area";
  becarios: any[];
  monotributistas: any[];
  responsables: any[];
}

const SecretariaNode = ({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as NodeData;
  return (
    <div className={`${styles.nodeBase} ${styles.nodeSecretaria} ${selected ? styles.nodeSelected : ""}`}>
      <div className={styles.nodeTitle}>{nodeData.label}</div>
      <div className={styles.nodeStats}>
        <div className={styles.nodeStatRow}>
          <span>Personal:</span>
          <span className={styles.nodeStatValue}>{nodeData.count} agentes</span>
        </div>
        <div className={styles.nodeStatRow}>
          <span>Presupuesto:</span>
          <span className={styles.nodeStatValue}>
            {nodeData.budget.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "#d4af37", width: 8, height: 8 }} />
    </div>
  );
};

const SubsecretariaNode = ({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as NodeData;
  return (
    <div className={`${styles.nodeBase} ${styles.nodeSubsecretaria} ${selected ? styles.nodeSelected : ""}`}>
      <Handle type="target" position={Position.Top} style={{ background: "#8b5cf6", width: 8, height: 8 }} />
      <div className={styles.nodeTitle}>{nodeData.label}</div>
      <div className={styles.nodeStats}>
        <div className={styles.nodeStatRow}>
          <span>Personal:</span>
          <span className={styles.nodeStatValue}>{nodeData.count} agentes</span>
        </div>
        <div className={styles.nodeStatRow}>
          <span>Presupuesto:</span>
          <span className={styles.nodeStatValue}>
            {nodeData.budget.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "#8b5cf6", width: 8, height: 8 }} />
    </div>
  );
};

const AreaNode = ({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as NodeData;
  return (
    <div className={`${styles.nodeBase} ${styles.nodeArea} ${selected ? styles.nodeSelected : ""}`}>
      <Handle type="target" position={Position.Top} style={{ background: "#10b981", width: 8, height: 8 }} />
      <div className={styles.nodeTitle}>{nodeData.label}</div>
      <div className={styles.nodeStats}>
        <div className={styles.nodeStatRow}>
          <span>Personal:</span>
          <span className={styles.nodeStatValue}>{nodeData.count} agentes</span>
        </div>
        <div className={styles.nodeStatRow}>
          <span>Presupuesto:</span>
          <span className={styles.nodeStatValue}>
            {nodeData.budget.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
};

const customNodeTypes = {
  secretaria: SecretariaNode,
  subsecretaria: SubsecretariaNode,
  area: AreaNode,
};

// ----------------------------------------------------
// MAIN PAGE COMPONENT
// ----------------------------------------------------
export default function OrganigramaClient() {
  const supabase = createClient();
  const { selectedSemester } = useSemester();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeData, setSelectedNodeData] = useState<NodeData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Load and construct structural chart data
  const loadChartData = async () => {
    if (!selectedSemester) return;
    setLoading(true);
    try {
      // Fetch core hierarchy
      const { data: subs } = await supabase.from("subsecretarias").select("*").eq("activa", true).order("orden");
      const { data: ars } = await supabase.from("areas").select("*").eq("activa", true).order("orden");
      const { data: resps } = await supabase.from("responsables").select("*").eq("activo", true);

      const activeSubs = subs || [];
      const activeAreas = ars || [];
      const activeResps = resps || [];

      let activeBecs: any[] = [];
      let activeMonos: any[] = [];

      // Fetch personnel (live vs closed snapshots)
      if (selectedSemester.bloqueado) {
        const { data: snapshot } = await supabase
          .from("snapshots_semestre")
          .select("*")
          .eq("semestre_id", selectedSemester.id)
          .maybeSingle();

        if (snapshot) {
          activeBecs = (snapshot.nomina_becarios_snapshot || []).filter((b: any) => b.estado === "Activo");
          activeMonos = (snapshot.nomina_monos_snapshot || []).filter((m: any) => m.estado === "Activo");
        }
      } else {
        const { data: becs } = await supabase.from("becarios").select("*").eq("estado", "Activo");
        const { data: monos } = await supabase.from("monotributistas").select("*").eq("estado", "Activo");
        activeBecs = becs || [];
        activeMonos = monos || [];
      }

      // Map statistics per Area
      const areaDataMap = activeAreas.map((area) => {
        const areaBecs = activeBecs.filter((b) => b.area_id === area.id);
        const areaMonos = activeMonos.filter((m) => m.area_id === area.id);
        return {
          id: area.id,
          label: area.nombre,
          subsecretaria_id: area.subsecretaria_id,
          count: areaBecs.length + areaMonos.length,
          budget: areaBecs.reduce((sum, b) => sum + Number(b.importe_total || 0), 0) +
                  areaMonos.reduce((sum, m) => sum + Number(m.importe_total || 0), 0),
          becarios: areaBecs,
          monotributistas: areaMonos,
          responsables: activeResps.filter((r) => r.area_id === area.id),
        };
      });

      // Map statistics per Subsecretaría
      const subDataMap = activeSubs.map((sub) => {
        const subBecs = activeBecs.filter((b) => b.subsecretaria_id === sub.id);
        const subMonos = activeMonos.filter((m) => m.subsecretaria_id === sub.id);
        return {
          id: sub.id,
          label: sub.nombre,
          count: subBecs.length + subMonos.length,
          budget: subBecs.reduce((sum, b) => sum + Number(b.importe_total || 0), 0) +
                  subMonos.reduce((sum, m) => sum + Number(m.importe_total || 0), 0),
          becarios: subBecs,
          monotributistas: subMonos,
          responsables: activeResps.filter((r) => r.subsecretaria_id === sub.id),
        };
      });

      // Map statistics for Root Secretariat
      const secCount = activeBecs.length + activeMonos.length;
      const secBudget = activeBecs.reduce((sum, b) => sum + Number(b.importe_total || 0), 0) +
                        activeMonos.reduce((sum, m) => sum + Number(m.importe_total || 0), 0);

      // Generate Node positions and links
      const flowNodes: Node[] = [];
      const flowEdges: Edge[] = [];

      // 1. Root Node
      const totalWidth = Math.max((activeSubs.length - 1) * 350, 400);
      const rootX = totalWidth / 2;

      flowNodes.push({
        id: "secretaria_root",
        type: "secretaria",
        position: { x: rootX + 50, y: 50 },
        data: {
          label: "Secretaría de Fortalecimiento Vecinal, Cultura y Deportes",
          count: secCount,
          budget: secBudget,
          level: "secretaria",
          becarios: activeBecs,
          monotributistas: activeMonos,
          responsables: activeResps.filter((r) => !r.subsecretaria_id), // Secretariat direct advisors
        },
      });

      // 2. Subsecretarías and Areas
      activeSubs.forEach((sub, subIdx) => {
        const subX = subIdx * 350;
        const subY = 230;
        const subStat = subDataMap.find((s) => s.id === sub.id) || { count: 0, budget: 0, becarios: [], monotributistas: [], responsables: [] };

        flowNodes.push({
          id: `sub_${sub.id}`,
          type: "subsecretaria",
          position: { x: subX, y: subY },
          data: {
            label: sub.nombre,
            count: subStat.count,
            budget: subStat.budget,
            level: "subsecretaria",
            becarios: subStat.becarios,
            monotributistas: subStat.monotributistas,
            responsables: subStat.responsables,
          },
        });

        // Edge from Secretary root to Subsecretaría
        flowEdges.push({
          id: `edge_root_to_sub_${sub.id}`,
          source: "secretaria_root",
          target: `sub_${sub.id}`,
          type: "smoothstep",
          animated: true,
        });

        // Areas under this Subsecretaría
        const subAreas = areaDataMap.filter((a) => a.subsecretaria_id === sub.id);
        subAreas.forEach((area, areaIdx) => {
          const areaX = subX;
          const areaY = 400 + areaIdx * 140;

          flowNodes.push({
            id: `area_${area.id}`,
            type: "area",
            position: { x: areaX, y: areaY },
            data: {
              label: area.label,
              count: area.count,
              budget: area.budget,
              level: "area",
              becarios: area.becarios,
              monotributistas: area.monotributistas,
              responsables: area.responsables,
            },
          });

          // Edge from Subsecretaría to Area
          flowEdges.push({
            id: `edge_sub_${sub.id}_to_area_${area.id}`,
            source: `sub_${sub.id}`,
            target: `area_${area.id}`,
            type: "smoothstep",
          });
        });
      });

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      console.error("Error building organigrama diagram:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      loadChartData();
      setSelectedNodeData(null);
      setSearchTerm("");
    }
  }, [selectedSemester]);

  // Sidebar dynamic filtering for personnel
  const filteredPersonnel = useMemo(() => {
    if (!selectedNodeData) return [];
    const list = [
      ...selectedNodeData.becarios.map((b) => ({ ...b, type: "Becario" })),
      ...selectedNodeData.monotributistas.map((m) => ({ ...m, type: "Monotributista" })),
    ];
    if (!searchTerm) return list;
    return list.filter((p) => p.apellido_nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [selectedNodeData, searchTerm]);

  // Handle node selection
  const handleNodeClick = (_event: React.MouseEvent, node: Node<any>) => {
    setSelectedNodeData(node.data as NodeData);
    setSearchTerm("");
  };

  return (
    <div className={styles.container}>
      <div className={styles.flowWrapper}>
        {loading ? (
          <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
            <span className="text-secondary">Cargando Estructura Orgánica...</span>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={customNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background color="rgba(255,255,255,0.05)" gap={16} />
            <Controls />
            <MiniMap
              zoomable
              pannable
              nodeColor={(node) => {
                if (node.type === "secretaria") return "#d4af37";
                if (node.type === "subsecretaria") return "#8b5cf6";
                return "#10b981";
              }}
              maskColor="rgba(0, 0, 0, 0.7)"
            />
          </ReactFlow>
        )}
      </div>

      {/* Detail Sidebar */}
      <div className={`${styles.sidebar} ${!selectedNodeData ? styles.sidebarClosed : ""}`}>
        {selectedNodeData && (
          <>
            <div className={styles.sidebarHeader}>
              <div>
                <span className={styles.sidebarSubtitle}>
                  {selectedNodeData.level === "secretaria"
                    ? "Nivel Superior"
                    : selectedNodeData.level === "subsecretaria"
                    ? "Subsecretaría"
                    : "Área Operativa"}
                </span>
                <h2>{selectedNodeData.label}</h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setSelectedNodeData(null)}>
                <X size={18} />
              </button>
            </div>

            {/* KPIs */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Agentes Activos</span>
                <span className={styles.kpiValue}>
                  <Users size={16} style={{ display: "inline", marginRight: "6px" }} />
                  {selectedNodeData.count}
                </span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Presupuesto Mensual</span>
                <span className={`${styles.kpiValue} ${styles.kpiValueMono}`}>
                  {selectedNodeData.budget.toLocaleString("es-AR", {
                    style: "currency",
                    currency: "ARS",
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            </div>

            {/* Responsibles list */}
            {selectedNodeData.responsables.length > 0 && (
              <div className={styles.responsablesSection}>
                <div className={styles.sectionTitle}>Autoridades y Responsables</div>
                <div className={styles.responsablesList}>
                  {selectedNodeData.responsables.map((resp) => (
                    <div key={resp.id} className={styles.responsableItem}>
                      <span className={styles.respName}>{resp.nombre_completo}</span>
                      <span className={styles.respCargo}>{resp.cargo || "Responsable"}</span>
                      <Link href={`/dashboard/configuracion/responsables/${resp.id}`} className={styles.viewProfileLink}>
                        <span>Ver detalle responsable</span>
                        <ArrowUpRight size={10} />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Personnel assigned list */}
            <div className={styles.agentListSection}>
              <div className={styles.sectionTitle}>Nómina de Agentes Asignados</div>
              
              <div className={styles.searchWrapper}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Buscar agente en esta sección..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <div className={styles.agentList}>
                {filteredPersonnel.length === 0 ? (
                  <div className={styles.emptyState}>No se encontraron agentes en esta oficina.</div>
                ) : (
                  filteredPersonnel.map((agent) => (
                    <div key={agent.id} className={styles.agentItem}>
                      <div>
                        <div className={styles.agentName}>{agent.apellido_nombre}</div>
                        <div className={styles.agentType}>
                          {agent.type} {agent.cuit ? `| CUIL: ${agent.cuit}` : ""}
                        </div>
                        <Link
                          href={agent.type === "Becario" ? `/dashboard/becarios/${agent.id}` : `/dashboard/monotributistas/${agent.id}`}
                          className={styles.viewProfileLink}
                        >
                          <span>Ficha de nómina</span>
                          <ArrowUpRight size={10} />
                        </Link>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                        <span className={styles.agentBudget}>
                          {Number(agent.importe_total || 0).toLocaleString("es-AR", {
                            style: "currency",
                            currency: "ARS",
                            maximumFractionDigits: 0,
                          })}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                          Base: ${Number(agent.type === "Becario" ? agent.importe_mensual_beca : agent.importe_mensual_monotributo || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                          Activa: ${Number(agent.importe_tarjeta_activa || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
