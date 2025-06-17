import { generatePerformanceEventXML } from './template.js';

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
            duration: '',
            description: '',
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

        // Find the date object ID
        const dateObjectId = jsonLdData.find(item => 
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Date'
        )?.['@id'];

        // Find contribution objects
        const contributionObjects = jsonLdData.filter(item => 
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Contribution'
        );

        // Process each contribution object
        contributionObjects.forEach(contribObj => {
            const id = contribObj['@id'];
            const contribution = {
                agent: '',
                role: '',
                certainty: ''
            };

            // Find all items related to this contribution
            const contribItems = jsonLdData.filter(item => item['@id'] === id);
            
            contribItems.forEach(item => {
                if (item['https://lod.academy/melod/vocab/ontology#hasAgent']) {
                    contribution.agent = item['https://lod.academy/melod/vocab/ontology#hasAgent']['@id'];
                }
                if (item['https://lod.academy/melod/vocab/ontology#hasRole']) {
                    contribution.role = item['https://lod.academy/melod/vocab/ontology#hasRole']['@id'];
                }
                if (item['https://lod.academy/melod/vocab/ontology#hasCertainty']) {
                    contribution.certainty = item['https://lod.academy/melod/vocab/ontology#hasCertainty']['@id'];
                }
            });

            if (contribution.agent) {
                performanceEventData.contributions.push(contribution);
            }
        });

        // Extract other data from JSON-LD
        jsonLdData.forEach(item => {
            if (item['@id'] && !item['@id'].startsWith('_:')) {
                performanceEventData.subjectUri = item['@id'];
            }

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
            
            if (item['http://www.w3.org/2000/01/rdf-schema#label']) {
                performanceEventData.label = item['http://www.w3.org/2000/01/rdf-schema#label']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasClassification']) {
                performanceEventData.classification = item['https://lod.academy/melod/vocab/ontology#hasClassification']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasVenue']) {
                performanceEventData.venue = item['https://lod.academy/melod/vocab/ontology#hasVenue']['@id'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasDuration']) {
                performanceEventData.duration = item['https://lod.academy/melod/vocab/ontology#hasDuration']['@id'];
            }
            if (item['http://www.w3.org/2002/07/owl#sameAs']) {
                performanceEventData.sameAs.push(item['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (item['https://schema.org/citation']) {
                performanceEventData.citations.push(item['https://schema.org/citation']['@id']);
            }

            // Handle date information
            if (item['https://lod.academy/melod/vocab/ontology#isodate']) {
                performanceEventData.date.value = item['https://lod.academy/melod/vocab/ontology#isodate']['@value'];
            }
            if (item['https://schema.org/startDate']) {
                performanceEventData.date.startDate = item['https://schema.org/startDate']['@value'];
            }
            if (item['https://schema.org/endDate']) {
                performanceEventData.date.endDate = item['https://schema.org/endDate']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#notBefore']) {
                performanceEventData.date.notBefore = item['https://lod.academy/melod/vocab/ontology#notBefore']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#notAfter']) {
                performanceEventData.date.notAfter = item['https://lod.academy/melod/vocab/ontology#notAfter']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasCertainty']) {
                performanceEventData.date.certainty = item['https://lod.academy/melod/vocab/ontology#hasCertainty']['@id'];
            }
        });

        // Debug logging
        console.log('Processed contributions:', performanceEventData.contributions);

        return generatePerformanceEventXML(performanceEventData);
    }
}