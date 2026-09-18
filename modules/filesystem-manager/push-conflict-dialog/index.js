import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";

// shacl-form gives a blank-node value a synthetic identifier of the form
// "<b0_b4_b8_..._<uuid>>" - a traversal-path prefix (which segment of which
// nested property led here) followed by the node's own stable UUID. Two
// independently rendered forms (local vs. remote) assign that prefix
// differently whenever ANYTHING earlier in the document differs, even in a
// totally unrelated field - but the UUID itself stays the same for the same
// underlying node. Strip the prefix so only genuine content differences
// (a different UUID, or a plain literal/IRI value) get flagged.
function normalizeFieldValue(value) {
    const match = value.match(/^<(?:b\d+_)+([0-9a-f-]{36})>$/i);
    return match ? match[1] : value;
}

const styles = css`
    sl-dialog {
        --width: 90vw;
    }
    sl-dialog::part(body) {
        max-height: 60vh;
        overflow-y: auto;
    }
    .intro {
        margin: 0 0 1em 0;
        color: var(--sl-color-neutral-700);
    }
    .bulk-row {
        display: flex;
        gap: 0.5em;
        margin: 0 0 1em 0;
        padding-bottom: 1em;
        border-bottom: 1px solid var(--sl-color-neutral-200);
    }
    .conflict {
        margin-bottom: 1.25em;
    }
    .conflict::part(base) {
        border-color: var(--sl-color-neutral-200);
        border-left: 5px solid var(--conflict-accent, var(--sl-color-neutral-300));
        border-radius: var(--sl-border-radius-medium);
        box-shadow: var(--sl-shadow-x-small);
        overflow: hidden;
    }
    .conflict::part(header) {
        background: var(--sl-color-neutral-50);
    }
    .conflict::part(summary) {
        font-family: var(--sl-font-mono);
        font-size: var(--sl-font-size-small);
        flex: 1;
        min-width: 0;
    }
    .summary-row {
        display: flex;
        align-items: center;
        gap: 0.75em;
        width: 100%;
    }
    .summary-path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }
    .status-icon {
        margin-right: 0.4em;
        vertical-align: -1px;
    }
    .status-icon.undecided {
        color: var(--sl-color-warning-600);
    }
    .status-icon.local {
        color: var(--sl-color-success-600);
    }
    .status-icon.remote {
        color: var(--sl-color-danger-600);
    }
    .status-icon.ignore {
        color: var(--sl-color-neutral-500);
    }
    .note {
        margin: 0 0 0.75em 0;
        color: var(--sl-color-neutral-700);
        font-size: var(--sl-font-size-small);
    }
    .side-by-side {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1em;
        margin-bottom: 0.75em;
    }
    .version-block {
        margin-bottom: 0.75em;
    }
    .version-block h4 {
        margin: 0 0 0.35em 0;
        font-size: var(--sl-font-size-small);
        font-weight: var(--sl-font-weight-semibold);
        color: var(--sl-color-neutral-800);
    }
    .version-block.local h4 {
        color: var(--sl-color-success-700);
    }
    .version-block.remote h4 {
        color: var(--sl-color-danger-700);
    }
    .version-block shacl-form {
        display: block;
        border: 1px solid var(--sl-color-neutral-200);
        border-radius: var(--sl-border-radius-medium);
        padding: 0.5em 0.75em;
        max-height: 320px;
        overflow-y: auto;
    }
    .raw-fallback {
        font-family: var(--sl-font-mono);
        font-size: var(--sl-font-size-x-small);
        white-space: pre-wrap;
        word-break: break-word;
        background: var(--sl-color-neutral-50);
        border: 1px solid var(--sl-color-neutral-200);
        border-radius: var(--sl-border-radius-medium);
        max-height: 260px;
        overflow-y: auto;
        padding: 0.5em 0.75em;
        margin: 0 0 0.75em 0;
    }
    .decision-row {
        display: flex;
        gap: 0.5em;
        flex-shrink: 0;
    }
`;

export default class ADWLMPushConflictDialog extends LitElement {
    static properties = {
        conflicts: {
            type: Array,
            attribute: false,
        },
        // Plain (non-"state") declaration - guaranteed to trigger a
        // re-render on reassignment in every Lit version.
        _decisions: {
            type: Object,
            attribute: false,
        },
    };

