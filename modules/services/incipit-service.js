import init_oxigraph, * as oxigraph from "https://cdn.jsdelivr.net/npm/oxigraph@0.4.5/+esm";
import { filesystemService } from "./filesystem-service.js";

// Incipits are MEI files in the repository's incipits folder. indexes/incipits.ttl maps
// each incipit entity IRI to its file name via skos:prefLabel.
export const INCIPITS_FOLDER = "incipits";
export const INCIPITS_INDEX = "indexes/incipits.ttl";
export const INCIPIT_ENTITY_TYPE = "https://lod.academy/melod/vocab/ontology#IncipitEntity";

const VEROVIO_BASE_URL = "https://cdn.jsdelivr.net/npm/verovio@6.3.0/dist";

// The Verovio WASM module is large, so it is only loaded when the first incipit is rendered.
let verovioToolkitPromise = null;

function getVerovioToolkit() {
    if (!verovioToolkitPromise) {
        verovioToolkitPromise = (async () => {
            const { default: createVerovioModule } = await import(`${VEROVIO_BASE_URL}/verovio-module.mjs`);
            const { VerovioToolkit } = await import(`${VEROVIO_BASE_URL}/verovio.mjs`);
            const verovioModule = await createVerovioModule();
            return new VerovioToolkit(verovioModule);
        })();
        verovioToolkitPromise.catch(() => verovioToolkitPromise = null);
    }
    return verovioToolkitPromise;
}

// e.g. "incipits/tt_74_expression_3_score_1.xml"
export function isIncipitFilePath(path) {
    return typeof path === "string" && path.startsWith(`${INCIPITS_FOLDER}/`) && path.endsWith(".xml");
}

async function queryIncipitIndex(repositoryPath, query) {
    const indexContent = await filesystemService.getInstance().read_file(repositoryPath, INCIPITS_INDEX);

    await init_oxigraph();
    const store = new oxigraph.Store();
    store.load(indexContent, { format: "text/turtle" });

    return store.query(`PREFIX skos: <http://www.w3.org/2004/02/skos/core#> ${query}`);
}

// Entity IRI -> file name, e.g. "urn:uuid:incipits/101615828" -> "tt_74_expression_3_score_1.xml"
export async function getIncipitFilename(repositoryPath, iri) {
    const results = await queryIncipitIndex(repositoryPath,
        `SELECT ?filename WHERE { <${iri}> skos:prefLabel ?filename . } LIMIT 1`);

    return results[0]?.get("filename")?.value ?? null;
}

// File name -> entity IRI, the reverse of getIncipitFilename()
export async function getIncipitIri(repositoryPath, filename) {
    const results = await queryIncipitIndex(repositoryPath,
        `SELECT ?iri WHERE { ?iri skos:prefLabel ${JSON.stringify(filename)} . } LIMIT 1`);

    return results[0]?.get("iri")?.value ?? null;
}

export async function readIncipitFile(repositoryPath, filename) {
    return filesystemService.getInstance().read_file(repositoryPath, `${INCIPITS_FOLDER}/${filename}`);
}

export async function renderMei(mei) {
    const toolkit = await getVerovioToolkit();
    toolkit.setOptions({
        svgViewBox: false,
        adjustPageHeight: true,
        breaks: "encoded",
        scale: 40,
        header: "none",
        footer: "none",
    });

    if (!toolkit.loadData(mei)) {
        throw new Error("Verovio could not load the MEI file");
    }

    let svg = "";
    for (let page = 1; page <= toolkit.getPageCount(); page++) {
        svg += toolkit.renderToSVG(page);
    }
    return svg;
}
