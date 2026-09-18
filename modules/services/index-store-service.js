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
  { name: "DataCollection", url: "dataCollections.ttl", labels: { en: "Data Collection", de: "Data Collection" } },
];

class IndexStoreService {
  constructor() {
    this.store = new oxigraph.Store();
    this._loaded = false;
    this._loading = false;
    this._dataset_url = null;
    this._loadingPromise = null;
  }

  async loadIndexes(selected_repository_path) {
    if (this._loadingPromise) {
      return this._loadingPromise;
    }
    this._loadingPromise = this._doLoadIndexes(selected_repository_path);
    try {
      await this._loadingPromise;
    } finally {
      this._loadingPromise = null;
    }
  }

  async _doLoadIndexes(selected_repository_path) {
    this._loading = true;
    this._selected_repository_path = selected_repository_path;
    const filesystem = filesystemService.getInstance();

    let loadedCount = 0;

    for (const index of INDEXES) {
      try {
        const localIndex = await filesystem.read_file(
            this._selected_repository_path,
            `indexes/${index.url}`
          );
          let ttlText = localIndex;
        // Merge local index – missing file is not an error
        // try {
        //   if (!localIndex || localIndex.trim() === '') {
        //     continue;
        //   }
        //   const url = `${dataset_url}/${index.url}?t=${Date.now()}`;
        //   const res = await fetch(url, { cache: "no-store" });
        //   if (!res.ok) {
        //     continue;
        //   }
        //   let remote = await res.text();
        //   let ttlText = remote + "\n" + localIndex;
        // } catch (_localErr) {
        //   // no local index found, ignore

        // }
        this.store.load(ttlText, { format: "text/turtle" });
        loadedCount++;
      } catch (err) {
        console.error(`Error loading ${index.url}. Please reload.`, err);
      }
    }

    this._loaded = true;
    this._loading = false;
    console.log(`[index-store] finished loading ${loadedCount}/${INDEXES.length} indexes, ${this.store.size} triples total`);
    document.dispatchEvent(new CustomEvent("adwlm-index-store:loaded", { bubbles: true }));
  }

  async reloadIndexes(selected_repository_path) {
    // Wait for loadingIndexes so this.store is not resetted
    if (this._loadingPromise) {
      console.log("[index-store] reloadIndexes waiting for in-flight load to finish before resetting store");
      await this._loadingPromise;
    }
    this.store = new oxigraph.Store();
    this._loaded = false;
    await this.loadIndexes(selected_repository_path ?? this._selected_repository_path);
  }
}

export const indexStoreService = new IndexStoreService();