    static styles = styles;

    constructor() {
        super();

        this.conflicts = [];
        this._decisions = new Map();
        this._resolved = false;
        // conflict paths already wired up for field highlighting - see
        // _wireUpFormHighlighting().
        this._wiredConflicts = new Set();
        // <shacl-form> elements that already have a scroll listener - unlike
        // _wiredConflicts, this is NOT reset in show(): a reused element's
        // listener is still valid (only the shapesUrl/wiring for
        // highlighting needs redoing), so re-adding it would just stack
        // duplicate listeners.
        this._scrollSyncedForms = new WeakSet();
    }

    _allDecided() {
        return this.conflicts.length > 0
            && this.conflicts.every(conflict => this._decisions.has(conflict.path));
    }

    _choose(path, choice) {
        // Reassign, don't mutate in place, so Lit notices the change.
        const next = new Map(this._decisions);
        next.set(path, choice);
        this._decisions = next;
    }

    // Bulk variant of _choose() - overwrites ALL decisions with the same choice.
    _chooseAll(choice) {
        this._decisions = new Map(this.conflicts.map(conflict => [conflict.path, choice]));
    }

    // Renders one version as a human-readable form (same <shacl-form
    // data-view> as the "Entity Preview" panel) instead of raw Turtle.
    // Falls back to raw content if no shape could be resolved.
    _renderEntityPreview(values, conflict, side) {
        if (!conflict.shapesUrl) {
            return html`<div class="raw-fallback">${values}</div>`;
        }

        // data-conflict-path/data-side are our own markers (shacl-form
        // ignores them) - _wireUpFormHighlighting() below uses them to find
        // this element again and pick local=green/remote=red highlighting.
        return html`
            <shacl-form
                data-values=${values}
                data-values-subject=${conflict.subject}
                data-shapes-url=${conflict.shapesUrl}
                data-conflict-path=${conflict.path}
                data-side=${side}
                data-view
            ></shacl-form>
        `;
    }

    _renderConflictContent(conflict) {
        if (conflict.local === null) {
            return html`
                <p class="note">
                    You deleted this file locally - someone else has changed it online in the meantime.
                    Here's the current online version, which would be lost if you go through with the deletion:
                </p>
                <div class="version-block remote">
                    ${this._renderEntityPreview(conflict.remote, conflict, "remote")}
                </div>
            `;
        }

        if (conflict.remote === null) {
            return html`
                <p class="note">This file was deleted online by someone else. This is your current, not-yet-shared version:</p>
                <div class="version-block local">
                    ${this._renderEntityPreview(conflict.local, conflict, "local")}
                </div>
            `;
        }

        return html`
            <p class="note">This file was changed online by someone else since you last loaded it. Compare both versions and decide which one should apply - differing fields are highlighted in the forms below:</p>
            <div class="side-by-side">
                <div class="version-block local">
                    <h4>Your version (not yet shared)</h4>
                    ${this._renderEntityPreview(conflict.local, conflict, "local")}
                </div>
                <div class="version-block remote">
                    <h4>Current online version</h4>
                    ${this._renderEntityPreview(conflict.remote, conflict, "remote")}
                </div>
            </div>
        `;
    }

