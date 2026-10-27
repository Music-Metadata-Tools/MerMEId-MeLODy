import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { filesystemService } from "../../services/filesystem-service.js";

const filesystem = filesystemService.getInstance();

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
    }

    render() {
        return html`
            <sl-dialog label="Repository settings">
                <sl-input id="username" label="Username" value="" autocomplete="off"></sl-input>
                <sl-input id="personal-access-token" label="Personal access token" type="password" value=""></sl-input>
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

                target.loading = true;

                try {
                    await filesystem.update_credentials(this.repository_path, {
                        username,
                        token: personal_access_token,
                    });

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

        this.renderRoot.querySelector("sl-dialog").show();
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
