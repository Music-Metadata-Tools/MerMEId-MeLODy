import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import init_oxigraph, * as oxigraph from "https://cdn.jsdelivr.net/npm/oxigraph@0.4.5/+esm";
import { filesystemService } from "../services/filesystem-service.js";

await init_oxigraph();

function endsWithOrBeforeEntity(str, variable) {
  if (str.endsWith("Entity")) {
    return str.slice(0, -6).endsWith(variable);
  }
  return str.endsWith(variable);
}

const INDEXES = [
  {
    name: "Person",
    url: "persons.ttl",
  },
  {
    name: "Place",
    url: "places.ttl",
  },
  {
    name: "Institution",
    url: "institutions.ttl",
  },
  {
    name: "RISMInstitution",
    url: "rism.ttl",
  },
  {
    name: "Letter",
    url: "letters.ttl",
  },
  {
    name: "Work",
    url: "works.ttl",
  },
  {
    name: "Venue",
    url: "venues.ttl",
  },
  {
    name: "Event",
    url: "events.ttl",
  },
  {
    name: "Expression",
    url: "expressions.ttl",
  },
  {
    name: "Instrumentation",
    url: "instrumentations.ttl",
  },
  {
    name: "Item",
    url: "items.ttl",
  },
  {
    name: "Manifestation",
    url: "manifestations.ttl",
  },
  {
    name: "PerformanceEvent",
    url: "performanceEvents.ttl",
  },
  {
    name: "Bibliography",
    url: "bibliography.ttl",
  },
];

