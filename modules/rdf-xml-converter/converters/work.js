import { generateWorkXML } from '../templates/work.js';

export class WorkConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const workData = {
            subjectUri: '',
            titles: [],
            identifiers: [],
            sameAs: [],
            contributors: [],
            workStatus: '',
            citations: [],
            description: [],
            context: '',
            historyDescription: '',
            expressions: [],
            isPartOf: [],
            hasPart: [],
            otherRelations: [],
            classification: []
        };

        // --- Merge all objects with the same @id ---
        const byId = {};
        jsonLdData.forEach(obj => {
            if (obj['http://www.w3.org/2002/07/owl#sameAs'] && !obj['@id'].startsWith('_:')) {
                workData.sameAs.push(obj['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (obj['https://schema.org/citation'] && !obj['@id'].startsWith('_:')) {
                workData.citations.push(obj['https://schema.org/citation']['@id']);
            }
            if (obj['https://schema.org/description'] && !obj['@id'].startsWith('_:')) {
                workData.description.push(obj['https://schema.org/description']['@value']) || '';
            }
            if (obj['http://www.cidoc-crm.org/efrbroo/R9_is_realised_in'] && !obj['@id'].startsWith('_:')) {
                workData.expressions.push(obj['http://www.cidoc-crm.org/efrbroo/R9_is_realised_in']['@id']);
            }

            if (obj['https://schema.org/isPartOf'] && !obj['@id'].startsWith('_:')) {
                workData.isPartOf.push(obj['https://schema.org/isPartOf']['@id']);
            }

            if (obj['https://schema.org/hasPart'] && !obj['@id'].startsWith('_:')) {
                workData.hasPart.push(obj['https://schema.org/hasPart']['@id']);
            }

            if (obj['https://lod.academy/melod/vocab/ontology#hasClassification'] && !obj['@id'].startsWith('_:')) {
                workData.classification.push(obj['https://lod.academy/melod/vocab/ontology#hasClassification']['@id']);
            }
            if (obj['@id']) {
                if (!byId[obj['@id']]) {
                    byId[obj['@id']] = { ...obj };
                } else {
                    // Merge properties (arrays for repeated keys)
                    for (const key in obj) {
                        if (key === '@id') continue;
                        if (byId[obj['@id']][key]) {
                            // If already array, push; else, make array
                            if (!Array.isArray(byId[obj['@id']][key])) {
                                byId[obj['@id']][key] = [byId[obj['@id']][key]];
                            }
                            byId[obj['@id']][key].push(obj[key]);
                        } else {
                            byId[obj['@id']][key] = obj[key];
                        }
                    }
                }
            }
        });

        // --- Find main Work object ---
        const main = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Work'
        );
        if (!main) return '';

        workData.subjectUri = main['@id'];

        if (main['https://schema.org/creativeWorkStatus']) {
            workData.workStatus = main['https://schema.org/creativeWorkStatus']['@value'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasContext']) {
            workData.context = main['https://lod.academy/melod/vocab/ontology#hasContext']['@value'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasHistoryDesc']) {
            workData.historyDescription = main['https://lod.academy/melod/vocab/ontology#hasHistoryDesc']['@value'] || '';
        }

        // --- Title ---
        let titleLinks = main['https://lod.academy/melod/vocab/ontology#hasTitle'];
        if (titleLinks) {
            if (!Array.isArray(titleLinks)) titleLinks = [titleLinks];
            workData.titles = titleLinks
                .map(link => parseTitle(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Identifier ---
        let identifierLinks = main['https://lod.academy/melod/vocab/ontology#hasIdentifier'];
        if (identifierLinks) {
            if (!Array.isArray(identifierLinks)) identifierLinks = [identifierLinks];
            workData.identifiers = identifierLinks
                .map(link => parseIdentifier(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Contribution ---
        let contributorsLinks = main['https://lod.academy/melod/vocab/ontology#hasContribution'];
        if (contributorsLinks) {
            if (!Array.isArray(contributorsLinks)) contributorsLinks = [contributorsLinks];
            workData.contributors = contributorsLinks
                .map(link => parseContribution(link['@id'], byId))
                .filter(Boolean);
        }

        // Debug logging
        console.log('Processed work:', workData);

        return generateWorkXML(workData);
    }
}

// Helper: Parse Titles
function parseTitle(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const title = {};

    // Title and language
    if (obj['http://www.w3.org/2000/01/rdf-schema#label']) {
        title.title = obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '';
        title.language = obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@language'] || '';
    }
    // TitleType
    if (obj['https://lod.academy/melod/vocab/ontology#hasTitleType']) {
        title.titleType = obj['https://lod.academy/melod/vocab/ontology#hasTitleType']['@id'];
    }
    return title;
}

// Helper: Parse Identifiers
function parseIdentifier(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const identifier = {};

    // Label
    if (obj['http://www.w3.org/2000/01/rdf-schema#label']) {
        identifier.label = obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '';
    }
    // Value
    if (obj['http://www.w3.org/2002/07/owl#hasValue']) {
        identifier.value = obj['http://www.w3.org/2002/07/owl#hasValue']?.['@value'] || '';
    }
    return identifier;
}

// Helper: Parse Contribution
function parseContribution(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const contribution = {};

    // Agent
    if (obj['https://lod.academy/melod/vocab/ontology#hasAgent']) {
        contribution.agent = obj['https://lod.academy/melod/vocab/ontology#hasAgent']['@id'];
    }
    // Role
    if (obj['https://lod.academy/melod/vocab/ontology#hasRole']) {
        contribution.role = obj['https://lod.academy/melod/vocab/ontology#hasRole']['@id'];
    }
    // Certainty
    if (obj['https://lod.academy/melod/vocab/ontology#hasCertainty']) {
        contribution.certainty = obj['https://lod.academy/melod/vocab/ontology#hasCertainty']['@id'];
    }
    return contribution;
}