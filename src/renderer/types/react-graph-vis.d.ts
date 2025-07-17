declare module 'react-graph-vis' {
  import { Component } from 'react';

  interface Node {
    id: string;
    label?: string;
    title?: string;
    color?: {
      background?: string;
      border?: string;
      highlight?: {
        background?: string;
        border?: string;
      };
    };
    font?: {
      color?: string;
      size?: number;
    };
    shape?: string;
    margin?: number;
    widthConstraint?: {
      minimum?: number;
      maximum?: number;
    };
    heightConstraint?: {
      minimum?: number;
    };
  }

  interface Edge {
    id: string;
    from: string;
    to: string;
    arrows?: string;
    color?: {
      color?: string;
      highlight?: string;
      hover?: string;
    };
    width?: number;
    smooth?: {
      type?: string;
      roundness?: number;
    };
  }

  interface GraphData {
    nodes: Node[];
    edges: Edge[];
  }

  interface GraphOptions {
    layout?: any;
    physics?: any;
    nodes?: any;
    edges?: any;
    interaction?: any;
  }

  interface GraphEvents {
    select?: (event: any) => void;
    click?: (event: any) => void;
    doubleClick?: (event: any) => void;
    oncontext?: (event: any) => void;
    hold?: (event: any) => void;
    release?: (event: any) => void;
    selectNode?: (event: any) => void;
    selectEdge?: (event: any) => void;
    deselectNode?: (event: any) => void;
    deselectEdge?: (event: any) => void;
    dragStart?: (event: any) => void;
    dragging?: (event: any) => void;
    dragEnd?: (event: any) => void;
    hoverNode?: (event: any) => void;
    blurNode?: (event: any) => void;
    hoverEdge?: (event: any) => void;
    blurEdge?: (event: any) => void;
    zoom?: (event: any) => void;
    showPopup?: (event: any) => void;
    hidePopup?: () => void;
    startStabilizing?: () => void;
    stabilizationProgress?: (event: any) => void;
    stabilizationIterationsDone?: () => void;
    stabilized?: (event: any) => void;
    resize?: (event: any) => void;
    initRedraw?: () => void;
    beforeDrawing?: (event: any) => void;
    afterDrawing?: (event: any) => void;
    animationFinished?: () => void;
    configChange?: (event: any) => void;
  }

  interface GraphProps {
    graph: GraphData;
    options?: GraphOptions;
    events?: GraphEvents;
    style?: React.CSSProperties;
    getNetwork?: (network: any) => void;
    getNodes?: (nodes: any) => void;
    getEdges?: (edges: any) => void;
    identifier?: string;
  }

  class Graph extends Component<GraphProps> {}

  export default Graph;
}