import { generateBibliographyXML } from './template.js';

export class BibliographyConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const bibliographyData = {
            subjectUri: '',
            genre: '',
            classification: '',
            title: '',
            titleType: '',
            abbreviation: '',
            sameAs: '',
            isPartOf: '',
            authors: [],
            editors: [],
            publication: {
                label: '',
                startDate: '',
                endDate: '',
                publisher: '',
                location: '',
                description: ''
            },
            position: '',
            pagination: '',
            materialExtent: '',
            language: '',
            description: ''
        };

        // Find the title object ID
        const titleObjectId = jsonLdData.find(item => 
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Title'
        )?.['@id'];

        // Find publication event object ID
        const publicationObjectId = jsonLdData.find(item =>
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://schema.org/PublicationEvent'
        )?.['@id'];

        jsonLdData.forEach(item => {
            if (item['@id'] && !item['@id'].startsWith('_:')) {
                bibliographyData.subjectUri = item['@id'];
            }

            // Main bibliography properties
            if (item['https://schema.org/genre']) {
                bibliographyData.genre = item['https://schema.org/genre']['@id'].split('#')[1];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasClassification']) {
                bibliographyData.classification = item['https://lod.academy/melod/vocab/ontology#hasClassification']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasAbbreviation']) {
                bibliographyData.abbreviation = item['https://lod.academy/melod/vocab/ontology#hasAbbreviation']['@value'];
            }
            if (item['http://www.w3.org/2002/07/owl#sameAs']) {
                bibliographyData.sameAs = item['http://www.w3.org/2002/07/owl#sameAs']['@id'];
            }
            if (item['https://schema.org/isPartOf']) {
                bibliographyData.isPartOf = item['https://schema.org/isPartOf']['@id'];
            }

            // Title properties
            if (item['@id'] === titleObjectId) {
                if (item['http://www.w3.org/2000/01/rdf-schema#label']) {
                    bibliographyData.title = item['http://www.w3.org/2000/01/rdf-schema#label']['@value'];
                }
                if (item['https://lod.academy/melod/vocab/ontology#hasTitleType']) {
                    bibliographyData.titleType = item['https://lod.academy/melod/vocab/ontology#hasTitleType']['@id'].split('#')[1];
                }
            }

            // Publication event properties
            if (item['@id'] === publicationObjectId) {
                if (item['http://www.w3.org/2000/01/rdf-schema#label']) {
                    bibliographyData.publication.label = item['http://www.w3.org/2000/01/rdf-schema#label']['@value'];
                }
                if (item['https://schema.org/startDate']) {
                    bibliographyData.publication.startDate = item['https://schema.org/startDate']['@value'];
                }
                if (item['https://schema.org/endDate']) {
                    bibliographyData.publication.endDate = item['https://schema.org/endDate']['@value'];
                }
                if (item['https://schema.org/publishedBy']) {
                    bibliographyData.publication.publisher = item['https://schema.org/publishedBy']['@id'];
                }
                if (item['https://schema.org/location']) {
                    bibliographyData.publication.location = item['https://schema.org/location']['@id'];
                }
                if (item['https://schema.org/description']) {
                    bibliographyData.publication.description = item['https://schema.org/description']['@value'];
                }
            }

            // Other properties
            if (item['https://schema.org/author']) {
                bibliographyData.authors.push(item['https://schema.org/author']['@id']);
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasEditor']) {
                bibliographyData.editors.push(item['https://lod.academy/melod/vocab/ontology#hasEditor']['@id']);
            }
            if (item['https://schema.org/position']) {
                bibliographyData.position = item['https://schema.org/position']['@value'];
            }
            if (item['https://schema.org/pagination']) {
                bibliographyData.pagination = item['https://schema.org/pagination']['@value'];
            }
            if (item['https://schema.org/materialExtent']) {
                bibliographyData.materialExtent = item['https://schema.org/materialExtent']['@value'];
            }
            if (item['https://schema.org/inLanguage']) {
                bibliographyData.language = item['https://schema.org/inLanguage']['@value'];
            }
            if (item['https://schema.org/description']) {
                bibliographyData.description = item['https://schema.org/description']['@value'];
            }
        });

        return generateBibliographyXML(bibliographyData);
    }
}