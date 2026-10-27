import { LitElement, html, css, svg, nothing } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { indexStoreService } from "../services/index-store-service.js";

// Entity type, display colour mapping
const TYPE_COLORS = {
  Work: "#4CAF50",
  Expression: "#2196F3",
  Manifestation: "#FF9800",
  Person: "#E91E63",
  Place: "#9C27B0",
  Institution: "#00BCD4",
  Letter: "#795548",
  Event: "#FF5722",
  Venue: "#607D8B",
  Instrumentation: "#8BC34A",
  Item: "#FFC107",
  PerformanceEvent: "#F44336",
  Bibliography: "#3F51B5",
  DataCollection: "#2dc7d8",
};

// Edge colour by relation direction
const EDGE_COLOR = {
  incoming: "#90a4ae",
  outgoing: "#64b5f6",
  both: "#81c784",
};

// Children shown when expanding a node before a "+N more" node is added
const MAX_CHILDREN = 8;

const SKOS_RELATED ="http://www.w3.org/2004/02/skos/core#related";
const SKOS_LABEL = "http://www.w3.org/2004/02/skos/core#prefLabel";
const MELOD_NS = "https://lod.academy/melod/vocab/ontology#";

class ADWLMGraphView extends LitElement {
  static properties = {
    ui_language: { type: String, attribute: "data-ui-language", reflect: true },
    entity_to_edit: { type: Object },
    entity_type_definitions: { type: Object },
    _related: { state: true },
    _loading: { state: true },
    _selectedType: { state: true },
    _viewMode: { state: true },
    _expanded: { state: true },
    _showAllChildren: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    :host([data-ui-language="de"]) [lang="en"] {
      display: none;
    }

    :host(:not([data-ui-language="de"])) [lang="de"] {
      display: none;
    }

    .graph-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }

    /* Relative container so zoom-controls can sit on top of the SVG */
    .svg-container {
      position: relative;
      width: 100%;
    }

    .svg-container > svg {
      display: block;
      width: 100%;
      height: 60vh;
      min-height: 400px;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: 6px;
      background: #fafafa;
    }

    svg.dragging { cursor: grabbing; }

    .zoom-controls {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      z-index: 10;
    }

    .zoom-btn {
      width: 2rem;
      height: 2rem;
      border: 1px solid var(--sl-color-neutral-300);
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--sl-color-neutral-700);
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .zoom-btn:hover { background: var(--sl-color-neutral-100); }

    .empty-state {
      text-align: center;
      color: var(--sl-color-neutral-500);
      padding: 3rem 1rem;
      font-size: 0.9rem;
    }

    .node-group {
      cursor: pointer;
    }

    .node-group circle {
      transition: filter 0.15s ease;
    }

    .node-group:hover > circle {
      filter: brightness(1.18) drop-shadow(0 0 6px rgba(0, 0, 0, 0.35));
    }

    .node-group,
    .edge {
      transition: opacity 0.2s ease;
    }

    /* Ring nodes/edges not in focus while another node is expanded */
    .node-group.dimmed,
    .edge.dimmed {
      opacity: 0.35;
    }

    .node-group.not-expandable {
      cursor: default;
    }

    .badge {
      cursor: pointer;
    }

