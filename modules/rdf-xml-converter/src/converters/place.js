import { generatePlaceXML } from '../templates/place.js';

export class PlaceConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const placeData = {
            subjectUri: '',
            name: '',
            description: '',
            sameAs: []
        };

        // Extract data from JSON-LD
        jsonLdData.forEach(item => {
            if (item['@id']) {
                placeData.subjectUri = item['@id'];
            }
            if (item['https://schema.org/name']) {
                placeData.name = item['https://schema.org/name']['@value'];
            }
            if (item['https://schema.org/description']) {
                placeData.description = item['https://schema.org/description']['@value'];
            }
            if (item['https://www.w3.org/TR/owl-ref/sameAs']) {
                placeData.sameAs.push(item['https://www.w3.org/TR/owl-ref/sameAs']['@id']);
            }
        });

        return generatePlaceXML(placeData);
    }
}