class ADWLMEntitySearch extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 14vw;
      font-size: var(--sl-font-size-small);
    }
    div#search-container {
          display: flex;
          flex-direction: column;
          padding-bottom: 20px;
      }
     .search-input {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    
    sl-select::part(form-control) {
      margin-bottom: 0.5rem;
    }

    sl-select::part(listbox) {
      --sl-font-size-small: 12px;
      font-size: var(--sl-font-size-small);
      max-height: 40vh;
      overflow: auto;
    }

    sl-option::part(base) {
      padding: 4px 8px;
      min-height: 24px;

    }

    sl-select::part(display-input) {
      font-size: var(--sl-font-size-small);
    }
    
    sl-input::part(form-control) {
      margin-bottom: 0.5rem;
    }
    sl-input::part(base) {
      width: 100%;
    }
    .results {
      max-height: 40vh;
      overflow: auto;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 0.5rem;
    }
    .result-item {
      padding: 5px 10px;
      cursor: pointer;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .result-item:hover {
      background-color: rgba(0, 123, 255, 0.1); /* helles Blau beim Hover */
    }

    .result-item.selected {
      background-color: rgba(0, 123, 255, 0.3); /* dunkleres Blau, wenn ausgewählt */
    }
    select {
      display: block;
      margin-bottom: 0.5rem;
    }
    @media only screen and (max-width: 900px) {
        div#search-container {
            display: none;
        }
        div#search-container.open {
            display: flex;
            max-width: 30vw;
        }
        :host {
            width: 80vw;
        }
        
    }
  `;

  static properties = {
    _entries: { state: true },
    _filtered: { state: true },
    _query: { state: true },
    _typeFilter: { state: true },
    _loading: { state: true },
    _dataset_url: { type: String, state: true },
  };

  constructor() {
    super();
    this._entries = [];
    this._filtered = [];
    this._query = "";
    this._typeFilter = "All";
    this._loading = false;
    this.store = null;
    this._dataset_url = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.store = new oxigraph.Store();

    // Listen for future config updates
    document.addEventListener("adwlm-entity-editor:cached-config", (event) => {
      let config = event.detail;
      if (config != null) {
        this._dataset_url = config;
      }
    });

    // Listen for reload indexes event from filesystem manager
    document.addEventListener("adwlm-filesystem-manager:reload-indexes", async (event) => {
      await this.reloadIndexes();
    });

    // Check if there's already a filesystem manager with a selected repository
    const filesystemManager = document.querySelector('adwlm-filesystem-manager');
    if (filesystemManager && filesystemManager._selected_repository_path) {
      // Get initial config from filesystem service
      try {
        const filesystem = filesystemService.getInstance();
        const configContent = await filesystem.read_file(
          filesystemManager._selected_repository_path, 
          'configuration/config.json'
        );
        if (configContent) {
          const config = JSON.parse(configContent);
          this._dataset_url = config.datasetBaseUrl;
        }
      } catch (error) {
        console.warn('Could not load initial config:', error);
        // Use default URL as fallback
        this._dataset_url = null ;
      }
    }
}

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has("_dataset_url") && this._dataset_url != null) {
        this._loadAllIndexes(this._dataset_url);
    }
  }

  async _loadAllIndexes(dataset_url) {
    
    this._loading = true;
    const allEntries = [];

    for (const index of INDEXES) {
      try {
        // Cache-bust the request: ask browser not to use cache and add a unique timestamp
        const url = `${dataset_url}/${index.url}?t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          console.warn(`Could not load ${index.url}: HTTP ${res.status}`);
          continue;
        }
        const ttlText = await res.text();
        this.store.load(ttlText, { format: "text/turtle" });
      } catch (err) {
        console.error(`Fehler beim Laden von ${index.url}. Please reload.`, err);
      }
    }

    // SPARQL-Abfrage für Labels und Typen
    const query = `
      SELECT ?subject ?label ?type WHERE {
        ?subject <http://www.w3.org/2004/02/skos/core#prefLabel> ?label .
        ?subject a ?type .
      }
      ORDER BY ?label
    `;
    const results = this.store.query(query);

    for (const binding of results) {
      allEntries.push({
        subject: binding.get("subject").value,
        label: binding.get("label").value,
        type: binding.get("type")?.value || "Unknown", // Typ ggf. leer
      });
    }

    this._entries = allEntries;
    this._filtered = []; // leer, bis Suche eingegeben wird
    this._loading = false;
    console.log("Alle Einträge geladen:", allEntries.length);
  }

  _onInput(e) {
    this._query = e.target.value.trim().toLowerCase();
    // Clear filtered results if input is empty
    if (!this._query) {
        this._filtered = [];
    } else {
        this._filterResults();
    }
  }

  _onTypeChange(e) {
    this._typeFilter = e.target.value;
    this._filterResults();
  }

  _filterResults() {
    this._filtered = this._entries.filter((e) => {
      const matchesLabel = this._query === "" || e.label?.toLowerCase().includes(this._query);
      const matchesType = this._typeFilter === "All" || endsWithOrBeforeEntity(e.type, this._typeFilter);
      return matchesLabel && matchesType;
    });
    //console.log("Gefilterte Ergebnisse:", this._filtered);
  }

  async _onSelect(entry) {
    const subject = entry.subject;
    let raw = subject.includes("urn:uuid:") ? subject.split("urn:uuid:").pop() : subject;
    if (raw.includes("://")) {
      try {
        raw = new URL(raw).pathname;
      } catch {
        raw = raw.replace(/^[a-z]+:\/\/[^/]+/i, "");
      }
    }
    const parts = String(raw).split("/").filter(Boolean);
    const rel = parts.length >= 2 ? parts.slice(-2).join("/") : (parts[0] || "");
    const filename = rel.endsWith(".ttl") ? rel : `${rel}.ttl`;
    if (!filename || filename === ".ttl") return;

    const filesystemManager = document.querySelector("adwlm-filesystem-manager");
    if (filesystemManager?.selectEntityInTree) {
      const selected = await filesystemManager.selectEntityInTree(filename);
      if (selected) return;
    }

    window.dispatchEvent(new CustomEvent("entity-selected", {
      detail: { filename }
    }));
  }

  async reloadIndexes() {
    if (!this._dataset_url) {
      console.warn('Cannot reload indexes: dataset URL not set');
      return;
    }
    console.log('Reloading indexes...');
    // Clear existing data
    this.store = new oxigraph.Store();
    this._entries = [];
    this._filtered = [];
    this._query = "";
    
    // Reload all indexes
    await this._loadAllIndexes(this._dataset_url);
  }

  render() {
    return html`
    <div id="search-container">
      <sl-details id="search-details" summary="Search">
        <div class="search-input">
          <sl-select @sl-change=${this._onTypeChange} value=${this._typeFilter} size="small" hoist>
            <sl-option value="All">All</sl-option>
            ${INDEXES.map(
              (index) => html`
                <sl-option value=${index.name}>${index.name}</sl-option>
              `
            )}
          </sl-select>
          
          <sl-input 
            type="text" 
            placeholder="Search entities..." 
            @sl-input=${this._onInput}
            size="small"
            clearable>
          </sl-input>
        </div>

        <div class="results">
          ${this._loading ? html`
            Reload the browser to load indexes.
          ` : this._filtered.map(
            (entry) => html`
              <div @click=${() => this._onSelect(entry)} class="result-item">
                <span>${entry.label}</span>
              </div>
            `
          )}
        </div>
      </sl-details>
    </div>
    `;
  }
}

customElements.define("adwlm-entity-search", ADWLMEntitySearch);
