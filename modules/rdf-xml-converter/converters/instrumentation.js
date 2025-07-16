import { generateInstrumentationXML } from '../templates/instrumentation.js';

export class InstrumentationConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const instrumentationData = {
            subjectUri: '',
            label: '',
            details: [],
            groups: []
        };

        // --- Merge all objects with the same @id ---
        const byId = {};
        jsonLdData.forEach(obj => {
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

        // --- Find main Instrumentation object ---
        const main = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Instrumentation'
        );
        if (!main) return '';

        instrumentationData.subjectUri = main['@id'];
        instrumentationData.label = main['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '';

        // --- InstrumentationDetail(s) ---
        let detailLinks = main['https://lod.academy/melod/vocab/ontology#hasInstrumentationDetail'];
        if (detailLinks) {
            if (!Array.isArray(detailLinks)) detailLinks = [detailLinks];
            instrumentationData.details = detailLinks
                .map(link => parseDetail(link['@id'], byId))
                .filter(Boolean);
        }

        // --- InstrumentationGroup(s) ---
        let groupLinks = main['https://lod.academy/melod/vocab/ontology#hasInstrumentationGroup'];
        if (groupLinks) {
            if (!Array.isArray(groupLinks)) groupLinks = [groupLinks];
            instrumentationData.groups = groupLinks
                .map(link => parseGroup(link['@id'], byId))
                .filter(Boolean);
        }

        return generateInstrumentationXML(instrumentationData);
    }
}

// Helper: Parse InstrumentationDetail recursively
function parseDetail(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const detail = {};

    // Medium
    if (obj['http://data.doremus.org/ontology#U2_foresees_use_of_medium_of_performance']) {
        detail.medium = obj['http://data.doremus.org/ontology#U2_foresees_use_of_medium_of_performance']['@id'];
    }
    // Link (sameAs)
    const sameAs = obj['http://www.w3.org/2002/07/owl#sameAs'];
    if (sameAs) {
        if (Array.isArray(sameAs)) {
            detail.link = sameAs.map(l => l['@id']);
        } else {
            detail.link = [sameAs['@id']];
        }
    }
    
    // Quantity
    if (obj['http://data.doremus.org/ontology#U30_foresees_quantity_of_medium_of_performance']) {
        detail.quantity = parseInt(obj['http://data.doremus.org/ontology#U30_foresees_quantity_of_medium_of_performance']['@value'], 10);
    }
    // Soloist
    if (obj['https://lod.academy/melod/vocab/ontology#isSoloist']) {
        detail.solo = obj['https://lod.academy/melod/vocab/ontology#isSoloist']['@value'] === 'true';
    }
    // Ad Lib
    if (obj['https://lod.academy/melod/vocab/ontology#isAdLib']) {
        detail.adLib = obj['https://lod.academy/melod/vocab/ontology#isAdLib']['@value'] === 'true';
    }
    // Alternative Instrumentation (recursive)
    if (obj['https://lod.academy/melod/vocab/ontology#hasAlternativeInstrumentation']) {
        let alt = obj['https://lod.academy/melod/vocab/ontology#hasAlternativeInstrumentation'];
        if (!Array.isArray(alt)) alt = [alt];
        detail.alternativeInstrumentation = alt
            .map(a => parseDetail(a['@id'], byId))
            .filter(Boolean);
    }
    // Casting Detail
    if (obj['https://lod.academy/melod/vocab/ontology#hasCastingDetail']) {
        const castId = obj['https://lod.academy/melod/vocab/ontology#hasCastingDetail']['@id'];
        detail.castingDetail = parseCastingDetail(castId, byId);
    }

    return detail;
}

// Helper: Parse InstrumentationGroup
function parseGroup(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const group = {
        label: obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '',
        details: []
    };
    let detailLinks = obj['https://lod.academy/melod/vocab/ontology#hasInstrumentationDetail'];
    if (detailLinks) {
        if (!Array.isArray(detailLinks)) detailLinks = [detailLinks];
        group.details = detailLinks
            .map(link => parseDetail(link['@id'], byId))
            .filter(Boolean);
    }
    return group;
}

// Helper: Parse CastingDetail
function parseCastingDetail(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const casting = {
        roleName: obj['https://lod.academy/melod/vocab/ontology#hasRoleName']?.['@value'] || ''
    };
    if (obj['https://lod.academy/melod/vocab/ontology#hasRoleDesc']) {
        casting.roleDescription = obj['https://lod.academy/melod/vocab/ontology#hasRoleDesc']['@value'];
    }
    return casting;
}