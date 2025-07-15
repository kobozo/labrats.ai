import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
  ConnectionLineType,
  Handle,
  BaseEdge,
  EdgeProps,
  getSmoothStepPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './WorkflowVisualization.css';
import { workflowStages } from '../../config/workflow-stages';
import { X } from 'lucide-react';

interface WorkflowVisualizationProps {
  onClose: () => void;
}

const nodeWidth = 200;
const nodeHeight = 100;
const horizontalSpacing = 280;
const verticalSpacing = 150;

// Custom edge that routes below nodes
const CustomReturnEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps) => {
  const offset = data?.offset || 30;
  
  // Create a path that goes below the nodes
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Bottom,
    targetX,
    targetY,
    targetPosition: Position.Bottom,
    borderRadius: 20,
    offset,
  });

  return (
    <>
      <BaseEdge 
        id={id}
        path={edgePath} 
        markerEnd={markerEnd} 
        style={style}
        label={label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
      />
    </>
  );
};

// Custom node component
const WorkflowNode = ({ data }: { data: any }) => {
  return (
    <div 
      className="workflow-node"
      style={{
        '--node-bg-start': data.bgStart,
        '--node-bg-end': data.bgEnd,
        '--node-border': data.borderColor,
      } as React.CSSProperties}
    >
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{ background: '#6b7280', left: -8 }} 
        id="left"
      />
      <Handle 
        type="target" 
        position={Position.Bottom} 
        style={{ background: '#ef4444', bottom: -8, left: '30%' }} 
        id="bottom"
      />
      <div className="workflow-node-title">{data.title}</div>
      <div className="workflow-node-rats">{data.rats}</div>
      {data.parallel && (
        <div className="workflow-node-parallel">{data.parallel}</div>
      )}
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ background: '#6b7280', right: -8 }} 
        id="right"
      />
      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ background: '#ef4444', bottom: -8, right: '30%' }} 
        id="bottom-out"
      />
    </div>
  );
};

const nodeTypes = {
  workflow: WorkflowNode,
};

const edgeTypes = {
  'custom-return': CustomReturnEdge,
};

export const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({ onClose }) => {
  const nodes = useMemo<Node[]>(() => {
    // Create a horizontal layout
    return workflowStages.map((stage, index) => {
      const colors = getStageColors(stage.color);
      
      // Place all nodes in a single horizontal line
      const x = index * horizontalSpacing + 50;
      const y = 200;
      
      return {
        id: stage.id,
        type: 'workflow',
        position: { x, y },
        data: {
          title: stage.title,
          rats: stage.primaryRats.join(', '),
          parallel: stage.allowedParallelWork?.join(' • '),
          bgStart: colors.bgStart,
          bgEnd: colors.bgEnd,
          borderColor: colors.border,
        },
      };
    });
  }, []);

  const edges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    
    // Forward progression edges (straight lines between adjacent nodes)
    for (let i = 0; i < workflowStages.length - 1; i++) {
      edges.push({
        id: `forward-${i}`,
        source: workflowStages[i].id,
        target: workflowStages[i + 1].id,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'straight',
        animated: true,
        style: {
          stroke: '#10b981',
          strokeWidth: 3,
          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#10b981',
          width: 20,
          height: 20,
        },
        label: i === 0 ? 'Cortex' : undefined, // Only show label on first edge
        labelStyle: {
          fontSize: '12px',
          fontWeight: 'bold',
          fill: '#10b981',
          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
        },
        labelBgStyle: {
          fill: '#111827',
          fillOpacity: 0.95,
        },
      });
    }
    
    // Return authority edges (curved paths below nodes)
    let returnOffset = 40;
    workflowStages.forEach((stage, stageIndex) => {
      if (stage.returnAuthority) {
        stage.returnAuthority.targetStages.forEach((targetStage, idx) => {
          const targetIndex = workflowStages.findIndex(s => s.id === targetStage);
          if (targetIndex !== -1 && targetIndex < stageIndex) {
            const distance = stageIndex - targetIndex;
            const currentOffset = returnOffset + (idx * 25); // Stagger multiple returns
            
            edges.push({
              id: `return-${stage.id}-${targetStage}-${idx}`,
              source: stage.id,
              target: targetStage,
              sourceHandle: 'bottom-out',
              targetHandle: 'bottom',
              type: 'custom-return',
              data: {
                offset: currentOffset + (distance * 10), // More offset for longer returns
              },
              animated: false,
              style: {
                stroke: '#ef4444',
                strokeWidth: 2,
                strokeDasharray: '8 4',
                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#ef4444',
                width: 18,
                height: 18,
              },
              label: stage.returnAuthority?.rats.join(', ') || '',
              labelStyle: {
                fontSize: '11px',
                fill: '#ef4444',
                fontWeight: '500',
                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
              },
              labelBgStyle: {
                fill: '#111827',
                fillOpacity: 0.95,
              },
            });
          }
        });
        returnOffset += 30; // Increment base offset for next stage's returns
      }
    });
    
    return edges;
  }, []);

  const [nodesState, , onNodesChange] = useNodesState(nodes);
  const [edgesState, , onEdgesChange] = useEdgesState(edges);

  const nodeColor = (node: Node): string => {
    return '#1f2937';
  };

  return (
    <div className="fixed inset-0 bg-gray-900/95 z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-700 relative z-10">
        <h2 className="text-xl font-bold text-white">LabRats Workflow Pipeline</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          type="button"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>
      
      <div className="flex-1">
        <ReactFlow
          nodes={nodesState}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          connectionLineType={ConnectionLineType.SmoothStep}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          attributionPosition="bottom-left"
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          panOnScroll={true}
          preventScrolling={false}
          defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
          fitViewOptions={{ padding: 0.2, maxZoom: 0.8 }}
        >
          <Background color="#374151" gap={20} />
          <Controls className="bg-gray-800 border-gray-700" />
          <MiniMap 
            nodeColor={nodeColor}
            className="bg-gray-800 border-gray-700"
            maskColor="rgb(17, 24, 39, 0.8)"
            nodeStrokeWidth={3}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
      
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center justify-center space-x-8 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t-2 border-green-500"></div>
            <span className="text-gray-300">Forward Progression (Cortex only)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0 border-t-2 border-dashed border-red-500"></div>
            <span className="text-gray-300">Return Authority</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function getStageColors(color: string): { bgStart: string; bgEnd: string; border: string } {
  const colorMap: Record<string, { bgStart: string; bgEnd: string; border: string }> = {
    gray: { bgStart: '#374151', bgEnd: '#1f2937', border: '#6b7280' },
    purple: { bgStart: '#7c3aed', bgEnd: '#6b21a8', border: '#a78bfa' },
    pink: { bgStart: '#ec4899', bgEnd: '#db2777', border: '#f9a8d4' },
    blue: { bgStart: '#3b82f6', bgEnd: '#2563eb', border: '#60a5fa' },
    indigo: { bgStart: '#6366f1', bgEnd: '#4f46e5', border: '#818cf8' },
    yellow: { bgStart: '#eab308', bgEnd: '#ca8a04', border: '#fde047' },
    red: { bgStart: '#ef4444', bgEnd: '#dc2626', border: '#fca5a5' },
    orange: { bgStart: '#f97316', bgEnd: '#ea580c', border: '#fdba74' },
    teal: { bgStart: '#14b8a6', bgEnd: '#0d9488', border: '#5eead4' },
    green: { bgStart: '#10b981', bgEnd: '#059669', border: '#6ee7b7' },
  };
  return colorMap[color] || { bgStart: '#374151', bgEnd: '#1f2937', border: '#6b7280' };
}