import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { filesystemService } from "../../services/filesystem-service.js";
import { getProjectDomain } from "../../services/project-domain.js";

const filesystem = filesystemService.getInstance();

// Empty, or an absolute IRI prefix: scheme ":" and no characters invalid in IRIs
const PROJECT_DOMAIN_PATTERN = /^$|^[a-z][a-z0-9+.-]*:[^\s<>"{}|\\^`]*$/i;

const styles =
    css`
    sl-input {
        padding-bottom: 0.5em;
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
    }

    render() {
        return html`
            <sl-dialog label="Repository settings">
                <sl-input id="username" label="Username" value="" autocomplete="off"></sl-input>
                <sl-input id="personal-access-token" label="Personal access token" type="password" value=""></sl-input>
                <sl-input id="project-domain" label="Project domain" autocomplete="off"
                    help-text="IRI prefix for new entities, e.g. https://example.org/ (empty: urn:uuid:)"></sl-input>
                <sl-button id="save-repository-settings" slot="footer" variant="primary">Save</sl-button>
            </sl-dialog>
        `;
    }

    createRenderRoot() {
        const render_root = super.createRenderRoot();

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#save-repository-settings")) {
                let username_input = render_root.querySelector("sl-input#username");
                let personal_access_token_input = render_root.querySelector("sl-input#personal-access-token");
                let username = username_input.value;
                let personal_access_token = personal_access_token_input.value;
                let project_domain_input = render_root.querySelector("sl-input#project-domain");
                let project_domain = project_domain_input.value.trim();

                project_domain_input.setCustomValidity(PROJECT_DOMAIN_PATTERN.test(project_domain)
                    ? ""
                    : "Must start with a scheme, e.g. https://example.org, and contain no spaces.");
                if (!project_domain_input.reportValidity()) {
                    return;
                }

                target.loading = true;

                try {
                    await filesystem.update_credentials(this.repository_path, {
                        username,
                        token: personal_access_token,
                    });
                    await this._saveProjectDomain(project_domain);

                    this.hide();
                } catch (error) {
                    console.error("Failed to update repository settings:", error);
                    this._toast_error();
                } finally {
                    target.loading = false;
                }
            }
        });

        return render_root;
    }

    async show(repository_path) {
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
        project_domain_input.setCustomValidity("");
        project_domain_input.disabled = !this._config;
        project_domain_input.value = this._config?.projectDomain ?? "";
        project_domain_input.placeholder = this._config ? "urn:uuid:" : "No configuration/config.json found";

        this.renderRoot.querySelector("sl-dialog").show();
    }

    async _saveProjectDomain(value) {
        if (!this._config) {
            return;
        }
        const domain = getProjectDomain({ projectDomain: value });
        if (domain === this._config.projectDomain) {
            return;
        }
        this._config = { ...this._config, projectDomain: domain };
        await filesystem.save_config_file(this.repository_path, JSON.stringify(this._config, null, 2));
        this.dispatchEvent(new CustomEvent("adwlm-repository-settings-dialog:config-changed", {
            bubbles: true,
            composed: true,
        }));
    }

    hide() {
        this.renderRoot.querySelector("sl-dialog").hide();
    }

    _toast_error() {
        // A static <sl-alert> in the template only toasts correctly once -
        // Shoelace moves it into a shared toast stack and removes it from
        // the DOM entirely once it hides, so a second .toast() call finds
        // nothing there anymore. Creating a fresh element every time avoids
        // that (same pattern as add-repository-dialog's error alert).
        const alert = document.createElement("sl-alert");
        alert.variant = "danger";
        alert.closable = true;
        alert.duration = 8000;
        alert.innerHTML = `
            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
            Failed to update the repository settings. Please try again.
        `;
        document.body.append(alert);
        alert.toast();
    }
}

window.customElements.define("adwlm-repository-settings-dialog", ADWLMRepositorySettingsDialog);