    _renderConflict(conflict) {
        const decision = this._decisions.get(conflict.path);
        const statusIcon = !decision
            ? html`<sl-icon class="status-icon undecided" name="exclamation-circle"></sl-icon>`
            : decision === "local"
                ? html`<sl-icon class="status-icon local" name="check-circle"></sl-icon>`
                : decision === "remote"
                    ? html`<sl-icon class="status-icon remote" name="check-circle"></sl-icon>`
                    : html`<sl-icon class="status-icon ignore" name="dash-circle"></sl-icon>`;

        // Same color as the status icon/buttons - left accent bar on the
        // whole card, visible even when collapsed.
        const accentColor = !decision
            ? "var(--sl-color-warning-500)"
            : decision === "local"
                ? "var(--sl-color-success-500)"
                : decision === "remote"
                    ? "var(--sl-color-danger-500)"
                    : "var(--sl-color-neutral-400)";

        return html`
            <sl-details class="conflict" style="--conflict-accent: ${accentColor}" open>
                <div slot="summary" class="summary-row">
                    <span class="summary-path">${statusIcon}${conflict.path}</span>
                    <div
                        class="decision-row"
                        @click=${(event) => event.stopPropagation()}
                    >
                        <sl-button
                            size="small"
                            variant=${decision === "local" ? "success" : "default"}
                            @click=${() => this._choose(conflict.path, "local")}
                        >
                            ${conflict.isLocalDeletion ? "Delete file" : "Keep my version"}
                        </sl-button>
                        <sl-button
                            size="small"
                            variant=${decision === "remote" ? "danger" : "default"}
                            @click=${() => this._choose(conflict.path, "remote")}
                        >
                            Use online version
                        </sl-button>
                        <sl-button
                            size="small"
                            variant=${decision === "ignore" ? "neutral" : "default"}
                            @click=${() => this._choose(conflict.path, "ignore")}
                        >
                            Decide later
                        </sl-button>
                    </div>
                </div>
                ${this._renderConflictContent(conflict)}
            </sl-details>
        `;
    }

    render() {
        return html`
            <sl-dialog label="Sharing conflicts">
                <p class="intro">
                    ${this.conflicts.length} ${this.conflicts.length === 1 ? "file was" : "files were"}
                    also changed online since your last synchronization - probably by someone else.
                    Decide for ${this.conflicts.length === 1 ? "it" : "each file"} which version should apply.
                </p>
                ${this.conflicts.length > 1 ? html`
                    <div class="bulk-row">
                        <sl-button size="small" @click=${() => this._chooseAll("local")}>All: Keep my version</sl-button>
                        <sl-button size="small" @click=${() => this._chooseAll("remote")}>All: Use online version</sl-button>
                    </div>
                ` : ""}
                ${this.conflicts.map(conflict => this._renderConflict(conflict))}
                <sl-button slot="footer" @click=${() => this.hide()}>Cancel</sl-button>
                <sl-button
                    slot="footer"
                    variant="primary"
                    ?disabled=${!this._allDecided()}
                    @click=${() => this._confirm()}
                >
                    Apply and share
                </sl-button>
            </sl-dialog>
        `;
    }

    _confirm() {
        if (!this._allDecided()) {
            return;
        }

        const decisions = this.conflicts.map(conflict => ({
            path: conflict.path,
            choice: this._decisions.get(conflict.path),
            remote: conflict.remote,
            isLocalDeletion: conflict.isLocalDeletion,
        }));

        this._resolved = true;
        this.dispatchEvent(new CustomEvent("adwlm-push-conflict-dialog:resolve", {
            detail: { decisions },
            bubbles: true,
            composed: true,
        }));
        this.hide();
    }

    // No more RDF/SPARQL diffing - shacl-form itself already resolves
    // subjects, sh:or options and nested shapes correctly when it renders;
    // re-deriving that from raw Turtle only meant guessing wrong. Instead,
    // once both the local and remote <shacl-form> for a conflict have
    // finished rendering, this reads what they actually DISPLAY
    // (.property-instance[data-path]/data-value) and highlights whichever
    // fields show a different value - see _compareRenderedForms() below.
    updated(changedProperties) {
        super.updated(changedProperties);
        this._wireUpFormHighlighting();
    }

    _wireUpFormHighlighting() {
        const formsByPath = new Map();
        for (const form of this.renderRoot.querySelectorAll("shacl-form[data-conflict-path]")) {
            const path = form.dataset.conflictPath;
            if (!formsByPath.has(path)) {
                formsByPath.set(path, []);
            }
            formsByPath.get(path).push(form);
        }

        for (const [path, forms] of formsByPath) {
            if (this._wiredConflicts.has(path) || forms.length < 2) {
                continue; // already wired, or a single-sided (deletion) conflict - nothing to compare
            }
            this._wiredConflicts.add(path);

            const localForm = forms.find(form => form.dataset.side === "local");
            const remoteForm = forms.find(form => form.dataset.side === "remote");
            if (!localForm || !remoteForm) {
                continue;
            }

            this._wireScrollSync(localForm, remoteForm);

            let pending = 2;
            const onBothSettled = () => {
                pending--;
                if (pending === 0) {
                    this._compareRenderedForms(localForm, remoteForm);
                }
            };
            this._runOnceSettled(localForm, onBothSettled);
            this._runOnceSettled(remoteForm, onBothSettled);
        }
    }

