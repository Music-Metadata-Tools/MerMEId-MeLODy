import { generateInstitutionXML } from '../templates/institution.js';

export class InstitutionConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const institutionData = {
            subjectUri: '',
            name: '',
            abbreviation: '',
            location: '',
            address: '',
            date: {
                value: '',
                startDate: '',
                endDate: '',
                notBefore: '',
                notAfter: '',
                certainty: '',
                dateDescription: ''
            },
            description: '',
            sameAs: []
        };

        // Find the date object ID
        const dateObjectId = jsonLdData.find(item => 
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Date'
        )?.['@id'];

        // Extract data from JSON-LD
        jsonLdData.forEach(item => {
            if (item['@id'] && !item['@id'].startsWith('_:')) {
                institutionData.subjectUri = item['@id'];
            }
            if (item['https://schema.org/name']) {
                institutionData.name = item['https://schema.org/name']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasAbbreviation']) {
                institutionData.abbreviation = item['https://lod.academy/melod/vocab/ontology#hasAbbreviation']['@value'];
            }
            if (item['https://schema.org/location']) {
                institutionData.location = item['https://schema.org/location']['@id'];
            }
            if (item['https://schema.org/address']) {
                institutionData.address = item['https://schema.org/address']['@value'];
            }

            // Check descriptions based on their subject IDs
            if (item['https://schema.org/description']) {
                if (item['@id'] === dateObjectId) {
                    // This is the date description
                    institutionData.date.dateDescription = item['https://schema.org/description']['@value'];
                } 
                
                else if (item['@id'] === institutionData.subjectUri) {
                    // This is the institution description
                    institutionData.description = item['https://schema.org/description']['@value'];
                }
            }
            if (item['http://www.w3.org/2002/07/owl#sameAs']) {
                institutionData.sameAs.push(item['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }

            // Handle date information
            if (item['https://lod.academy/melod/vocab/ontology#isodate']) {
                institutionData.date.value = item['https://lod.academy/melod/vocab/ontology#isodate']['@value'];
            }
            if (item['https://schema.org/startDate']) {
                institutionData.date.startDate = item['https://schema.org/startDate']['@value'];
            }
            if (item['https://schema.org/endDate']) {
                institutionData.date.endDate = item['https://schema.org/endDate']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#notBefore']) {
                institutionData.date.notBefore = item['https://lod.academy/melod/vocab/ontology#notBefore']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#notAfter']) {
                institutionData.date.notAfter = item['https://lod.academy/melod/vocab/ontology#notAfter']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasCertainty']) {
                institutionData.date.certainty = item['https://lod.academy/melod/vocab/ontology#hasCertainty']['@id'];
            }

        });

        return generateInstitutionXML(institutionData);
    }
}