import init_oxigraph, * as oxigraph from "https://cdn.jsdelivr.net/npm/oxigraph@0.4.5/+esm";
import { filesystemService } from "../services/filesystem-service.js";

await init_oxigraph();

export const INDEXES = [
  { name: "Person", url: "persons.ttl", labels: { en: "Person", de: "Person" } },
  { name: "Place", url: "places.ttl", labels: { en: "Place", de: "Ort" } },
  { name: "Institution", url: "institutions.ttl", labels: { en: "Institution", de: "Institution" } },
  { name: "RISMInstitution", url: "rism.ttl", labels: { en: "RISM Institution", de: "RISM-Institution" } },
  { name: "Letter", url: "letters.ttl", labels: { en: "Letter", de: "Brief" } },
  { name: "Work", url: "works.ttl", labels: { en: "Work", de: "Werk" } },
  { name: "Venue", url: "venues.ttl", labels: { en: "Venue", de: "Veranstaltungsort" } },
  { name: "Event", url: "events.ttl", labels: { en: "Event", de: "Ereignis" } },
  { name: "Expression", url: "expressions.ttl", labels: { en: "Expression", de: "Expression" } },
  { name: "Instrumentation", url: "instrumentations.ttl", labels: { en: "Instrumentation", de: "Besetzung" } },
  { name: "Item", url: "items.ttl", labels: { en: "Item", de: "Item" } },
  { name: "Manifestation", url: "manifestations.ttl", labels: { en: "Manifestation", de: "Manifestation" } },
  { name: "PerformanceEvent", url: "performanceEvents.ttl", labels: { en: "Performance Event", de: "Aufführung" } },
  { name: "Bibliography", url: "bibliography.ttl", labels: { en: "Bibliography", de: "Bibliographie" } },
];

class IndexStoreService {
  constructor() {
    this.store = new oxigraph.Store();
    this._loaded = false;
    this._loading = false;
    this._dataset_url = null;
  }

  async loadIndexes(dataset_url, selected_repository_path) {
    if (this._loading) return;
    this._loading = true;
    this._dataset_url = dataset_url;
    this._selected_repository_path = selected_repository_path;
    const filesystem = filesystemService.getInstance();

    for (const index of INDEXES) {
      try {
        const localIndex = await filesystem.read_file(
            this._selected_repository_path,
            `indexes/${index.url}`
          );
          let ttlText = localIndex;
        // Merge local index – missing file is not an error
        try {
          if (!localIndex || localIndex.trim() === '') {
            continue;
          }
          const url = `${dataset_url}/${index.url}?t=${Date.now()}`;
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) {
            continue;
          }
          let remote = await res.text();
          let ttlText = remote + "\n" + localIndex;
        } catch (_localErr) {
          // no local index found, ignore
          
        }
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
    await this.loadIndexes(dataset_url ?? this._dataset_url, this._selected_repository_path);
  }
}

export const indexStoreService = new IndexStoreService();
