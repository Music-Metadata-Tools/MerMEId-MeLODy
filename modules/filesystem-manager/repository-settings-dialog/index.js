import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { filesystemService } from "../../services/filesystem-service.js";
import { getProjectDomain } from "../../services/project-domain.js";
import * as oxigraph from "#oxigraph";

const filesystem = filesystemService.getInstance();

// Empty, or an absolute IRI prefix: scheme ":", http(s) with "//" + host, no "#"/"?" (entity paths follow)
const PROJECT_DOMAIN_PATTERN = /^$|^(?!https?:(?!\/\/[^\/]))[a-z][a-z0-9+.-]*:[^\s<>"{}|\\^`#?]*$/i;

// Error message for an invalid project domain, "" if valid. The final check uses the editor's own
// RDF parser on an example entity IRI, so entities stay readable after the change.
function projectDomainError(value) {
    if (!PROJECT_DOMAIN_PATTERN.test(value)) {
        return "Must be an IRI prefix like https://example.org/ (http/https with //, no spaces, # or ?).";
    }
    try {
        oxigraph.namedNode(`${getProjectDomain({ projectDomain: value })}persons/1`);
    } catch (error) {
        return "Not a valid IRI (check e.g. the port or % escapes).";
    }
    return "";
}

const PIPELINE_STATUS_TEXT = {
    pending: "Waiting for the pipeline to start …",
    running: "The pipeline is changing the project domain in all files …",
    success: "Done, synchronizing …",
};

const styles =
    css`
    sl-input {
        padding-bottom: 0.5em;
    }
    #project-domain-status {
        display: flex;
        align-items: center;
        gap: 0.5em;
    }
    #project-domain-status[hidden] {
        display: none;
    }
`;

export default class ADWLMRepositorySettingsDialog extends LitElement {
    static properties = {
        repository_path: {
            type: String,
            attribute: false,
        },
    };

    static styles = styles;

    constructor() {
        super();

        this.repository_path = null;
        this._config = null;
        this._changing_domain = false;
        this._project_domain_help = "";
    }

    render() {
        return html`
            <sl-dialog label="Repository settings">
                <sl-input id="username" label="Username" value="" autocomplete="off"></sl-input>
                <sl-input id="personal-access-token" label="Personal access token" type="password" value=""></sl-input>
                <sl-input id="project-domain" label="Project domain" autocomplete="off"></sl-input>
                <div id="project-domain-status" hidden>
                    <sl-spinner></sl-spinner><span></span><a target="_blank" rel="noopener">Pipeline</a>
                </div>
                <sl-button id="save-repository-settings" slot="footer" variant="primary">Save</sl-button>
            </sl-dialog>
        `;
    }

    createRenderRoot() {
        const render_root = super.createRenderRoot();

        // Keep the dialog open while the pipeline runs, so nothing is edited with the old domain.
        render_root.addEventListener("sl-request-close", (event) => {
            if (this._changing_domain) {
                event.preventDefault();
            }
        });

        // Save only with a valid project domain.
        render_root.addEventListener("sl-input", (event) => {
            if (event.target.matches("sl-input#project-domain")) {
                this._validateProjectDomain();
            }
        });

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#save-repository-settings")) {
                if (this._changing_domain) {
                    return;
                }
                let username_input = render_root.querySelector("sl-input#username");
                let personal_access_token_input = render_root.querySelector("sl-input#personal-access-token");
                let username = username_input.value;
                let personal_access_token = personal_access_token_input.value;
                let project_domain_input = render_root.querySelector("sl-input#project-domain");
                let project_domain = project_domain_input.value.trim();

                if (!this._validateProjectDomain()) {
                    project_domain_input.reportValidity();
                    return;
                }

                target.loading = true;

                try {
                    await filesystem.update_credentials(this.repository_path, {
                        username,
                        token: personal_access_token,
                    });
                } catch (error) {
                    console.error("Failed to update repository settings:", error);
                    this._toast("danger", "Failed to update the repository settings. Please try again.");
                    target.loading = false;
                    return;
                }

                try {
                    if (await this._changeProjectDomain(project_domain)) {
                        this._toast("success", `Project domain changed to ${this._config.projectDomain}`);
                    }
                    this.hide();
                } catch (error) {
                    console.error("Failed to change the project domain:", error);
                    this._toast("danger", error.message, error.url);
                } finally {
                    this._setChangingDomain(false);
                    target.loading = false;
                }
            }
        });

        return render_root;
    }

    // has_unsaved_changes: unsaved edits in the entity editor, which also lock the project domain.
    async show(repository_path, { has_unsaved_changes = false } = {}) {
        this.repository_path = repository_path;

        const { username, token } = await filesystem.get_credentials(repository_path);

        let username_input = this.renderRoot.querySelector("sl-input#username");
        let personal_access_token_input = this.renderRoot.querySelector("sl-input#personal-access-token");

        username_input.setCustomValidity("");
        personal_access_token_input.setCustomValidity("");
        username_input.value = username || "";
        personal_access_token_input.value = token || "";

        // Field disabled without a readable config.json
        const project_domain_input = this.renderRoot.querySelector("sl-input#project-domain");
        try {
            this._config = JSON.parse(await filesystem.read_file(repository_path, "configuration/config.json"));
        } catch (error) {
            this._config = null;
        }
        // Changing the domain rewrites all files on the remote, so local changes must be shared first.
        const lock_reason = !this._config
            ? null
            : has_unsaved_changes
                ? "Save or undo your unsaved changes first."
                : await filesystem.get_project_domain_lock_reason(repository_path);
        project_domain_input.disabled = !this._config || lock_reason !== null;
        project_domain_input.value = this._config?.projectDomain ?? "";
        project_domain_input.placeholder = this._config ? "urn:uuid:" : "No configuration/config.json found";
        this._project_domain_help = lock_reason
            ?? "IRI prefix of all entities, e.g. https://example.org/ (empty: urn:uuid:). Changing it rewrites all files of the remote repository via its pipeline.";

        this._validateProjectDomain();

        this.renderRoot.querySelector("sl-dialog").show();
    }

    // Marks the domain field and disables Save while the entered domain is invalid.
    _validateProjectDomain() {
        const input = this.renderRoot.querySelector("sl-input#project-domain");
        const error = input.disabled ? "" : projectDomainError(input.value.trim());
        input.setCustomValidity(error);
        input.helpText = error || this._project_domain_help;
        this.renderRoot.querySelector("sl-button#save-repository-settings").disabled = error !== "";
        return error === "";
    }

    // Runs the domain change on the remote and asks the filesystem manager to synchronize afterwards.
    // Returns false if there was nothing to change.
    async _changeProjectDomain(value) {
        const project_domain_input = this.renderRoot.querySelector("sl-input#project-domain");
        if (!this._config || project_domain_input.disabled) {
            return false;
        }
        const domain = getProjectDomain({ projectDomain: value });
        if (domain === getProjectDomain(this._config)) {
            return false;
        }

        this._setChangingDomain(true);
        const config = { ...this._config, projectDomain: domain };
        await filesystem.change_project_domain(this.repository_path, JSON.stringify(config, null, 2) + "\n", domain, {
            onStatus: (status, url) => this._showPipelineStatus(status, url),
        });
        this._config = config;
        this.dispatchEvent(new CustomEvent("adwlm-repository-settings-dialog:project-domain-changed", {
            bubbles: true,
            composed: true,
        }));
        return true;
    }

    _setChangingDomain(changing) {
        this._changing_domain = changing;
        this.renderRoot.querySelectorAll("sl-input").forEach((input) => {
            input.readonly = changing;
        });
        if (changing) {
            this._showPipelineStatus("pending", null);
        } else {
            this.renderRoot.querySelector("#project-domain-status").hidden = true;
        }
    }

    _showPipelineStatus(status, url) {
        const status_element = this.renderRoot.querySelector("#project-domain-status");
        const link = status_element.querySelector("a");
        status_element.hidden = false;
        status_element.querySelector("span").textContent = PIPELINE_STATUS_TEXT[status] ?? "";
        link.hidden = !url;
        if (url) {
            link.href = url;
        }
    }

    hide() {
        this.renderRoot.querySelector("sl-dialog").hide();
    }

    _toast(variant, message, url = null) {
        // A static <sl-alert> in the template only toasts correctly once -
        // Shoelace moves it into a shared toast stack and removes it from
        // the DOM entirely once it hides, so a second .toast() call finds
        // nothing there anymore. Creating a fresh element every time avoids
        // that (same pattern as add-repository-dialog's error alert).
        const alert = document.createElement("sl-alert");
        alert.variant = variant;
        alert.closable = true;
        alert.duration = url ? Infinity : 8000;
        alert.innerHTML = `<sl-icon slot="icon" name="${variant === "success" ? "check2-circle" : "exclamation-triangle"}"></sl-icon>`;
        alert.append(message);
        if (url) {
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = "Open pipeline";
            alert.append(document.createElement("br"), link);
        }
        document.body.append(alert);
        alert.toast();
    }
}

window.customElements.define("adwlm-repository-settings-dialog", ADWLMRepositorySettingsDialog);
