import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { CredentialsHelper } from '../credentials-helper.js';

class RepositoryToClone {
    constructor() {
        this._folder = null;
        this._url = null;
        this._is_public = true;
        this._branch = null;
        this._username = null;
        this._token = null;
    }

    set folder(value) {
        this._folder = `/${value}`;
    }

    get folder() {
        return this._folder;
    }

    set url(value) {
        this._url = value;
    }

    get url() {
        return this._url;
    }

    set is_public(value) {
        this._is_public = value;
    }

    get is_public() {
        return this._is_public;
    }

    set branch(value) {
        this._branch = value;
    }

    get branch() {
        return this._branch;
    }

    set username(value) {
        this._username = value;
    }

    get username() {
        return this._username;
    }

    set token(value) {
        this._token = value;
    }

    get token() {
        return this._token;
    }
}

const styles =
    css`
    sl-button#clone-repository {
        display: none;
    }
    sl-tab {
        width: 50%;
        height: 0;
    }
    sl-tab-panel {
        height: 40vh;
    }
`;

export default class ADWLMAddRepositoryDialog extends LitElement {
    static properties = {
        repository_names: {
            type: Array,
            attribute: false,
        },
        repository_branches: {
            type: Array,
            attribute: false,
        },
        _tab_panel_1_name: {
            type: String,
            attribute: false,
        },
        _tab_panel_2_name: {
            type: String,
            attribute: false,
        },
        _repository_to_clone: {
            type: Object,
            attribute: false,
        },
        _repository_folder_name_regex: {
            type: Object,
            attribute: false,
        },
        _repository_url_regex: {
            type: Object,
            attribute: false,
        },
        _credentials_alert: {
            type: Object,
            attribute: false,
        }
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        let render_root = this.renderRoot;
        let tab_group = render_root.querySelector("sl-tab-group");
        let next_button = render_root.querySelector("sl-button#next-button");

        if (changedProperties.has("repository_branches")) {
            let repository_branches_select = render_root.querySelector("sl-select#repository-branches");
            let clone_button = render_root.querySelector("sl-button#clone-repository");

            tab_group.show(this._tab_panel_2_name);
            next_button.loading = false;

            for (const branch of this.repository_branches) {
                const option_item = document.createElement("sl-option");
                option_item.setAttribute("value", branch);
                option_item.innerText = branch;
                repository_branches_select.append(option_item);
            }

            if (this.repository_branches.length === 1) {
                let branch = this.repository_branches[0];
                repository_branches_select.value = branch;
                this._repository_to_clone.branch = branch;

                clone_button.style.display = "inline-block";
                next_button.style.display = "none";
            } else {
                clone_button.style.display = "inline-block";
                clone_button.disabled = true;
                next_button.style.display = "none";
            }
        }
    }

    static styles = styles;

    constructor() {
        super();

        this._tab_panel_1_name = "panel_1";
        this._tab_panel_2_name = "panel_2";
        this._repository_to_clone = new RepositoryToClone();
        this._repository_folder_name_regex = /^[a-zA-Z0-9][\w.-]*$/;
        this._repository_url_regex = /^https?:\/\/[^\/]+\/(?:[^\/]+\/)*[^\/]+\.git$/;
        this._credentials_alert = null;
    }

    render() {
        return html`
            <sl-dialog id="add-repository-dialog" label="Add repository">
                <sl-tab-group>
                    <sl-tab slot="nav" panel="panel_1"></sl-tab>
                    <sl-tab slot="nav" panel="panel_2"></sl-tab>
                    <sl-tab-panel name="panel_1">
                        <sl-input id="repository-folder-name" placeholder="Example: 'mermeid-sample-data'." label="Repository folder name" value="" required="true" autofocus="true" autocomplete="off"></sl-input>
                        <sl-input id="repository-url" label="Repository URL" value="" required="true" autocomplete="off"></sl-input>
                        <sl-input id="username" label="Username" value="" required="true" autocomplete="off"></sl-input>
                        <sl-input id="personal-access-token" label="Personal access token" type="password" value="" required="true"></sl-input>
                    </sl-tab-panel>
                    <sl-tab-panel name="panel_2">
                        <sl-select id="repository-branches" label="${this._get_repositiory_branches_label()}"></sl-select>
                    </sl-tab-panel>
                </sl-tab-group>
                <sl-button id="next-button" slot="footer" variant="primary">Next</sl-button>
                <sl-button id="clone-repository" slot="footer" variant="primary">Clone</sl-button>
            </sl-dialog>
        `;
    }

    async firstUpdated() {
        this._credentials_alert = this.shadowRoot.querySelector("sl-alert#credentials");
        
        // Auto-fill last used credentials
        const credentials = await CredentialsHelper.getCredentials();
        console.log('Retrieved credentials:', credentials); // Add this debug line
        if (credentials) {
            this.renderRoot.querySelector("sl-input#repository-folder-name").value = credentials.folder;
            this.renderRoot.querySelector("sl-input#repository-url").value = credentials.url;
            this.renderRoot.querySelector("sl-input#username").value = credentials.username;
        }
    }