    // Scrolling one side scrolls the other to the same relative position
    // (proportional, not 1:1 pixels - the two versions can differ slightly
    // in height), so corresponding fields stay roughly aligned. <shacl-form>
    // itself is the scrollable element (see .version-block shacl-form's
    // overflow-y: auto).
    _wireScrollSync(localForm, remoteForm) {
        if (this._scrollSyncedForms.has(localForm) || this._scrollSyncedForms.has(remoteForm)) {
            return; // already wired from a previous show() reusing this element
        }
        this._scrollSyncedForms.add(localForm);
        this._scrollSyncedForms.add(remoteForm);

        // Whichever side the user is actively scrolling "drives" the sync
        // for a short window after their last scroll event. A plain
        // synchronous re-entrancy flag doesn't work here: the "scroll"
        // event our own target.scrollTop write triggers is dispatched
        // asynchronously by the browser, well after such a flag would
        // already have been reset - so both sides kept re-triggering each
        // other (visible as jank/stutter) instead of being suppressed.
        let activeSource = null;
        let releaseActiveTimeout;
        let pendingFrame = null;

        const applySync = (source, target) => {
            pendingFrame = null;
            const sourceRange = source.scrollHeight - source.clientHeight;
            const targetRange = target.scrollHeight - target.clientHeight;
            target.scrollTop = sourceRange > 0 && targetRange > 0
                ? (source.scrollTop / sourceRange) * targetRange
                : source.scrollTop;
        };

        const onScroll = (source, target) => {
            if (activeSource && activeSource !== source) {
                return; // this is the mirrored write's own echo, not a real user scroll
            }
            activeSource = source;
            clearTimeout(releaseActiveTimeout);
            releaseActiveTimeout = setTimeout(() => { activeSource = null; }, 150);

            // Coalesce to at most one write per frame - "scroll" can fire
            // far more often than that during a fast gesture.
            if (pendingFrame === null) {
                pendingFrame = requestAnimationFrame(() => applySync(source, target));
            }
        };

        localForm.addEventListener("scroll", () => onScroll(localForm, remoteForm));
        remoteForm.addEventListener("scroll", () => onScroll(remoteForm, localForm));
    }

    // shacl-form renders its fields incrementally (simple literals near-
    // instantly, linked-resource lookups later), and its "loading" attribute
    // isn't a usable "done" signal (can clear before OR after the real
    // content settles - confirmed the hard way). So instead: watch its
    // shadow root and consider it settled once no further DOM mutation
    // happens for a short quiet period, capped by an absolute safety net.
    _runOnceSettled(form, onSettled) {
        if (!form.shadowRoot) {
            onSettled();
            return;
        }

        let settled = false;
        let quietTimeout;
        const settle = () => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(quietTimeout);
            clearTimeout(safetyTimeout);
            observer.disconnect();
            onSettled();
        };

