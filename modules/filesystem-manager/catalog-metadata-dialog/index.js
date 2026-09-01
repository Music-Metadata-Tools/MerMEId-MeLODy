import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { filesystemService } from "../../services/filesystem-service.js";

const filesystem = filesystemService.getInstance();

const CATALOG_PATH = "dataCatalogs/catalog.ttl";
const CATALOG_SHAPE_LOCATION = "configuration/dataCatalog.shacl";

const styles =
    css`
    shacl-form {
        display: block;
        max-height: 60vh;
        overflow-y: auto;
    }
`;

export default class ADWLMCatalogMetadataDialog extends LitElement {
    static properties = {
        repository_path: {
            type: String,
            attribute: false,
        },
        _isInvalid: {
            type: Boolean,
            state: true,
        },
    };

    static styles = styles;

    constructor() {
        super();

        this.repository_path = null;
        this._catalogIri = null;
        this._isInvalid = true;
    }

    render() {
        return html`
            <sl-dialog label="Catalog metadata" style="--width: 60vw">
                <shacl-form data-shapes-url="" data-values-subject="" data-shape-subject=""></shacl-form>
                <sl-button id="save-catalog-metadata" slot="footer" variant="primary" ?disabled="${this._isInvalid}">Save</sl-button>
            </sl-dialog>
        `;
    }

    createRenderRoot() {
        const render_root = super.createRenderRoot();

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#save-catalog-metadata")) {
                const form = render_root.querySelector("shacl-form");

                target.loading = true;

                try {
                    const rdf_contents = form.serialize();
                    await filesystem.save_and_stage_file(this.repository_path, rdf_contents, CATALOG_PATH);
                    await filesystem.generate_indexes_for_saved_file(this.repository_path, CATALOG_PATH, false).catch(() => {});

                    this.hide();
                } catch (error) {
                    console.error("Failed to update catalog metadata:", error);
                    this._toast_error();
                } finally {
                    target.loading = false;
                }
            }
        });

        return render_root;
    }

    firstUpdated() {
        const form = this.renderRoot.querySelector("shacl-form");
        form.addEventListener("change", (event) => {
            this._isInvalid = !event.detail.valid;
        });
    }

    async show(repository_path) {
        this.repository_path = repository_path;
        this._isInvalid = true;

        const domain = await this._resolveProjectDomain(repository_path);
        this._catalogIri = `${domain}dataCatalogs/catalog`;

        const existing = await filesystem.read_file(repository_path, CATALOG_PATH).catch(() => "");
        const values = existing && existing.trim() !== ""
            ? existing
            : `<${this._catalogIri}> a <https://schema.org/DataCatalog> .`;

        const shaclContent = await fetch(CATALOG_SHAPE_LOCATION).then(response => response.text());

        let combinedIndexContent = "";
        try {
            const indexFiles = await filesystem.read_directory_files(repository_path, "indexes");
            for (const [filename, content] of Object.entries(indexFiles)) {
                combinedIndexContent += content + "\n";
            }
        } catch (error) {
            console.error("catalog-metadata-dialog: failed to load indexes", error);
        }

        const modifiedShaclContent = shaclContent + combinedIndexContent;
        const blob = new Blob([modifiedShaclContent], { type: "text/turtle" });
        const shapesUrl = URL.createObjectURL(blob);

        const form = this.renderRoot.querySelector("shacl-form");
        form.dataset.valuesSubject = this._catalogIri;
        form.dataset.values = values;
        form.dataset.shapesUrl = shapesUrl;

        this.renderRoot.querySelector("sl-dialog").show();
    }

    hide() {
        this.renderRoot.querySelector("sl-dialog").hide();
    }

    async _resolveProjectDomain(repository_path) {
        try {
            const configContent = await filesystem.read_file(repository_path, "configuration/config.json");
            if (configContent && configContent.trim() !== "") {
                const config = JSON.parse(configContent);
                return config?.projectDomain ?? "urn:uuid:";
            }
        } catch (error) {
            // fall through to default domain
        }

        return "urn:uuid:";
    }

    _toast_error() {
        const alert = document.createElement("sl-alert");
        alert.variant = "danger";
        alert.closable = true;
        alert.duration = 8000;
        alert.innerHTML = `
            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
            Failed to update the catalog metadata. Please try again.
        `;
        document.body.append(alert);
        alert.toast();
    }
}

window.customElements.define("adwlm-catalog-metadata-dialog", ADWLMCatalogMetadataDialog);
