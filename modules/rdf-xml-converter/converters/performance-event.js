import { generatePerformanceEventXML } from '../templates/performance-event.js';

export class PerformanceEventConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const performanceEventData = {
            subjectUri: '',
            label: '',
            classification: '',
            venue: '',
            location: '',
            duration: '',
            description: '',
            annotation: [],
            sameAs: [],
            date: {
                value: '',
                startDate: '',
                endDate: '',
                notBefore: '',
                notAfter: '',
                certainty: '',
                dateDescription: ''
            },
            contributions: [],
            citations: []
        };

        const byId = {};

        // Extract other data from JSON-LD
        jsonLdData.forEach(item => {

            // Check descriptions based on their subject IDs
            if (item['https://schema.org/description']) {
                if (item['@id'] === dateObjectId) {
                    // This is the date description
                    performanceEventData.date.dateDescription = item['https://schema.org/description']['@value'];
                } else if (item['@id'] === performanceEventData.subjectUri) {
                    // This is the event description
                    performanceEventData.description = item['https://schema.org/description']['@value'];
                }
            }
            if (item['http://www.w3.org/2002/07/owl#sameAs']) {
                performanceEventData.sameAs.push(item['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (item['https://schema.org/citation']) {
                performanceEventData.citations.push(item['https://schema.org/citation']['@id']);
            }
            if (item['@id']) {
                if (!byId[item['@id']]) {
                    byId[item['@id']] = { ...item };
                } else {
                    // Merge properties (arrays for repeated keys)
                    for (const key in item) {
                        if (key === '@id') continue;
                        if (byId[item['@id']][key]) {
                            // If already array, push; else, make array
                            if (!Array.isArray(byId[item['@id']][key])) {
                                byId[item['@id']][key] = [byId[item['@id']][key]];
                            }
                            byId[item['@id']][key].push(item[key]);
                        } else {
                            byId[item['@id']][key] = item[key];
                        }
                    }
                }
            }
        });

        // --- Find main Work object ---
        const main = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#PerformanceEvent'
        );
        if (!main) return '';

        performanceEventData.subjectUri = main['@id'];

        if (main['http://www.w3.org/2000/01/rdf-schema#label']) {
            performanceEventData.label = main['http://www.w3.org/2000/01/rdf-schema#label']['@value'];
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasClassification']) {
            performanceEventData.classification = main['https://lod.academy/melod/vocab/ontology#hasClassification']['@value'];
        }
        if (main['https://lod.academy/melod/vocab/ontology#hasVenue']) {
            performanceEventData.venue = main['https://lod.academy/melod/vocab/ontology#hasVenue']['@id'];
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasDuration']) {
            performanceEventData.duration = main['https://lod.academy/melod/vocab/ontology#hasDuration']['@id'];
        }

        // --- Annotations ---
        let annotationLinks = main['https://lod.academy/melod/vocab/ontology#hasAnnotation'];
        if (annotationLinks) {
            if (!Array.isArray(annotationLinks)) annotationLinks = [annotationLinks];
            performanceEventData.annotation = annotationLinks
                .map(link => parseAnnotation(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Creation Date ---
        let dateLink = main['https://lod.academy/melod/vocab/ontology#hasEventDate'];
        if (dateLink) {
            performanceEventData.date = parseDate(dateLink['@id'], byId);
        }

        // --- Contribution ---
        let contributorsLinks = main['https://lod.academy/melod/vocab/ontology#hasContribution'];
        if (contributorsLinks) {
            if (!Array.isArray(contributorsLinks)) contributorsLinks = [contributorsLinks];
            performanceEventData.contributors = contributorsLinks
                .map(link => parseContribution(link['@id'], byId))
                .filter(Boolean);
        }

        // Helper: Parse Annotations
        function parseAnnotation(id, byId) {
            const obj = byId[id];
            if (!obj) return null;
            const annotation = {};

            // Label
            if (obj['http://www.w3.org/2000/01/rdf-schema#label']) {
                annotation.label = obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '';
            }

            // paragraph
            const paragraph = obj['https://lod.academy/melod/vocab/ontology#paragraph'];
            if (paragraph) {
                annotation.paragraph = [];

                if (Array.isArray(paragraph)) {
                    for (const item of paragraph) {
                        if (item['@value']) {
                            annotation.paragraph.push(item['@value']);
                        }
                    }
                } else if (paragraph['@value']) {
                    annotation.paragraph.push(paragraph['@value']);
                }
            }
            
            return annotation;
        }

        // Helper: Parse Date
        function parseDate(id, byId) {
            const obj = byId[id];
            if (!obj) return null;
            const date = {};

            // isodate
            if (obj['https://lod.academy/melod/vocab/ontology#isodate']) {
                date.value = obj['https://lod.academy/melod/vocab/ontology#isodate']['@value'] || '';
            }

            // startDate
            if (obj['https://schema.org/startDate']) {
                date.startDate = obj['https://schema.org/startDate']['@value'] || '';
            }

            // endDate
            if (obj['https://schema.org/endDate']) {
                date.endDate = obj['https://schema.org/endDate']['@value'] || '';
            }

            // not before
            if (obj['https://lod.academy/melod/vocab/ontology#notBefore']) {
                date.notBefore = obj['https://lod.academy/melod/vocab/ontology#notBefore']['@value'] || '';
            }

            // not after
            if (obj['https://lod.academy/melod/vocab/ontology#notAfter']) {
                date.notAfter = obj['https://lod.academy/melod/vocab/ontology#notAfter']['@value'] || '';
            }

            // certainty
            if (obj['https://lod.academy/melod/vocab/ontology#hasCertainty']) {
                date.certainty = obj['https://lod.academy/melod/vocab/ontology#hasCertainty']['@id'] || '';
            }

            // description
            if (obj['https://schema.org/description']) {
                date.dateDescription = obj['https://schema.org/description']['@value'] || '';
            }

            return date;
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

        // Debug logging
        //console.log('Processed contributions:', performanceEventData.contributions);

        return generatePerformanceEventXML(performanceEventData);
    }
}