    .badge:hover circle:first-of-type {
      fill: var(--sl-color-neutral-100);
      filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.35));
    }

    .legend-hint {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
      color: var(--sl-color-neutral-500);
    }

    .legend-icon {
      width: 18px;
      height: 12px;
      flex-shrink: 0;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem 1.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--sl-color-neutral-200);
      font-size: 0.82rem;
      width: 100%;
      box-sizing: border-box;
    }

    .legend-section {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.9rem;
      align-items: center;
    }

    .legend-title {
      font-weight: 600;
      color: var(--sl-color-neutral-600);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .legend-swatch {
      width: 13px;
      height: 13px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .legend-filter {
      background: none;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 0.15rem 0.6rem;
      font: inherit;
      color: inherit;
      cursor: pointer;
      transition: opacity 0.15s ease, background 0.15s ease;
    }

    .legend-filter:hover {
      background: var(--sl-color-neutral-100);
    }

    .legend-filter:focus-visible {
      outline: 2px solid var(--sl-color-primary-600);
      outline-offset: 1px;
    }

    .legend-filter.active {
      border-color: var(--sl-color-primary-600);
      background: var(--sl-color-primary-50);
      font-weight: 600;
    }

    .legend-section.filtering .legend-filter:not(.active) {
      opacity: 0.55;
    }

    .legend-count {
      color: var(--sl-color-neutral-500);
      font-weight: normal;
    }

    .legend-edge-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* View toggle (graph / list), mirrors .zoom-controls on the left side */
    .view-controls {
      position: absolute;
      top: 0.5rem;
      left: 0.5rem;
      z-index: 10;
    }

    .list-view {
      height: 60vh;
      min-height: 400px;
      overflow-y: auto;
      box-sizing: border-box;
      padding: 3rem 1rem 1rem;
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: 6px;
      background: #fafafa;
      font-size: 0.9rem;
    }

    .list-group + .list-group {
      margin-top: 1.25rem;
    }

    .list-group-title {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0 0 0.4rem;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--sl-color-neutral-700);
    }

    .list-group ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .list-entry {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
      width: 100%;
      padding: 0.35rem 0.5rem;
      background: none;
      border: none;
      border-radius: 4px;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    .list-entry:hover {
      background: var(--sl-color-neutral-100);
    }

    .list-entry:focus-visible {
      outline: 2px solid var(--sl-color-primary-600);
      outline-offset: 1px;
    }

    .list-direction {
      flex-shrink: 0;
      width: 1.2em;
      text-align: center;
      font-weight: bold;
    }

    .list-label {
      font-weight: 500;
    }

    .list-iri {
      font-size: 0.78rem;
      color: var(--sl-color-neutral-500);
      word-break: break-all;
    }
  `;

  constructor() {
    super();
    this.ui_language = document.documentElement.lang || "en";
    this._related = [];
    this._loading = false;
    // Type URI of the related entities shown in the graph; null = all types
    this._selectedType = null;
    // "graph" (SVG) or "list"; kept when switching entities
    this._viewMode = "graph";
    // IRI of the related node whose own related entities are expanded; null = none
    this._expanded = null;
    // Show all children of the expanded node instead of the first MAX_CHILDREN
    this._showAllChildren = false;
    // Non-reactive cache: entity IRI -> related nodes (cleared on entity / index change)
    this._relatedCache = new Map();
    // Non-reactive pan/zoom state – mutated directly to avoid re-renders on every event
    this._transform = { scale: 1, tx: 0, ty: 0 };
    this._drag = null;
    // Set after a pan gesture so the trailing click doesn't expand/preview a node
    this._suppressClick = false;
    // Set when a node was expanded; _renderSvg then zooms onto it
    this._focusExpandedPending = false;

    document.addEventListener("adwlm-index-store:loaded", () => {
      this._relatedCache.clear();
      if (this.entity_to_edit) this._queryRelated();
    });

    // document.addEventListener("adwlm-entity-search:reload-indexes", () => {
    //   indexStoreService.reloadIndexes();
    // });
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has("entity_to_edit")) {
      this._selectedType = null;
      this._expanded = null;
      this._showAllChildren = false;
      this._relatedCache.clear();
      if (this.entity_to_edit && indexStoreService._loaded) {
        this._transform = { scale: 1, tx: 0, ty: 0 };
        this._queryRelated();
      } else {
        this._related = [];
      }
    }
    // Re-apply current transform after every Lit render
    // (the zoom-layer <g> is recreated on each re-render)
    this._applyTransform();
  }

  _applyTransform() {
    const g = this.renderRoot?.querySelector("#gv-zoom-layer");
    if (!g) return;
    const { scale, tx, ty } = this._transform;
    g.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const svgEl = e.currentTarget;
    const rect  = svgEl.getBoundingClientRect();
    const vb    = svgEl.viewBox.baseVal;
    // Cursor in viewBox coordinates
    const mx = (e.clientX - rect.left)  * (vb.width  / rect.width);
    const my = (e.clientY - rect.top)   * (vb.height / rect.height);
    const { scale, tx, ty } = this._transform;
    this._transform = {
      scale: scale * factor,
      tx: mx - (mx - tx) * factor,
      ty: my - (my - ty) * factor,
    };
    this._applyTransform();
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    this._suppressClick = false;
    this._drag = {
      startX: e.clientX, startY: e.clientY,
      startTx: this._transform.tx, startTy: this._transform.ty,
      moved: false,
    };
    e.currentTarget.classList.add("dragging");
  }

  _onMouseMove(e) {
    if (!this._drag) return;
    if (Math.hypot(e.clientX - this._drag.startX, e.clientY - this._drag.startY) > 4) {
      this._drag.moved = true;
    }
    const svgEl = this.renderRoot?.querySelector(".svg-container > svg");
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const vb   = svgEl.viewBox.baseVal;
    const sx   = vb.width  / rect.width;
    const sy   = vb.height / rect.height;
    this._transform.tx = this._drag.startTx + (e.clientX - this._drag.startX) * sx;
    this._transform.ty = this._drag.startTy + (e.clientY - this._drag.startY) * sy;
    this._applyTransform();
  }

  _onMouseUp() {
    if (!this._drag) return;
    this._suppressClick = this._drag.moved;
    this._drag = null;
    this.renderRoot?.querySelector(".svg-container > svg")?.classList.remove("dragging");
  }

  // Wraps node/badge click handlers: ignores the click that ends a pan gesture
  _nodeClick(handler) {
    return (e) => {
      e.stopPropagation();
      if (this._suppressClick) {
        this._suppressClick = false;
        return;
      }
      handler();
    };
  }

  _zoomBy(factor) {
    const svgEl = this.renderRoot?.querySelector(".svg-container > svg");
    if (!svgEl) return;
    const vb = svgEl.viewBox.baseVal;
    // Zoom around the centre of the visible SVG area
    const mx = vb.width  / 2;
    const my = vb.height / 2;
    const { scale, tx, ty } = this._transform;
    this._transform = {
      scale: scale * factor,
      tx: mx - (mx - tx) * factor,
      ty: my - (my - ty) * factor,
    };
    this._applyTransform();
  }

  _resetZoom() {
    this._transform = { scale: 1, tx: 0, ty: 0 };
    this._applyTransform();
  }

  _selectType(type) {
    // Clicking the active type again clears the filter
    this._selectedType = type && type !== this._selectedType ? type : null;
    // Collapse the expanded node if the new filter hides it
    const expandedNode = this._related.find((n) => n.subject === this._expanded);
    if (expandedNode && this._selectedType && expandedNode.type !== this._selectedType) {
      this._expanded = null;
      this._showAllChildren = false;
    }
    this._transform = { scale: 1, tx: 0, ty: 0 };
    // Start the (shorter) list from the top after switching type
    this.updateComplete.then(() => {
      this.renderRoot?.querySelector(".list-view")?.scrollTo(0, 0);
    });
  }

  async _queryRelated() {
    if (!this.entity_to_edit?.entity_iri) {
      this._related = [];
      return;
    }

    this._loading = true;
    this._related = this._fetchRelated(this.entity_to_edit.entity_iri);
    // Keep the expanded node only if it is still related after a reload
    if (!this._related.some((n) => n.subject === this._expanded)) {
      this._expanded = null;
      this._showAllChildren = false;
    }
    this._loading = false;
  }

  // Related entities (incoming + outgoing skos:related) of any entity, cached per IRI
  _fetchRelated(subject) {
    if (this._relatedCache.has(subject)) return this._relatedCache.get(subject);

    const incomingQuery = `
      SELECT ?related ?label ?type WHERE {
        ?related <${SKOS_RELATED}> <${subject}> .
        OPTIONAL { ?related <${SKOS_LABEL}> ?label . }
        OPTIONAL {
          ?related a ?type .
          FILTER(STRSTARTS(STR(?type), "${MELOD_NS}"))
        }
      }
    `;

    const outgoingQuery = `
      SELECT ?related ?label ?type WHERE {
        <${subject}> <${SKOS_RELATED}> ?related .
        OPTIONAL { ?related <${SKOS_LABEL}> ?label . }
        OPTIONAL {
          ?related a ?type .
          FILTER(STRSTARTS(STR(?type), "${MELOD_NS}"))
        }
      }
    `;

    try {
      const nodeMap = new Map();

      for (const binding of indexStoreService.store.query(incomingQuery)) {
        const subj = binding.get("related").value;
        nodeMap.set(subj, {
          subject: subj,
          label: binding.get("label")?.value || subj.split("/").pop(),
          type: binding.get("type")?.value || "",
          direction: "incoming",
        });
      }

      for (const binding of indexStoreService.store.query(outgoingQuery)) {
        const subj = binding.get("related").value;
        if (nodeMap.has(subj)) {
          nodeMap.get(subj).direction = "both";
        } else {
          nodeMap.set(subj, {
            subject: subj,
            label: binding.get("label")?.value || subj.split("/").pop(),
            type: binding.get("type")?.value || "",
            direction: "outgoing",
          });
        }
      }

      const nodes = [...nodeMap.values()];
      this._relatedCache.set(subject, nodes);
      return nodes;
    } catch (err) {
      console.error("[GraphView] Query-Fehler:", err);
      return [];
    }
  }

  _toggleExpand(node) {
    this._expanded = this._expanded === node.subject ? null : node.subject;
    this._showAllChildren = false;
    if (this._expanded) {
      // Zoom onto the expanded node once the new layout is known (see _renderSvg)
      this._focusExpandedPending = true;
    } else {
      // Collapsed: back to the fitted overview
      this._transform = { scale: 1, tx: 0, ty: 0 };
    }
  }

  _showMoreChildren() {
    this._showAllChildren = true;
    this._focusExpandedPending = true;
  }

  // Zoom/pan so the expanded node appears as large as the center node does in the
  // default (unexpanded) view, centred on the expanded node and its children
  _focusExpanded(expandedPos, fan, { W, W0, R_NODE, R_CENTER, R_CHILD }) {
    let minX = expandedPos.x - R_NODE, maxX = expandedPos.x + R_NODE;
    let minY = expandedPos.y - R_NODE, maxY = expandedPos.y + R_NODE;
    for (const f of fan) {
      minX = Math.min(minX, f.x - R_CHILD);
      maxX = Math.max(maxX, f.x + R_CHILD);
      minY = Math.min(minY, f.y - R_CHILD);
      maxY = Math.max(maxY, f.y + R_CHILD);
    }
    const mx = (minX + maxX) / 2;
    const my = (minY + maxY) / 2;
    // Center node on screen: R_CENTER / W0 of the viewBox; expanded node: R_NODE * scale / W
    const scale = (R_CENTER / R_NODE) * (W / W0);
    this._transform = {
      scale,
      tx: W / 2 - scale * mx,
      ty: W / 2 - scale * my,
    };
  }

  // Directed edge from point a to point b; direction is seen from a
  // ("outgoing" = a → b, "incoming" = b → a, "both" = a ↔ b)
  _renderEdge(a, b, direction, sw, { dimmed = false, dashed = false } = {}) {
    const color = EDGE_COLOR[direction] ?? EDGE_COLOR.incoming;
    const cls = `edge ${dimmed ? "dimmed" : ""}`;
    const dash = dashed ? `${sw * 4} ${sw * 3}` : "none";

    if (direction === "both") {
      return svg`<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
        stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash}"
        marker-end="url(#arrow-both-end)"
        marker-start="url(#arrow-both-start)" />`;
    } else if (direction === "outgoing") {
      return svg`<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
        stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash}"
        marker-end="url(#arrow-out)" />`;
    }
    return svg`<line class="${cls}" x1="${b.x}" y1="${b.y}" x2="${a.x}" y2="${a.y}"
      stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash}"
      marker-end="url(#arrow-in)" />`;
  }

  // Small eye icon centered at (x, y) with "radius" r
  _renderEyeIcon(x, y, r) {
    return svg`
      <ellipse cx="${x}" cy="${y}" rx="${r * 0.62}" ry="${r * 0.38}"
               fill="none" stroke="#455a64" stroke-width="${Math.max(1.2, r * 0.11)}" />
      <circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="#455a64" />
    `;
  }

  // Badge on a ring node that opens the side-panel preview
  _renderEyeBadge(x, y, r, node) {
    const label = this.ui_language === "de" ? "Vorschau" : "Preview";
    return svg`
      <g class="badge" role="button" aria-label="${label} ${node.label}"
         @click="${this._nodeClick(() => this._onNodeClick(node))}">
        <title>${label}</title>
        <circle cx="${x}" cy="${y}" r="${r}" fill="white"
                stroke="#90a4ae" stroke-width="1.5" />
        ${this._renderEyeIcon(x, y, r)}
      </g>
    `;
  }

  // Splits the related entities of a ring node into new children and links to
  // entities that are already visible (center or ring)
  _getChildren(node, visibleIris) {
    const centerIri = this.entity_to_edit.entity_iri;
    const newChildren = [];
    const crossLinks = [];
    for (const child of this._fetchRelated(node.subject)) {
      if (child.subject === centerIri || child.subject === node.subject) continue;
      if (visibleIris.has(child.subject)) crossLinks.push(child);
      else newChildren.push(child);
    }
    newChildren.sort((a, b) =>
      this._getTypeName(a.type).localeCompare(this._getTypeName(b.type))
      || a.label.localeCompare(b.label)
    );
    return { newChildren, crossLinks };
  }

  _getTypeName(typeUri) {
    if (!typeUri) return "";
    if (this.entity_type_definitions) {
      const def = this.entity_type_definitions.find((d) => d.type === typeUri);
      if (def) return def.name;
    }
    // Fallback: strip namespace + "Entity" suffix
    return typeUri.split("#").pop()?.replace(/Entity$/, "") || "";
  }

  _getTypeColor(typeUri) {
    return TYPE_COLORS[this._getTypeName(typeUri)] || "#78909C";
  }

  _onNodeClick(node) {
    const relativePath = node.subject.replace(/^urn:uuid:/, "");
    if (!relativePath) return;
    document.dispatchEvent(
      new CustomEvent("adwlm-graph-view:preview-entity", {
        detail: { relativePath },
        bubbles: true,
      })
    );
  }

  _truncate(str, max = 24) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  // Unique entity types of all related nodes for the legend (with counts)
  _getLegendTypes() {
    const legendTypes = [];
    for (const n of this._related) {
      if (!n.type) continue;
      const entry = legendTypes.find((x) => x.type === n.type);
      if (entry) entry.count++;
      else legendTypes.push({ type: n.type, name: this._getTypeName(n.type), count: 1 });
    }
    return legendTypes;
  }

  // Selected type, falling back to all types (null) if it no longer exists
  _getSelectedType(legendTypes) {
    return legendTypes.some((t) => t.type === this._selectedType)
      ? this._selectedType
      : null;
  }

  // Related nodes filtered by the type selected in the legend
  _getFilteredNodes(selectedType) {
    return selectedType
      ? this._related.filter((n) => n.type === selectedType)
      : this._related;
  }

  _renderSvg() {
    const legendTypes = this._getLegendTypes();
    const selectedType = this._getSelectedType(legendTypes);
    const nodes = this._getFilteredNodes(selectedType);
    const N = nodes.length;

    const R_NODE = 60;
    const R_CENTER = 90;

    // Minimum orbit: always leave at least 80 units between node edges for arrows
    const ORBIT_GAP = 80;
    const ORBIT_MIN_FOR_GAP = R_CENTER + R_NODE + ORBIT_GAP;
    // Also ensure outer nodes don't overlap each other (circumference / N > 2 * R_NODE * 1.2)
    const ORBIT_MIN_FOR_SPREAD = N > 1
      ? Math.ceil((R_NODE * 2.4 * N) / (2 * Math.PI)) + R_NODE
      : 0;
    const ORBIT = Math.max(ORBIT_MIN_FOR_GAP, ORBIT_MIN_FOR_SPREAD);

    // Font sizes scale with node radii so they stay readable at any node size
    const FS_CENTER_TYPE  = Math.round(R_CENTER * 0.21);
    const FS_CENTER_LABEL = Math.round(R_CENTER * 0.21);
    const FS_NODE_TYPE    = Math.round(R_NODE * 0.3);
    const FS_NODE_LABEL   = Math.round(R_NODE * 0.4);

    // Compact padding – just enough for the label offset; users zoom in for full labels
    const LABEL_PAD = R_NODE + Math.round(FS_NODE_LABEL * 1.1);

    // Ring positions (unit vectors relative to the center, center added below)
    const ring = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / N - Math.PI / 2;
      return { node, angle, ux: Math.cos(angle), uy: Math.sin(angle) };
    });

    // Children of every ring node (needed for the "+k" badges), split into new
    // entities and links to entities that are already visible
    const visibleIris = new Set(nodes.map((n) => n.subject));
    for (const p of ring) {
      p.children = this._getChildren(p.node, visibleIris);
      p.expandable = p.children.newChildren.length + p.children.crossLinks.length > 0;
    }
    const expandedPos = ring.find((p) => p.node.subject === this._expanded && p.expandable);

    // Fan of children around the expanded node, pointing away from the center
    const R_CHILD = Math.round(R_NODE * 0.6);
    const FS_CHILD_TYPE  = Math.round(R_CHILD * 0.3);
    const FS_CHILD_LABEL = Math.round(R_CHILD * 0.45);
    // Fan spans at most ±60° around the radial direction; together with the minimum
    // R2 below this keeps children radially clear of neighbouring ring nodes
    const MAX_SPAN = (120 * Math.PI) / 180;
    let fan = [];
    let R2 = 0;
    if (expandedPos) {
      const { newChildren } = expandedPos.children;
      const shown = this._showAllChildren ? newChildren : newChildren.slice(0, MAX_CHILDREN);
      const rest = newChildren.length - shown.length;
      const items = rest > 0 ? [...shown, { more: rest }] : shown;
      const k = items.length;
      // Radius large enough that neighbouring children (incl. labels) don't overlap
      const CHILD_SPACING = R_CHILD * 3;
      R2 = Math.max(R_NODE + R_CHILD + 110,k > 1 ? (CHILD_SPACING * (k - 1)) / MAX_SPAN : 0);
      const step = k > 1 ? Math.min(MAX_SPAN / (k - 1), CHILD_SPACING / R2) : 0;
      fan = items.map((item, j) => {
        const phi = expandedPos.angle + (j - (k - 1) / 2) * step;
        return { item, ux: Math.cos(phi), uy: Math.sin(phi) };
      });
    }

    // The viewBox grows with the fan so the whole graph stays fitted
    const half = ORBIT + (expandedPos ? R2 + R_CHILD : R_NODE) + LABEL_PAD;
    const W = half * 2;
    const H = W;
    const cx = W / 2;
    const cy = H / 2;

    for (const p of ring) {
      p.x = cx + ORBIT * p.ux;
      p.y = cy + ORBIT * p.uy;
    }
    for (const f of fan) {
      f.x = expandedPos.x + R2 * f.ux;
      f.y = expandedPos.y + R2 * f.uy;
    }

    // Apply the focus zoom requested by _toggleExpand/_showMoreChildren; the
    // transform is applied to the zoom layer in updated()
    if (this._focusExpandedPending) {
      this._focusExpandedPending = false;
      if (expandedPos) {
        // viewBox size of the default view, where the center node has its reference size
        const W0 = (ORBIT + R_NODE + LABEL_PAD) * 2;
        this._focusExpanded(expandedPos, fan, { W, W0, R_NODE, R_CENTER, R_CHILD });
      } else {
        this._transform = { scale: 1, tx: 0, ty: 0 };
      }
    }

    // Ring nodes that stay highlighted while a node is expanded:
    // the expanded node itself and ring nodes it links to
    const crossLinkIris = new Set(
      expandedPos ? expandedPos.children.crossLinks.map((c) => c.subject) : []
    );
    const isDimmed = (p) =>
      !!expandedPos && p !== expandedPos && !crossLinkIris.has(p.node.subject);

    const de = this.ui_language === "de";
    const BADGE_R = Math.round(R_NODE * 0.24);
    const BADGE_OFF = R_NODE * Math.SQRT1_2;

    const currentLabel = this.entity_to_edit.entity_iri
      .split("/")[1];
    const currentType = this.entity_to_edit.entity_type;
    const currentColor = this._getTypeColor(currentType);
    const currentTypeName = this._getTypeName(currentType);

    const colorOut = EDGE_COLOR.outgoing;
    const colorIn = EDGE_COLOR.incoming;
    const colorBoth = EDGE_COLOR.both;

    // Arrow marker size proportional to node radius
    const markerSz = Math.round(R_NODE * 0.12);

    return html`
      <div class="svg-container">
        ${this._renderViewToggle()}
        <div class="zoom-controls">
          <button class="zoom-btn" title="Zoom in"  @click="${() => this._zoomBy(1.2)}">+</button>
          <button class="zoom-btn" title="Reset"    @click="${() => this._resetZoom()}">⟳</button>
          <button class="zoom-btn" title="Zoom out" @click="${() => this._zoomBy(1 / 1.2)}">−</button>
        </div>
        <svg
          viewBox="0 0 ${W} ${H}"
          xmlns="http://www.w3.org/2000/svg"
          @wheel="${this._onWheel}"
          @mousedown="${this._onMouseDown}"
          @mousemove="${this._onMouseMove}"
          @mouseup="${this._onMouseUp}"
          @mouseleave="${this._onMouseUp}"
        >
        <defs>
          <filter id="gv-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3"
                          flood-color="rgba(0,0,0,0.2)" />
          </filter>
          <!-- All zoomable/pannable content -->
          <!-- (the <g> transform is set imperatively via _applyTransform) -->
          <!-- Outgoing: center → node -->
          <marker id="arrow-out" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="${markerSz}" markerHeight="${markerSz}" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="${colorOut}" />
          </marker>
          <!-- Incoming: node → center -->
          <marker id="arrow-in" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="${markerSz}" markerHeight="${markerSz}" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="${colorIn}" />
          </marker>
          <!-- Both directions: arrowhead at end -->
          <marker id="arrow-both-end" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="${markerSz}" markerHeight="${markerSz}" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="${colorBoth}" />
          </marker>
          <!-- Both directions: arrowhead at start (reversed) -->
          <marker id="arrow-both-start" viewBox="0 0 10 10" refX="2" refY="5"
                  markerWidth="${markerSz}" markerHeight="${markerSz}" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="${colorBoth}" />
          </marker>
        </defs>

          <g id="gv-zoom-layer">
        <!-- Directed edges: center → ring -->
        ${ring.map((p) => this._renderEdge(
          { x: cx + R_CENTER * p.ux, y: cy + R_CENTER * p.uy },
          { x: p.x - R_NODE * p.ux, y: p.y - R_NODE * p.uy },
          p.node.direction,
          Math.round(R_NODE * 0.04),
          { dimmed: isDimmed(p) }
        ))}

        <!-- Directed edges: expanded node → children -->
        ${fan.filter((f) => !f.item.more).map((f) => this._renderEdge(
          { x: expandedPos.x + R_NODE * f.ux, y: expandedPos.y + R_NODE * f.uy },
          { x: f.x - R_CHILD * f.ux, y: f.y - R_CHILD * f.uy },
          f.item.direction,
          Math.max(1, Math.round(R_NODE * 0.03))
        ))}

        <!-- Dashed cross links: expanded node → entities already in the ring -->
        ${expandedPos ? expandedPos.children.crossLinks.map((c) => {
          const target = ring.find((p) => p.node.subject === c.subject);
          if (!target) return null;
          const dx = target.x - expandedPos.x;
          const dy = target.y - expandedPos.y;
          const len = Math.hypot(dx, dy) || 1;
          return this._renderEdge(
            { x: expandedPos.x + (R_NODE * dx) / len, y: expandedPos.y + (R_NODE * dy) / len },
            { x: target.x - (R_NODE * dx) / len, y: target.y - (R_NODE * dy) / len },
            c.direction,
            Math.max(1, Math.round(R_NODE * 0.03)),
            { dashed: true }
          );
        }) : null}

        <!-- Center node (current entity) -->
        <g>
          <title>${this.entity_to_edit.entity_iri}${currentTypeName ? ` (${this._getTypeName(currentTypeName)})` : ''}</title>
          <circle cx="${cx}" cy="${cy}" r="${R_CENTER}"
                  fill="${currentColor}" filter="url(#gv-shadow)" />
          <text x="${cx}" y="${cy - FS_CENTER_TYPE * 0.3}" text-anchor="middle" fill="white"
                font-size="${FS_CENTER_TYPE}" font-weight="bold" font-family="sans-serif">
            ${this._truncate(currentTypeName, 12)}
          </text>
          <text x="${cx}" y="${cy + FS_CENTER_LABEL * 1.2}" text-anchor="middle"
                fill="rgba(255,255,255,0.92)" font-size="${FS_CENTER_LABEL}" font-family="sans-serif">
            ${this._truncate(currentLabel, 20)}
          </text>
        </g>

        <!-- Related nodes (ring) -->
        ${ring.map((p) => {
          const { node, ux, uy, x: nx, y: ny } = p;
          const color = this._getTypeColor(node.type);
          const typeName = this._getTypeName(node.type);
          const isExpanded = p === expandedPos;
          const { newChildren, crossLinks } = p.children;

          // Label placed outside the node along the radial direction
          const labelDist = R_NODE + FS_NODE_LABEL * 1.1;
          const lx = nx + ux * labelDist;
          const ly = ny + uy * labelDist;
          const anchor = ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle";

          const expandTitle = de
            ? `${newChildren.length} weitere, ${crossLinks.length} bereits angezeigte Verknüpfungen`
            : `${newChildren.length} more, ${crossLinks.length} already shown relations`;
          const ariaLabel = isExpanded
            ? (de ? `${node.label} einklappen` : `Collapse ${node.label}`)
            : (de ? `${node.label} ausklappen` : `Expand ${node.label}`);

          return svg`
            <g class="node-group ${p.expandable ? "" : "not-expandable"} ${isDimmed(p) ? "dimmed" : ""}"
               @click="${p.expandable ? this._nodeClick(() => this._toggleExpand(node)) : null}"
               role="${p.expandable ? "button" : "img"}"
               aria-label="${p.expandable ? ariaLabel : node.label}"
               aria-expanded="${p.expandable ? String(isExpanded) : nothing}">
              <title>${node.label}${node.type ? ` (${typeName})` : ''}${p.expandable ? ` – ${expandTitle}` : ''}</title>
              <circle cx="${nx}" cy="${ny}" r="${R_NODE}"
                      fill="${color}" filter="url(#gv-shadow)" opacity="0.93"
                      stroke="${isExpanded ? "#263238" : "none"}" stroke-width="4" />
              <!-- Type name inside node -->
              <text x="${nx}" y="${ny + FS_NODE_TYPE * 0.35}" text-anchor="middle" fill="white"
                    font-size="${FS_NODE_TYPE}" font-weight="bold" font-family="sans-serif">
                ${this._truncate(typeName, 10)}
              </text>
              <!-- Entity label outside the node circle -->
              <text x="${lx}" y="${ly}" text-anchor="${anchor}"
                    fill="#263238" font-size="${FS_NODE_LABEL}" font-family="sans-serif"
                    font-weight="500">
                <title>${node.label}</title>
                ${this._truncate(node.label, 26)}
              </text>

              <!-- Preview badge (top right) -->
              ${this._renderEyeBadge(nx + BADGE_OFF, ny - BADGE_OFF, BADGE_R, node)}

              <!-- Expand badge (bottom right): number of further relations / collapse -->
              ${p.expandable ? svg`
                <g class="badge-count">
                  <circle cx="${nx + BADGE_OFF}" cy="${ny + BADGE_OFF}" r="${BADGE_R}"
                          fill="white" stroke="${color}" stroke-width="2.5" />
                  <text x="${nx + BADGE_OFF}" y="${ny + BADGE_OFF + BADGE_R * 0.36}"
                        text-anchor="middle" fill="#263238" font-family="sans-serif"
                        font-size="${Math.round(BADGE_R * (isExpanded ? 1.3 : 0.95))}"
                        font-weight="bold">
                    ${isExpanded ? "−" : `+${newChildren.length + crossLinks.length}`}
                  </text>
                </g>
              ` : null}
            </g>
          `;
        })}

        <!-- Children of the expanded node -->
        ${fan.map((f) => {
          const { item, ux, uy, x: fx, y: fy } = f;
          const labelDist = R_CHILD + FS_CHILD_LABEL * 1.1;
          const lx = fx + ux * labelDist;
          const ly = fy + uy * labelDist;
          const anchor = ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle";

          if (item.more) {
            const moreLabel = de ? `${item.more} weitere anzeigen` : `Show ${item.more} more`;
            return svg`
              <g class="node-group"
                 @click="${this._nodeClick(() => this._showMoreChildren())}"
                 role="button" aria-label="${moreLabel}">
                <title>${moreLabel}</title>
                <circle cx="${fx}" cy="${fy}" r="${R_CHILD}" fill="#B0BEC5"
                        filter="url(#gv-shadow)" />
                <text x="${fx}" y="${fy + FS_CHILD_LABEL * 0.35}" text-anchor="middle" fill="white"
                      font-size="${FS_CHILD_LABEL}" font-weight="bold" font-family="sans-serif">
                  +${item.more}
                </text>
              </g>
            `;
          }

          const typeName = this._getTypeName(item.type);
          return svg`
            <g class="node-group leaf"
               @click="${this._nodeClick(() => this._onNodeClick(item))}"
               role="button"
               aria-label="${de ? "Vorschau" : "Preview"} ${item.label}">
              <title>${item.label}${item.type ? ` (${typeName})` : ''}</title>
              <circle cx="${fx}" cy="${fy}" r="${R_CHILD}"
                      fill="${this._getTypeColor(item.type)}" filter="url(#gv-shadow)" opacity="0.93" />
              <text x="${fx}" y="${fy + FS_CHILD_TYPE * 0.35}" text-anchor="middle" fill="white"
                    font-size="${FS_CHILD_TYPE}" font-weight="bold" font-family="sans-serif">
                ${this._truncate(typeName, 9)}
              </text>
              <text x="${lx}" y="${ly}" text-anchor="${anchor}"
                    fill="#263238" font-size="${FS_CHILD_LABEL}" font-family="sans-serif"
                    font-weight="500">
                ${this._truncate(item.label, 26)}
              </text>
            </g>
          `;
        })}
          </g><!-- #gv-zoom-layer -->
        </svg>
      </div><!-- .svg-container -->

      <!-- Legend (outside the zoomable area) -->
      ${this._renderLegend(legendTypes, selectedType)}
    `;
  }

  _renderLegend(legendTypes, selectedType) {
    const currentType = this.entity_to_edit.entity_type;
    const currentColor = this._getTypeColor(currentType);
    const currentTypeName = this._getTypeName(currentType);

    return html`
      <div class="legend">
        <div class="legend-section">
          <span class="legend-title">
            <span lang="en">Current:</span>
            <span lang="de">Aktuell:</span>
          </span>
          ${currentTypeName ? html`
            <span class="legend-item">
              <span class="legend-swatch"
                    style="background:${currentColor}"></span>
              ${currentTypeName}
            </span>
          ` : html`<span class="legend-item">
              <span lang="en">No type</span>
              <span lang="de">Kein Typ</span>
            </span>`}
        </div>
        <div class="legend-section ${selectedType ? "filtering" : ""}">
          <span class="legend-title">
            <span lang="en">Related:</span>
            <span lang="de">Verknüpft:</span>
          </span>
          <button type="button"
                  class="legend-item legend-filter ${selectedType ? "" : "active"}"
                  aria-pressed="${!selectedType}"
                  @click="${() => this._selectType(null)}">
            <span lang="en">All</span>
            <span lang="de">Alle</span>
            <span class="legend-count">(${this._related.length})</span>
          </button>
          ${legendTypes.map(({ type, name, count }) => {
            const active = type === selectedType;
            return html`
              <button type="button"
                      class="legend-item legend-filter ${active ? "active" : ""}"
                      aria-pressed="${active}"
                      @click="${() => this._selectType(type)}">
                <span class="legend-swatch"
                      style="background:${this._getTypeColor(type)}"></span>
                ${name}
                <span class="legend-count">(${count})</span>
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.entity_to_edit) {
      return html`<div class="empty-state">
        <span lang="en">No selected entity</span>
        <span lang="de">Keine Entität ausgewählt</span>
      </div>`;
    }
    if (this._loading) {
      return html`<div class="empty-state">
        <span lang="en">Loading graph...</span>
        <span lang="de">Graph wird geladen...</span>
      </div>`;
    }
    if (this._related.length === 0) {
      return html`<div class="empty-state">
        <span lang="en">No related entities found.</span>
        <span lang="de">Keine verknüpften Entitäten gefunden.</span>
      </div>`;
    }
    if (this._viewMode === "list") {
      const legendTypes = this._getLegendTypes();
      const selectedType = this._getSelectedType(legendTypes);
      return html`<div class="graph-wrapper">
        <div class="svg-container">
          ${this._renderViewToggle()}
          ${this._renderList(this._getFilteredNodes(selectedType))}
        </div>
        ${this._renderLegend(legendTypes, selectedType)}
      </div>`;
    }
    return html`<div class="graph-wrapper">${this._renderSvg()}</div>`;
  }

  _toggleViewMode() {
    this._viewMode = this._viewMode === "graph" ? "list" : "graph";
  }

  _renderViewToggle() {
    const de = this.ui_language === "de";
    const isGraph = this._viewMode === "graph";
    const label = isGraph
      ? (de ? "Listenansicht" : "List view")
      : (de ? "Graphansicht" : "Graph view");
    return html`
      <div class="view-controls">
        <button type="button" class="zoom-btn" title="${label}" aria-label="${label}"
                @click="${() => this._toggleViewMode()}">
          <sl-icon name="${isGraph ? "list-ul" : "diagram-3"}"></sl-icon>
        </button>
      </div>
    `;
  }

  _renderList(nodesToShow) {
    const de = this.ui_language === "de";
    const DIRECTION = {
      outgoing: { arrow: "→", title: de ? "Ausgehend" : "Outgoing" },
      incoming: { arrow: "←", title: de ? "Eingehend" : "Incoming" },
      both: { arrow: "↔", title: de ? "Beidseitig" : "Both directions" },
    };

    // Group related entities by type; untyped entities go into a last group
    const groups = new Map();
    for (const node of nodesToShow) {
      if (!groups.has(node.type)) groups.set(node.type, []);
      groups.get(node.type).push(node);
    }
    const sortedGroups = [...groups.entries()]
      .map(([type, nodes]) => ({
        type,
        name: this._getTypeName(type),
        nodes: nodes.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => {
        if (!a.type) return 1;
        if (!b.type) return -1;
        return a.name.localeCompare(b.name);
      });

    return html`
      <div class="list-view">
        ${sortedGroups.map(({ type, name, nodes }) => html`
          <section class="list-group">
            <h4 class="list-group-title">
              <span class="legend-swatch" style="background:${this._getTypeColor(type)}"></span>
              ${type ? name : html`
                <span lang="en">No type</span>
                <span lang="de">Ohne Typ</span>
              `}
              <span class="legend-count">(${nodes.length})</span>
            </h4>
            <ul>
              ${nodes.map((node) => {
                const dir = DIRECTION[node.direction] ?? DIRECTION.incoming;
                return html`
                  <li>
                    <button type="button" class="list-entry"
                            @click="${() => this._onNodeClick(node)}">
                      <span class="list-direction" title="${dir.title}"
                            style="color:${EDGE_COLOR[node.direction] ?? EDGE_COLOR.incoming}">
                        ${dir.arrow}
                      </span>
                      <span>
                        <span class="list-label">${node.label}</span><br />
                        <span class="list-iri">${node.subject}</span>
                      </span>
                    </button>
                  </li>
                `;
              })}
            </ul>
          </section>
        `)}
      </div>
    `;
  }
}

customElements.define("adwlm-graph-view", ADWLMGraphView);
