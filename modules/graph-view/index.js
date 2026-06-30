import { LitElement, html, css, svg } from "https://cdn.jsdelivr.net/npm/lit/+esm";
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
};

// Edge colour by relation direction
const EDGE_COLOR = {
  incoming: "#90a4ae",
  outgoing: "#64b5f6",
  both: "#81c784",
};

const SKOS_RELATED = "http://www.w3.org/2004/02/skos/core#related";
const SKOS_LABEL = "http://www.w3.org/2004/02/skos/core#prefLabel";
const MELOD_NS = "https://lod.academy/melod/vocab/ontology#";

class ADWLMGraphView extends LitElement {
  static properties = {
    entity_to_edit: { type: Object },
    entity_type_definitions: { type: Object },
    _related: { state: true },
    _loading: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      width: 100%;
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

    svg {
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

    .node-group:hover circle {
      filter: brightness(1.18) drop-shadow(0 0 6px rgba(0, 0, 0, 0.35));
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

    .legend-edge-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `;

  constructor() {
    super();
    this._related = [];
    this._loading = false;
    // Non-reactive pan/zoom state – mutated directly to avoid re-renders on every event
    this._transform = { scale: 1, tx: 0, ty: 0 };
    this._drag = null;

    document.addEventListener("adwlm-index-store:loaded", () => {
      if (this.entity_to_edit) this._queryRelated();
    });

    document.addEventListener("adwlm-entity-search:reload-indexes", () => {
      indexStoreService.reloadIndexes();
    });
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("entity_to_edit")) {
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
    this._drag = {
      startX: e.clientX, startY: e.clientY,
      startTx: this._transform.tx, startTy: this._transform.ty,
    };
    e.currentTarget.classList.add("dragging");
  }

  _onMouseMove(e) {
    if (!this._drag) return;
    const svgEl = this.renderRoot?.querySelector("svg");
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
    this._drag = null;
    this.renderRoot?.querySelector("svg")?.classList.remove("dragging");
  }

  _zoomBy(factor) {
    const svgEl = this.renderRoot?.querySelector("svg");
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

  async _queryRelated() {
    if (!this.entity_to_edit?.entity_iri) {
      this._related = [];
      return;
    }

    this._loading = true;
    const subject = this.entity_to_edit.entity_iri;

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
      this._related = nodes;
    } catch (err) {
      console.error("[GraphView] Query-Fehler:", err);
      this._related = [];
    }

    this._loading = false;
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

  _renderSvg() {
    const nodes = this._related;
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

    const W = ORBIT * 2 + R_NODE * 2 + LABEL_PAD * 2;
    const H = W;
    const cx = W / 2;
    const cy = H / 2;

    const currentLabel = this.entity_to_edit.entity_iri
      .split("/")[1];
    const currentType = this.entity_to_edit.entity_type;
    const currentColor = this._getTypeColor(currentType);
    const currentTypeName = this._getTypeName(currentType);

    // Collect unique entity types for the legend
    let legendTypes = [
      ...nodes
        .filter((n) => n.type)
        .map((n) => ({ type: n.type, name: this._getTypeName(n.type) })),
    ].filter((v, i, arr) => arr.findIndex((x) => x.type === v.type) === i);

    const colorOut = EDGE_COLOR.outgoing;
    const colorIn = EDGE_COLOR.incoming;
    const colorBoth = EDGE_COLOR.both;

    // Arrow marker size proportional to node radius
    const markerSz = Math.round(R_NODE * 0.12);

    return html`
      <div class="svg-container">
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
        <!-- Directed edges -->
        ${nodes.map((node, i) => {
          const angle = (2 * Math.PI * i) / N - Math.PI / 2;
          const nx = cx + ORBIT * Math.cos(angle);
          const ny = cy + ORBIT * Math.sin(angle);
          const ux = Math.cos(angle);
          const uy = Math.sin(angle);
          // Trim to circle edges so arrowheads sit flush against node borders
          const sx = cx + R_CENTER * ux;
          const sy = cy + R_CENTER * uy;
          const ex = nx - R_NODE * ux;
          const ey = ny - R_NODE * uy;
          const color = EDGE_COLOR[node.direction] ?? EDGE_COLOR.incoming;
          const sw = Math.round(R_NODE * 0.04);

          if (node.direction === "both") {
            return svg`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"
              stroke="${color}" stroke-width="${sw}" stroke-linecap="round"
              marker-end="url(#arrow-both-end)"
              marker-start="url(#arrow-both-start)" />`;
          } else if (node.direction === "outgoing") {
            return svg`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"
              stroke="${color}" stroke-width="${sw}" stroke-linecap="round"
              marker-end="url(#arrow-out)" />`;
          } else {
            return svg`<line x1="${ex}" y1="${ey}" x2="${sx}" y2="${sy}"
              stroke="${color}" stroke-width="${sw}" stroke-linecap="round"
              marker-end="url(#arrow-in)" />`;
          }
        })}

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

        <!-- Related nodes -->
        ${nodes.map((node, i) => {
          const angle = (2 * Math.PI * i) / N - Math.PI / 2;
          const nx = cx + ORBIT * Math.cos(angle);
          const ny = cy + ORBIT * Math.sin(angle);
          const ux = Math.cos(angle);
          const uy = Math.sin(angle);
          const color = this._getTypeColor(node.type);
          const typeName = this._getTypeName(node.type);

          // Label placed outside the node along the radial direction
          const labelDist = R_NODE + FS_NODE_LABEL * 1.1;
          const lx = nx + ux * labelDist;
          const ly = ny + uy * labelDist;
          const anchor = ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle";

          return svg`
            <g class="node-group"
               @click="${() => this._onNodeClick(node)}"
               role="button"
               aria-label="Preview ${node.label}">
              <title>${node.label}${node.type ? ` (${this._getTypeName(node.type)})` : ''}</title>
              <circle cx="${nx}" cy="${ny}" r="${R_NODE}"
                      fill="${color}" filter="url(#gv-shadow)" opacity="0.93" />
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
            </g>
          `;
        })}
          </g><!-- #gv-zoom-layer -->
        </svg>
      </div><!-- .svg-container -->

      <!-- Legend (outside the zoomable area) -->
      <div class="legend">
        <div class="legend-section">
          <span class="legend-title">Current:</span>
          ${currentTypeName ? html`
            <span class="legend-item">
              <span class="legend-swatch"
                    style="background:${currentColor}"></span>
              ${currentTypeName}
            </span>
          ` : html`<span class="legend-item">No type</span>`}
        </div>
        <div class="legend-section">
          <span class="legend-title">Related:</span>
          ${legendTypes.map(
            ({ type, name }) => html`
              <span class="legend-item">
                <span class="legend-swatch"
                      style="background:${this._getTypeColor(type)}"></span>
                ${name}
              </span>
            `
          )}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.entity_to_edit) {
      return html`<div class="empty-state">No selected entity</div>`;
    }
    if (this._loading) {
      return html`<div class="empty-state">Loading graph…</div>`;
    }
    if (this._related.length === 0) {
      return html`<div class="empty-state">
        No related entities found.
      </div>`;
    }
    return html`<div class="graph-wrapper">${this._renderSvg()}</div>`;
  }
}

customElements.define("adwlm-graph-view", ADWLMGraphView);
