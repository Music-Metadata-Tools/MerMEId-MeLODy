import { LitElement, html, css, svg } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { indexStoreService } from "../services/index-store-service.js";

// Entity type → display colour mapping
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
      min-width: 360px;
      overflow-x: auto;
      padding: 1rem 0;
    }

    svg {
      width: 100%;
      height: auto;
      overflow: visible;
    }

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

    // Re-query when the shared store finishes (re-)loading
    document.addEventListener("adwlm-index-store:loaded", () => {
      if (this.entity_to_edit) {
        this._queryRelated();
      }
    });
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("entity_to_edit")) {
      if (this.entity_to_edit && indexStoreService._loaded) {
        this._queryRelated();
      } else {
        this._related = [];
      }
    }
  }

  async _queryRelated() {
    if (!this.entity_to_edit?.entity_iri) {
      console.log("[GraphView] Kein entity_iri vorhanden – Query abgebrochen.");
      this._related = [];
      return;
    }

    this._loading = true;
    const subject = this.entity_to_edit.entity_iri;
    console.log("[GraphView] _queryRelated() für Subject:", subject);
    console.log(
      "[GraphView] Store geladen:", indexStoreService._loaded,
      "| Store-Größe:", indexStoreService.store.size
    );

    const incomingQuery = `
      SELECT DISTINCT ?related ?label ?type WHERE {
        ?related <${SKOS_RELATED}> <${subject}> .
        OPTIONAL { ?related <${SKOS_LABEL}> ?label . }
        OPTIONAL {
          ?related a ?type .
          FILTER(STRSTARTS(STR(?type), "${MELOD_NS}"))
        }
      }
    `;

    const outgoingQuery = `
      SELECT DISTINCT ?related ?label ?type WHERE {
        <${subject}> <${SKOS_RELATED}> ?related .
        OPTIONAL { ?related <${SKOS_LABEL}> ?label . }
        OPTIONAL {
          ?related a ?type .
          FILTER(STRSTARTS(STR(?type), "${MELOD_NS}"))
        }
      }
    `;

    console.log("[GraphView] Incoming Query:", incomingQuery);
    console.log("[GraphView] Outgoing Query:", outgoingQuery);

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
      console.log(
        `[GraphView] ${nodes.length} verwandte Entitäten gefunden (incoming + outgoing).`
      );
      nodes.forEach((n) =>
        console.log("[GraphView] Knoten:", n.direction, n.subject, "→", n.label)
      );
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

    const R_NODE = 88;
    const R_CENTER = 102;

    // Minimum orbit: always leave at least 80 units between node edges for arrows
    const ORBIT_GAP = 80;
    const ORBIT_MIN_FOR_GAP = R_CENTER + R_NODE + ORBIT_GAP;
    // Also ensure outer nodes don't overlap each other (circumference / N > 2 * R_NODE * 1.2)
    const ORBIT_MIN_FOR_SPREAD = N > 1
      ? Math.ceil((R_NODE * 2.4 * N) / (2 * Math.PI)) + R_NODE
      : 0;
    const ORBIT = Math.max(ORBIT_MIN_FOR_GAP, ORBIT_MIN_FOR_SPREAD);

    // Font sizes scale with node radii so they stay readable at any node size
    const FS_CENTER_TYPE  = Math.round(R_CENTER * 0.3);
    const FS_CENTER_LABEL = Math.round(R_CENTER * 0.21);
    const FS_NODE_TYPE    = Math.round(R_NODE * 0.3);
    const FS_NODE_LABEL   = Math.round(R_NODE * 0.4);

    // Canvas: orbit + one node-diameter each side + label space
    const LABEL_PAD = Math.round(R_NODE * 1.6);
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
    const legendTypes = [
      ...(currentType ? [{ type: currentType, name: currentTypeName }] : []),
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
      <svg
        viewBox="0 0 ${W} ${H}"
        xmlns="http://www.w3.org/2000/svg"
        style="width:100%;max-width:${W}px;height:auto;overflow:visible;"
      >
        <defs>
          <filter id="gv-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3"
                          flood-color="rgba(0,0,0,0.2)" />
          </filter>
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
               aria-label="Vorschau ${node.label}">
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
                ${this._truncate(node.label, 26)}
              </text>
            </g>
          `;
        })}
      </svg>

      <!-- Legend -->
      <div class="legend">
        <div class="legend-section">
          <span class="legend-title">Types:</span>
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
