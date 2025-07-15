import { generateVenueXML } from '../templates/venue.js';

export class VenueConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const venueData = {
            subjectUri: '',
            name: '',
            containedIn: '',
            description: '',
            sameAs: []
        };

        // Extract data from JSON-LD
        jsonLdData.forEach(item => {
            if (item['@id']) {
                venueData.subjectUri = item['@id'];
            }
            if (item['https://schema.org/name']) {
                venueData.name = item['https://schema.org/name']['@value'];
            }
            if (item['https://schema.org/containedInPlace']) {
                venueData.containedIn = item['https://schema.org/containedInPlace']['@id'];
            }
            if (item['https://schema.org/description']) {
                venueData.description = item['https://schema.org/description']['@value'];
            }
            if (item['https://www.w3.org/TR/owl-ref/sameAs']) {
                venueData.sameAs.push(item['https://www.w3.org/TR/owl-ref/sameAs']['@id']);
            }
        });

        return generateVenueXML(venueData);
    }
}