        const observer = new MutationObserver(() => {
            clearTimeout(quietTimeout);
            quietTimeout = setTimeout(settle, 500);
        });
        observer.observe(form.shadowRoot, { childList: true, subtree: true });
        quietTimeout = setTimeout(settle, 500);
        const safetyTimeout = setTimeout(settle, 10000);
    }

    _compareRenderedForms(localForm, remoteForm) {
        this._compareScope(localForm.shadowRoot, remoteForm.shadowRoot);
    }

    // Compares the DIRECT .property-instance fields of one scope (a form's
    // shadow root, or one specific nested <shacl-node>) - deliberately
    // never crosses into a nested <shacl-node>'s own .property-instance
    // elements here. The same predicate IRI (e.g. rdfs:label) is reused
    // independently by many different nested sub-entities (repeatable
    // compound properties), so flattening the whole shadow root into one
    // form-wide bucket per path would wrongly conflate all of them into a
    // single "different" verdict - see _comparePathGroup() below, which
    // recurses into matched compound pairs with their own fresh scope.
    _compareScope(localScope, remoteScope) {
        const localGroups = this._groupDirectInstances(localScope);
        const remoteGroups = this._groupDirectInstances(remoteScope);

        for (const path of new Set([...localGroups.keys(), ...remoteGroups.keys()])) {
            this._comparePathGroup(localGroups.get(path) ?? [], remoteGroups.get(path) ?? []);
        }
    }

    _groupDirectInstances(scope) {
        const groups = new Map();
        if (!scope) {
            return groups;
        }
        for (const instance of scope.querySelectorAll(".property-instance[data-path]")) {
            // Skip instances belonging to a NESTED <shacl-node> further
            // down (i.e. nested inside another .property-instance within
            // this same scope) - those are handled by their own, separate
            // _compareScope() call from _comparePathGroup() below.
            const ancestorInstance = instance.parentElement?.closest(".property-instance");
            if (ancestorInstance && scope.contains(ancestorInstance)) {
                continue;
            }
            const path = instance.dataset.path;
            if (!groups.has(path)) {
                groups.set(path, []);
            }
            groups.get(path).push(instance);
        }
        return groups;
    }

    // Pairs instances by their OWN normalized identity (the value itself
    // for a plain literal/IRI, or the stable part of a compound value's
    // synthetic blank-node id - see normalizeFieldValue()) rather than by
    // array position, so reordered-but-otherwise-unchanged repeated values
    // don't get flagged either.
    _comparePathGroup(localInstances, remoteInstances) {
        const localByIdentity = new Map(localInstances.map(instance => [normalizeFieldValue(instance.dataset.value ?? ""), instance]));
        const remoteByIdentity = new Map(remoteInstances.map(instance => [normalizeFieldValue(instance.dataset.value ?? ""), instance]));

        for (const identity of new Set([...localByIdentity.keys(), ...remoteByIdentity.keys()])) {
            const localInstance = localByIdentity.get(identity);
            const remoteInstance = remoteByIdentity.get(identity);

            if (localInstance && remoteInstance) {
                // Same identity on both sides. A compound value (wraps a
                // nested <shacl-node>) - recurse into ITS OWN fields
                // instead of coloring this wrapper: CSS color inherits
                // into children, which would wrongly highlight every
                // still-identical nested field too.
                const localNode = localInstance.querySelector(":scope > shacl-node");
                const remoteNode = remoteInstance.querySelector(":scope > shacl-node");
                if (localNode || remoteNode) {
                    this._compareScope(localNode, remoteNode);
                }
                // else: a plain leaf value with matching identity - identical, nothing to do.
                continue;
            }

            // Present on only one side - genuinely added/removed/replaced.
            if (localInstance) {
                localInstance.style.setProperty("color", "var(--sl-color-success-600)", "important");
            }
            if (remoteInstance) {
                remoteInstance.style.setProperty("color", "var(--sl-color-danger-600)", "important");
            }
        }
    }

    firstUpdated() {
        const render_root = this.renderRoot;
        const dialog = render_root.querySelector("sl-dialog");

        // Closing any other way (Escape, outside click, "x", "Abbrechen") is
        // a cancel. Guarded by _resolved so confirm's own hide() doesn't also
        // fire one. "sl-after-hide" bubbles from <sl-details> too (same
        // Shoelace convention) - only react to the dialog's own event.
        dialog.addEventListener("sl-after-hide", (event) => {
            if (event.target !== dialog) {
                return;
            }
            if (!this._resolved) {
                this.dispatchEvent(new CustomEvent("adwlm-push-conflict-dialog:cancel", {
                    bubbles: true,
                    composed: true,
                }));
            }
            this._decisions = new Map();
        });
    }

    show() {
        this._decisions = new Map();
        this._resolved = false;
        // Reused <shacl-form> elements get a fresh data-shapes-url blob URL
        // every time (see _getShapeUrlForPath()), forcing a rebuild - so
        // wiring/highlighting has to run fresh on every show() too.
        this._wiredConflicts = new Set();

        this.renderRoot.querySelector("sl-dialog").show();
    }

    hide() {
        this.renderRoot.querySelector("sl-dialog").hide();
    }
}

window.customElements.define("adwlm-push-conflict-dialog", ADWLMPushConflictDialog);
