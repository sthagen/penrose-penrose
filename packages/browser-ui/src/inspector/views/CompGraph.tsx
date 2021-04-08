import * as React from "react";
import IViewProps from "./IViewProps";
import { prettyPrintFn, evalFns } from "@penrose/core";
import { zip, uniqBy } from "lodash";
import DataTable from "react-data-table-component";
import Graph from 'react-graph-vis';
// import { VarAD } from "@penrose/core/";

// TODO: Verify this is correct on small examples

// TODO: Only render the graph once. Otherwise, it's rerendered on each frame, which makes things substantially slower

// TODO Not sure what to do with this?
// import "./styles.css";
// // need to import the vis network css in order to show tooltip
// import "./network.css";

// Flatten a list of lists into a single list of elements
const merge = (arr: any) => [].concat.apply([], arr);

// Given a parent node, returns the graph corresponding to nodes and edges of children
// May contain duplicate nodes
// TODO: Move this to utils?
// TODO: Add type for graph and VarAD
const traverseGraphTopDown = (par: any): any => {
  const parNode = { id: par.id, label: par.op };
  const edges = par.children.map(edge => ({ from: parNode.id, to: edge.node.id }));

  const subgraphs = par.children.map(edge => traverseGraphTopDown(edge.node));
  const subnodes = merge(subgraphs.map(g => g.nodes));
  const subedges = merge(subgraphs.map(g => g.edges));

  return {
    nodes: [parNode].concat(subnodes),
    edges: edges.concat(subedges)
  };
};

// Return unique nodes after all nodes are merged
const traverseUnique = (par: any): any => {
  const g = traverseGraphTopDown(par);
  return {
    ...g,
    nodes: uniqBy(g.nodes, e => e.id)
  };
};

const CompGraph: React.FC<IViewProps> = ({ frame, history }: IViewProps) => {
  if (!frame) {
    return (
      <div style={{ padding: "1em", fontSize: "1em", color: "#4f4f4f" }}>
        no frame
      </div>
    );
  }

  // TODO: Visualize the gradient too (multi inputs)
  const top = frame.params.energyGraph;
  const graph = traverseUnique(top);

  console.log("graph", graph);
  // TODO: Figure out how to get the graph to render nicely in the inspector w/o being offscreen and appearing only on pan
  // .focus("2"); // Not sure how to use the 'focus' function in this lib?
  // https://visjs.github.io/vis-network/docs/network/#methodCanvas

  const options = {
    layout: {
      hierarchical: true
    },
    edges: {
      color: "#000000"
    },
    height: "1000px"
    // height: "100%",
    // width: "100%",
    // autoResize: true
  };

  const events = {
    select: function(event) {
      var { nodes, edges } = event;
    }
  };

  return (
    <div>
      <h1>Computation graph of the energy (atomic ops only)</h1>
      <Graph
        graph={graph}
        options={options}
        events={events}
        getNetwork={network => {
          //  if you want access to vis.js network api you can set the state in a parent component using this property
        }}
      />
    </div>
  );
};
export default CompGraph;