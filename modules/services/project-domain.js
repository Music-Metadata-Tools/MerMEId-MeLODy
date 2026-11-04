// IRI prefix ("projectDomain") of a repository and IRI <-> file path helpers.

export const DEFAULT_PROJECT_DOMAIN = "urn:uuid:";

// projectDomain from config.json, default "urn:uuid:", always ending with "/", "#" or ":".
export function getProjectDomain(config) {
    const domain = typeof config?.projectDomain === "string" ? config.projectDomain.trim() : "";

    if (domain === "") {
        return DEFAULT_PROJECT_DOMAIN;
    }

    if (/[/#:]$/.test(domain)) {
        return domain;
    }

    return domain.startsWith("urn:") ? `${domain}:` : `${domain}/`;
}

// Entity IRI -> "<folder>/<id>" (file path without ".ttl"), for any prefix.
export function iriToEntityPath(iri) {
    return String(iri).split(/[/:#]/).filter(Boolean).slice(-2).join("/");
}

// Subject IRI for entityPath: domain or "urn:uuid:" prefix, whichever occurs in the turtle content.
export function findEntityIri(entityPath, turtle, domain) {
    const candidates = [`${domain}${entityPath}`, `${DEFAULT_PROJECT_DOMAIN}${entityPath}`];
    return candidates.find(iri => turtle?.includes(`<${iri}>`)) ?? candidates[0];
}
