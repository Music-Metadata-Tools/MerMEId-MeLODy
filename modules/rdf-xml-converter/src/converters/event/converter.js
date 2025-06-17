import { generateEventXML } from './template.js';

export class EventConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const eventData = {
            subjectUri: '',
            label: '',
            classification: '',
            location: '',
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
                eventData.contributions.push(contribution);
            }
        });

        // Extract other data from JSON-LD
        jsonLdData.forEach(item => {
            if (item['@id'] && !item['@id'].startsWith('_:')) {
                eventData.subjectUri = item['@id'];
            }

            // Check descriptions based on their subject IDs
            if (item['https://schema.org/description']) {
                if (item['@id'] === dateObjectId) {
                    // This is the date description
                    eventData.date.dateDescription = item['https://schema.org/description']['@value'];
                } else if (item['@id'] === eventData.subjectUri) {
                    // This is the event description
                    eventData.description = item['https://schema.org/description']['@value'];
                }
            }
            
            if (item['http://www.w3.org/2000/01/rdf-schema#label']) {
                eventData.label = item['http://www.w3.org/2000/01/rdf-schema#label']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasClassification']) {
                eventData.classification = item['https://lod.academy/melod/vocab/ontology#hasClassification']['@value'];
            }
            if (item['https://schema.org/location']) {
                eventData.location = item['https://schema.org/location']['@id'];
            }
            if (item['http://www.w3.org/2002/07/owl#sameAs']) {
                eventData.sameAs.push(item['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (item['https://schema.org/citation']) {
                eventData.citations.push(item['https://schema.org/citation']['@id']);
            }

            // Handle date information
            if (item['https://lod.academy/melod/vocab/ontology#isodate']) {
                eventData.date.value = item['https://lod.academy/melod/vocab/ontology#isodate']['@value'];
            }
            if (item['https://schema.org/startDate']) {
                eventData.date.startDate = item['https://schema.org/startDate']['@value'];
            }
            if (item['https://schema.org/endDate']) {
                eventData.date.endDate = item['https://schema.org/endDate']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#notBefore']) {
                eventData.date.notBefore = item['https://lod.academy/melod/vocab/ontology#notBefore']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#notAfter']) {
                eventData.date.notAfter = item['https://lod.academy/melod/vocab/ontology#notAfter']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasCertainty']) {
                eventData.date.certainty = item['https://lod.academy/melod/vocab/ontology#hasCertainty']['@id'];
            }
        });

        // Debug logging
        console.log('Processed contributions:', eventData.contributions);

        return generateEventXML(eventData);
    }
}