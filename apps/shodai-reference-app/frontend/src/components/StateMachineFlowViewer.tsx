import * as React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  ReactFlow,
  Background,
  Controls,
  Handle,
  MiniMap,
  MarkerType,
  Position,
  useEdgesState,
  useNodesState,
  type ReactFlowInstance,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

type TransitionEdge = { from: string; to: string; input?: string };

function shorten(s: string, max = 28): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(10, Math.floor(max / 2) - 1))}…${s.slice(-6)}`;
}

function StateNode(props: NodeProps) {
  const { data } = props;
  const handleStyle: React.CSSProperties = {
    width: 10,
    height: 10,
    background: "transparent",
    border: "0",
    opacity: 0,
    pointerEvents: "none",
  };

  return (
    <div className="h-full w-full">
      {/* Top-down: enter from top, exit from bottom */}
      <Handle id="in" type="target" position={Position.Top} style={{ ...handleStyle, left: "50%", top: -6 }} />
      <Handle id="out" type="source" position={Position.Bottom} style={{ ...handleStyle, left: "50%", bottom: -6 }} />
      {/* Extra invisible left handles used only for "back edges" so they can route around the left */}
      <Handle id="leftIn" type="target" position={Position.Left} style={{ ...handleStyle, left: -6, top: "50%" }} />
      <Handle id="leftOut" type="source" position={Position.Left} style={{ ...handleStyle, left: -6, top: "50%" }} />
      <div>{(data as any)?.label as any}</div>
    </div>
  );
}

function BackEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, style, label, data } = props;

  // "Lane" is used to avoid multiple back-edges from the same node drawing on top of each other.
  const lane = Number((data as any)?.lane ?? 0);
  const extraLeft = lane * 60;
  const controlX = Math.min(sourceX, targetX) - 180 - extraLeft;

  // Route out to the left and back in (smooth, rounded).
  const path = `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`;
  const labelX = controlX + 12;
  const labelY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="rounded-full border border-neutral-border bg-white/90 px-2 py-0.5 text-[11px] text-subtext-color"
          >
            <span className="font-mono">{String(label)}</span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function buildGraph(params: {
  agreementJson: any;
  currentState?: string | null;
  initialState?: string | null;
}): { nodes: Node[]; edges: Edge[] } {
  const { agreementJson, currentState, initialState } = params;
  const exec = agreementJson?.execution ?? {};
  const statesObj = exec?.states ?? {};
  const stateIds = Object.keys(statesObj);
  const transitions = Array.isArray(exec?.transitions) ? exec.transitions : [];

  const tEdges: TransitionEdge[] = transitions
    .map((t: any) => {
      const from = t?.from;
      const to = t?.to;
      const input = t?.conditions?.[0]?.input;
      if (!from || !to) return null;
      return { from: String(from), to: String(to), input: input ? String(input) : undefined };
    })
    .filter(Boolean) as TransitionEdge[];

  const outgoingCount = new Map<string, number>();
  for (const s of stateIds) outgoingCount.set(s, 0);
  for (const e of tEdges) outgoingCount.set(e.from, (outgoingCount.get(e.from) ?? 0) + 1);

  const nodeW = 320;
  const nodeH = 64;
  const gapX = 220;
  const gapY = 80;
  const startId = (initialState || currentState || stateIds[0] || null) as string | null;

  const nodes: Node[] = [];
  const posById = new Map<string, { x: number; y: number }>();
  const levelById = new Map<string, number>();
  const placed = new Set<string>();

  const outgoing = new Map<string, string[]>();
  for (const e of tEdges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from)!.push(e.to);
  }
  for (const [k, arr] of outgoing.entries()) {
    outgoing.set(
      k,
      Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b)),
    );
  }

  // Reachability: gray out states that can no longer be reached from the current state
  // (or from initial state when previewing a template).
  const reachableFrom = (currentState || initialState || stateIds[0] || null) as string | null;
  const reachable = new Set<string>();
  if (reachableFrom) {
    const q: string[] = [reachableFrom];
    while (q.length) {
      const s = q.shift()!;
      if (reachable.has(s)) continue;
      reachable.add(s);
      const nexts = outgoing.get(s) ?? [];
      for (const n of nexts) if (!reachable.has(n)) q.push(n);
    }
  }

  const occupiedXByLevel = new Map<number, number[]>();
  function reserveX(level: number, proposedX: number): number {
    const xs = occupiedXByLevel.get(level) ?? [];
    const minGap = nodeW + gapX;
    let x = proposedX;
    // Collision-avoidance within the same row: nudge right until there's enough space.
    for (let attempts = 0; attempts < 80; attempts++) {
      const collides = xs.some((ox) => Math.abs(ox - x) < minGap);
      if (!collides) break;
      x += minGap;
    }
    xs.push(x);
    occupiedXByLevel.set(level, xs);
    return x;
  }

  function placeNode(id: string, level: number, x: number) {
    if (placed.has(id)) return;
    placed.add(id);
    levelById.set(id, level);
    const y = level * (nodeH + gapY);
    const xFinal = reserveX(level, x);
    posById.set(id, { x: xFinal, y });

    const children = outgoing.get(id) ?? [];
    if (!children.length) return;

    const newKids = children.filter((c) => !placed.has(c));
    if (!newKids.length) return;

    const forkCount = newKids.length;
    for (let i = 0; i < forkCount; i++) {
      const kid = newKids[i];
      const offset = (i - (forkCount - 1) / 2) * (nodeW + gapX);
      placeNode(kid, level + 1, xFinal + offset);
    }
  }

  if (startId) placeNode(startId, 0, 0);

  // Place any remaining states below, stacked.
  const remaining = stateIds.filter((s) => !placed.has(s)).sort((a, b) => a.localeCompare(b));
  const maxLevel = Math.max(0, ...Array.from(levelById.values()));
  for (let i = 0; i < remaining.length; i++) {
    placeNode(remaining[i], maxLevel + 1, i * (nodeW + gapX));
  }

  for (const id of stateIds) {
    const meta = statesObj?.[id] ?? {};
    const isCurrent = !!currentState && id === currentState;
    const isInitial = !!initialState && id === initialState;
    const isReachable = reachable.size ? reachable.has(id) : true;
    const pos = posById.get(id) ?? { x: 0, y: 0 };
    nodes.push({
      id,
      type: "stateNode",
      position: pos,
      data: {
        label: (
          <div className="flex flex-col">
            <div className="text-sm font-mono text-default-font">{shorten(id, 38)}</div>
            <div className="text-xs text-subtext-color">
              {isCurrent ? "current" : isInitial ? "start" : meta?.name ? meta.name : ""}
            </div>
          </div>
        ),
      },
      style: {
        width: nodeW,
        minHeight: nodeH,
        borderRadius: 12,
        border: isCurrent
          ? "2px solid var(--color-brand-600)"
          : isReachable
            ? "1px solid var(--color-neutral-border)"
            : "1px solid var(--color-neutral-border)",
        background: isCurrent
          ? "var(--color-brand-50)"
          : isReachable
            ? "var(--color-default-background)"
            : "var(--color-neutral-50)",
        padding: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        opacity: isReachable ? 1 : 0.45,
      },
    });
  }

  const backLaneBySource = new Map<string, number>();
  const edges: Edge[] = tEdges.map((e, idx) => {
    const isActiveEdge = !!currentState && e.from === currentState;
    const label = e.input ?? "";
    const fromLevel = levelById.get(e.from) ?? 0;
    const toLevel = levelById.get(e.to) ?? 0;
    const isBack = e.from === e.to || toLevel <= fromLevel;
    const lane = isBack ? (backLaneBySource.get(e.from) ?? 0) : 0;
    if (isBack) backLaneBySource.set(e.from, lane + 1);
    return {
      id: `${e.from}->${e.to}:${label}:${idx}`,
      source: e.from,
      target: e.to,
      sourceHandle: isBack ? "leftOut" : "out",
      targetHandle: isBack ? "leftIn" : "in",
      type: isBack ? "back" : "bezier",
      animated: isActiveEdge,
      label: label ? shorten(label, 24) : undefined,
      data: isBack ? { lane } : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: isActiveEdge ? "var(--color-brand-600)" : "var(--color-subtext-color)",
      },
      style: {
        stroke: isActiveEdge ? "var(--color-brand-600)" : "var(--color-subtext-color)",
        strokeWidth: isActiveEdge ? 2.25 : 1.5,
      },
    };
  });

  return { nodes, edges };
}

export default function StateMachineFlowViewer(props: {
  agreementJson: any;
  currentState?: string | null;
  initialState?: string | null;
  /**
   * Optional height/class override for the outer container.
   * Defaults to a tall canvas suitable for the dedicated tab view.
   */
  className?: string;
  /**
   * Show the bottom-right minimap. Disable for small preview cards.
   */
  showMiniMap?: boolean;
}) {
  const { agreementJson, currentState, initialState, className, showMiniMap = true } = props;

  const graph = React.useMemo(
    () => buildGraph({ agreementJson, currentState, initialState }),
    [agreementJson, currentState, initialState],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const [rf, setRf] = React.useState<ReactFlowInstance | null>(null);
  const lastCenteredStateRef = React.useRef<string | null>(null);

  // Keep user-dragged positions, but refresh labels/styles when props change.
  React.useEffect(() => {
    setNodes((prev) => {
      if (!prev.length) return graph.nodes;
      const prevById = new Map(prev.map((n) => [String(n.id), n]));
      return graph.nodes.map((n) => {
        const p = prevById.get(String(n.id));
        if (!p) return n;
        return {
          ...n,
          position: p.position,
          positionAbsolute: (p as any).positionAbsolute,
        } as any;
      });
    });
    setEdges(graph.edges);
  }, [graph.nodes, graph.edges, setNodes, setEdges]);

  React.useEffect(() => {
    if (!rf) return;

    const targetId = (currentState || initialState || null) as string | null;
    if (!targetId) return;
    if (lastCenteredStateRef.current === targetId) return;

    const node = nodes.find((n) => String(n.id) === String(targetId));
    if (!node) return;

    // Fit view around the target node (centers and picks a reasonable zoom).
    // Defer to next frame to ensure ReactFlow has applied latest node positions.
    lastCenteredStateRef.current = targetId;
    requestAnimationFrame(() => {
      try {
        rf.fitView({
          nodes: [node],
          padding: 0.6,
          duration: 350,
          maxZoom: 1.2,
        });
      } catch {
        // best-effort
      }
    });
  }, [rf, nodes, currentState, initialState]);

  return (
    <div className={`${className || "h-[72vh]"} w-full rounded-lg border border-neutral-border bg-white`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        nodeTypes={{ stateNode: StateNode }}
        edgeTypes={{ back: BackEdge }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setRf}
      >
        <Background gap={18} size={1} />
        <Controls />
        {showMiniMap ? (
          <MiniMap
            nodeColor={(n) => {
              const isCurrent = String(n.id) === String(currentState);
              const opacity = Number((n as any)?.style?.opacity ?? 1);
              if (isCurrent) return "var(--color-brand-300)";
              return opacity < 1 ? "var(--color-neutral-100)" : "var(--color-neutral-200)";
            }}
            maskColor="rgba(248,250,252,0.8)"
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}