    createRenderRoot() {
        const render_root = super.createRenderRoot();

        render_root.addEventListener("sl-request-close", (event) => {
            if (event.detail.source === "overlay") {
                event.preventDefault();
            } else {
                this.hide();
            }
        });

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#next-button")) {
                let repository_folder_name_input = render_root.querySelector("sl-input#repository-folder-name");
                let repository_url_input = render_root.querySelector("sl-input#repository-url");
                let username_input = render_root.querySelector("sl-input#username");
                let personal_access_token_input = render_root.querySelector("sl-input#personal-access-token");

                let repository_folder_name = repository_folder_name_input.value;
                let username = username_input.value;
                let personal_access_token = personal_access_token_input.value;

                // check if the repository folder name is valid
                if (!this._repository_folder_name_regex.test(repository_folder_name)) {
                    repository_folder_name_input.setCustomValidity("The repository folder name is not valid. It has to contain only ASCII letters or digits, and optionally, `-`, or `-`. Example: `mermeid-sample-data`.");
                    repository_folder_name_input.reportValidity();

                    return;
                }

                // check if repository_folder_name already exists
                if (this.repository_names.includes(repository_folder_name)) {
                    repository_folder_name_input.setCustomValidity("The repository folder name already exists!");
                    repository_folder_name_input.reportValidity();

                    return;
                } else {
                    this._repository_to_clone.folder = repository_folder_name;
                }

                let repository_url = render_root.querySelector("sl-input#repository-url").value;

                // check if the repository url is valid
                if (!this._repository_url_regex.test(repository_url)) {
                    repository_url_input.setCustomValidity("The repository url is not valid. It has to start with 'http' and hast to end with '.git'. Example: `https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid-sample-data.git`.");
                    repository_url_input.reportValidity();

                    return;
                }

                // check if repository_url is valid
                try {
                    new URL(repository_url);

                    this._repository_to_clone.url = repository_url;

                    // check if any username or personal access token was set
                    if (username !== "" || personal_access_token !== "") {
                        if (username === "") {
                            username_input.setCustomValidity("The username is not set.");
                            username_input.reportValidity();

                            return;
                        }

                        if (personal_access_token === "") {
                            personal_access_token_input.setCustomValidity("The personal access token is not set.");
                            personal_access_token_input.reportValidity();

                            return;
                        }

                        this._repository_to_clone.username = username;
                        this._repository_to_clone.token = personal_access_token;
                        this._repository_to_clone.is_public = false;
                    }

                    target.loading = true;

                    this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:repository-branches", {
                        "detail": this._repository_to_clone,
                        "bubbles": true,
                        "composed": true,
                    }));
                } catch (err) {
                    repository_url_input.setCustomValidity("The repository URL is not valid.");
                    repository_url_input.reportValidity();

                    return;
                }
            }

            if (target.matches("sl-button#clone-repository")) {
                target.loading = true;

                this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:repository-to-add", {
                    "detail": this._repository_to_clone,
                    "bubbles": true,
                    "composed": true,
                }));

                // Save credentials if clone was successful
                await CredentialsHelper.saveCredentials(
                    this._repository_to_clone.folder.replace('/', ''),  // Remove the leading slash
                    this._repository_to_clone.url,
                    this._repository_to_clone.username
                );
            }
        });

        render_root.addEventListener("sl-change", async (event) => {
            const target = event.target;

            if (target.matches("sl-select#repository-branches")) {
                this._repository_to_clone.branch = target.value;

                let clone_button = render_root.querySelector("sl-button#clone-repository");
                clone_button.disabled = false;
            }
        });

        return render_root;
    }

    show() {
        this.renderRoot.querySelector("sl-dialog").show();
    }

    hide() {
        this.renderRoot.querySelector("sl-dialog").hide();
        this.reset();
    }

    reset() {
        this._repository_to_clone = new RepositoryToClone();
        this.renderRoot.querySelector("sl-tab-group").show(this._tab_panel_1_name);
        //this.renderRoot.querySelector("sl-input#repository-folder-name").value = "";
        //this.renderRoot.querySelector("sl-input#repository-url").value = "";
        //this.renderRoot.querySelector("sl-input#username").value = "";
        this.renderRoot.querySelector("sl-input#personal-access-token").value = "";
        let repository_branches_select = this.renderRoot.querySelector("sl-select#repository-branches");
        repository_branches_select.value = "";
        repository_branches_select.innerHTML = "";
        this.renderRoot.querySelector("sl-button#clone-repository").style.display = "none";
        this.renderRoot.querySelector("sl-button#next-button").style.display = "inline-block";
    }

    _get_repositiory_branches_label() {
        let repository_branches = this.repository_branches;

        if (repository_branches !== undefined) {
            if (repository_branches.length === 1) {
                return `There is only one branch, called '${repository_branches[0]}'. Press the Clone button.`;
            } else {
                return `Select a branch and press the Clone button`;
            }
        }
    }
}

window.customElements.define("adwlm-add-repository-dialog", ADWLMAddRepositoryDialog);

// https://github.com/isomorphic-git/isomorphic-git/blob/51f2ddb1c04e349bfa248a1fbbb9859605f433f2/__tests__/test-hosting-providers.js#L108

// https://github.com/isomorphic-git/test.empty | isomorphic-git-test-push | c1cd7a39b4709db6794a75cee7b89c043b52fd8e
// https://gitlab.com/isomorphic-git/test.empty | isomorphic-git-test-push | g6Q2bv6e6Sca7PKgzNjv
// https://bitbucket.org/isomorphic-git/test.empty | isomorphic-git | nwTZtQKXEExLx3FhWSqT

// MerMEId (granular pat): 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
// GitLab mermeid-classic (classic pat): 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 | repo, user

// https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid.git | teoclaud | aGrcXmKzFAypt57zox-y | read_user, read_repository, write_repository
