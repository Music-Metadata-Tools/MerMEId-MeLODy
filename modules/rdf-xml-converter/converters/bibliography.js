import { generateBibliographyXML } from '../templates/bibliography.js';

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
            title: [],
            abbreviation: '',
            sameAs: [],
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
            langcode: '',
            description: []
        };

        // --- COLLECT TITLE OBJECTS BY @id ---
        const titleObjects = {};
        jsonLdData.forEach(item => {
            if (
                item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Title'
                || item['@id'] && jsonLdData.some(obj => obj['@id'] === item['@id'] && (
                    obj['http://www.w3.org/2000/01/rdf-schema#label'] ||
                    obj['https://lod.academy/melod/vocab/ontology#hasTitleType'] ||
                    obj['https://lod.academy/melod/vocab/ontology#hasTitleLevel']
                ))
            ) {
                const id = item['@id'];
                if (!titleObjects[id]) titleObjects[id] = {};
                Object.assign(titleObjects[id], item);
            }
        });

        // --- BUILD TITLES ARRAY ---
        for (const id in titleObjects) {
            const obj = titleObjects[id];
            if (
                obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Title'
            ) {
                bibliographyData.title.push({
                    title: obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '',
                    titleType: obj['https://lod.academy/melod/vocab/ontology#hasTitleType']?.['@id']?.split('#')[1] || '',
                    titleLevel: obj['https://lod.academy/melod/vocab/ontology#hasTitleLevel']?.['@id']?.split('#')[1] || ''
                });
            }
        }

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
                bibliographyData.genre = item['https://schema.org/genre']['@id'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasClassification']) {
                bibliographyData.classification = item['https://lod.academy/melod/vocab/ontology#hasClassification']['@value'];
            }
            if (item['https://lod.academy/melod/vocab/ontology#hasAbbreviation']) {
                bibliographyData.abbreviation = item['https://lod.academy/melod/vocab/ontology#hasAbbreviation']['@value'];
            }
            if (item['http://www.w3.org/2002/07/owl#sameAs']) {
                bibliographyData.sameAs.push(item['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (item['https://schema.org/isPartOf']) {
                bibliographyData.isPartOf = item['https://schema.org/isPartOf']['@id'];
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
                bibliographyData.langcode = item['https://schema.org/inLanguage']['@language'];
            }
            if (item['@id'] === bibliographyData.subjectUri) {
                if (item['https://schema.org/description']) {
                    bibliographyData.description.push(item['https://schema.org/description']['@value']);
                }
            }
        });

        return generateBibliographyXML(bibliographyData);
    }
}