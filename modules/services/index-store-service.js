import init_oxigraph, * as oxigraph from "https://cdn.jsdelivr.net/npm/oxigraph@0.4.5/+esm";

await init_oxigraph();

export const INDEXES = [
  { name: "Person", url: "persons.ttl" },
  { name: "Place", url: "places.ttl" },
  { name: "Institution", url: "institutions.ttl" },
  { name: "RISMInstitution", url: "rism.ttl" },
  { name: "Letter", url: "letters.ttl" },
  { name: "Work", url: "works.ttl" },
  { name: "Venue", url: "venues.ttl" },
  { name: "Event", url: "events.ttl" },
  { name: "Expression", url: "expressions.ttl" },
  { name: "Instrumentation", url: "instrumentations.ttl" },
  { name: "Item", url: "items.ttl" },
  { name: "Manifestation", url: "manifestations.ttl" },
  { name: "PerformanceEvent", url: "performanceEvents.ttl" },
  { name: "Bibliography", url: "bibliography.ttl" },
];

class IndexStoreService {
  constructor() {
    this.store = new oxigraph.Store();
    this._loaded = false;
    this._loading = false;
    this._dataset_url = null;
  }

  async loadIndexes(dataset_url) {
    if (this._loading) return;
    this._loading = true;
    this._dataset_url = dataset_url;

    for (const index of INDEXES) {
      try {
        const url = `${dataset_url}/${index.url}?t=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          console.warn(`Could not load ${index.url}: HTTP ${res.status}`);
          continue;
        }
        const ttlText = await res.text();
        this.store.load(ttlText, { format: "text/turtle" });
      } catch (err) {
        console.error(`Error loading ${index.url}. Please reload.`, err);
      }
    }

    this._loaded = true;
    this._loading = false;
    document.dispatchEvent(new CustomEvent("adwlm-index-store:loaded", { bubbles: true }));
  }

  async reloadIndexes(dataset_url) {
    this.store = new oxigraph.Store();
    this._loaded = false;
    await this.loadIndexes(dataset_url ?? this._dataset_url);
  }
}

export const indexStoreService = new IndexStoreService();
