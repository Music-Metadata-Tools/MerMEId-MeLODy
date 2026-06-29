import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { filesystemService } from "../services/filesystem-service.js";
import { indexStoreService, INDEXES } from "../services/index-store-service.js";

function endsWithOrBeforeEntity(str, variable) {
  if (str.endsWith("Entity")) {
    return str.slice(0, -6).endsWith(variable);
  }
  return str.endsWith(variable);
}

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
    .badge {
      margin-left: 10px;
      background-color: #3d97f1;
      padding: 3px;
      font-size: 0.7rem;
      color: #ffffff;
      border-radius: 4px;
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
    _selected_repository_path: {
    type: String,
    state: true
    }
  };

  constructor() {
    super();
    this._entries = [];
    this._filtered = [];
    this._query = "";
    this._typeFilter = "All";
    this._loading = false;
    this._dataset_url = null;
    this._project_domain = null;

    // Listen for repository selection events
    document.addEventListener('adwlm-filesystem-manager:repository-selected', async (event) => {
        this._selected_repository_path = event.detail.repositoryPath;
    });
  }

  async connectedCallback() {
    super.connectedCallback();

    // Listen for future config updates
    document.addEventListener("adwlm-entity-editor:cached-config", (event) => {
      let config = event.detail;
      if (config != null) {
        this._dataset_url = config.datasetBaseUrl;
        this._project_domain = config.projectDomain;
      }
    });

    // Rebuild entries whenever the shared store finishes (re-)loading
    document.addEventListener("adwlm-index-store:loaded", async () => {
      await this._buildEntries();
    });

    // Listen for reload indexes event from filesystem manager and entity editor
    document.addEventListener("adwlm-entity-search:reload-indexes", async (event) => {
      await this.reloadIndexes();
    });
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    if (changedProperties.has("_dataset_url") && this._dataset_url != null && this._selected_repository_path != null) {
      indexStoreService.loadIndexes(this._dataset_url, this._selected_repository_path);
    }
  }

  async _buildEntries() {
    this._loading = true;
    const allEntries = [];
    const store = indexStoreService.store;

    
    // Query 1: main data (subject, label, type)
    const mainQuery = `
      SELECT DISTINCT ?subject ?type WHERE {
        ?subject a ?type .
      }
      ORDER BY ?subject
    `;

    // Query 2: main data (subject, label, type)
    const labelQuery = `
      SELECT ?subject ?label ?type ?composer WHERE {
        ?subject <http://www.w3.org/2004/02/skos/core#prefLabel> ?title .
        OPTIONAL {
          ?subject <https://schema.org/composer> ?composer .
        }
        bind(coalesce(concat(?composer, ": ", ?title), ?title) AS ?label) .
      }
    `;
    
    // Query 3: all classifications per subject
    const classificationsQuery = `
      SELECT ?subject ?classification WHERE {
        ?subject <http://www.w3.org/2004/02/skos/core#broader> ?classification .
      }
    `;
    
    // Query 4: all altLabels per subject
    const altLabelsQuery = `
      SELECT ?subject ?altlabel WHERE {
        ?subject <http://www.w3.org/2004/02/skos/core#altLabel> ?altlabel .
      }
    `;

    // Execute all queries
    const mainResults = store.query(mainQuery);
    const labelResults = store.query(labelQuery);
    const classificationsResults = store.query(classificationsQuery);
    const altLabelsResults = store.query(altLabelsQuery);

    // Create a Map for classifications per subject
    const labelsMap = new Map();
    for (const binding of labelResults) {
      const subjectValue = binding.get("subject").value;
      if (!labelsMap.has(subjectValue)) {
        labelsMap.set(subjectValue, []);
      }
      labelsMap.get(subjectValue).push(binding.get("label").value);
    }

    // Create a Map for classifications per subject
    const classificationsMap = new Map();
    for (const binding of classificationsResults) {
      const subjectValue = binding.get("subject").value;
      if (!classificationsMap.has(subjectValue)) {
        classificationsMap.set(subjectValue, []);
      }
      classificationsMap.get(subjectValue).push(binding.get("classification").value);
    }

    // Create a Map for altLabels per subject
    const altLabelsMap = new Map();
    for (const binding of altLabelsResults) {
      const subjectValue = binding.get("subject").value;
      if (!altLabelsMap.has(subjectValue)) {
        altLabelsMap.set(subjectValue, []);
      }
      altLabelsMap.get(subjectValue).push(binding.get("altlabel").value);
    }

    // Combine results
    for (const binding of mainResults) {
      const subjectValue = binding.get("subject").value;
      allEntries.push({
        subject: subjectValue,
        label: labelsMap.get(subjectValue) || [],
        type: binding.get("type")?.value || "Unknown",
        classifications: classificationsMap.get(subjectValue) || [],
        altlabels: altLabelsMap.get(subjectValue) || [],
        composer: labelsMap.get(subjectValue) || [],
      });
    }

    allEntries.sort((a, b) => a.label[0]?.localeCompare(b.label[0]) || 0);

    this._entries = allEntries;
    this._filtered = [];
    this._loading = false;
    console.log("Loaded entries:", allEntries.length);
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
      const matchesLabel = this._query === "" || 
        e.label?.some(label => label.toLowerCase().includes(this._query)) || 
        e.composer?.some(composer => composer.toLowerCase().includes(this._query)) ||
        e.altlabels?.some(alt => alt.toLowerCase().includes(this._query)) ||
        e.classifications?.some(cls => cls.toLowerCase().includes(this._query));
      const matchesType = this._typeFilter === "All" || endsWithOrBeforeEntity(e.type, this._typeFilter);
      return matchesLabel && matchesType;
    });

    this._filtered.sort((a, b) => a.label[0]?.localeCompare(b.label[0]) || 0);
    console.log("Filtered results:", this._filtered.length);
  }

  async _onSelect(entry) {
    const subject = entry.subject;
    let raw = subject.includes(this._project_domain) ? subject.split(this._project_domain).pop() : subject;

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
    this._entries = [];
    this._filtered = [];
    this._query = "";
    // Delegate to the shared service; _buildEntries is called via adwlm-index-store:loaded
    await indexStoreService.reloadIndexes(this._dataset_url, this._selected_repository_path);
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
        ${this._filtered.length >= 1 ? html`
          <div class="results-count">
            <span>Results: ${this._filtered.length}</span>
          </div>
        ` : ''}
        <div class="results">
          ${this._loading ? html`
            Refresh the editor to load indexes.
          ` : this._filtered.map(
            (entry) => html`
              
              <div @click=${() => this._onSelect(entry)} class="result-item">
                <span>${entry.label[0]}</span><span class="badge">${entry.type.split("https://lod.academy/melod/vocab/ontology#")[1].split("Entity")[0]}</span>
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
