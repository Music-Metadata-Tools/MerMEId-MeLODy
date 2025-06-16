import { generatePersonXML } from './template.js';

export class PersonConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const personData = {
            subjectUri: '',
            familyName: '',
            givenName: '',
            gender: '',
            birthDate: '',
            birthPlace: '',
            deathDate: '',
            deathPlace: '',
            sameAs: []
        };

        // Extract data from JSON-LD
        jsonLdData.forEach(item => {
            if (item['@id']) {
                personData.subjectUri = item['@id'];
            }
            if (item['https://schema.org/familyName']) {
                personData.familyName = item['https://schema.org/familyName']['@value'];
            }
            if (item['https://schema.org/givenName']) {
                personData.givenName = item['https://schema.org/givenName']['@value'];
            }
            if (item['https://schema.org/gender']) {
                personData.gender = item['https://schema.org/gender']['@value'];
            }
            if (item['https://schema.org/birthDate']) {
                personData.birthDate = item['https://schema.org/birthDate']['@value'];
            }
            if (item['https://schema.org/birthPlace']) {
                personData.birthPlace = item['https://schema.org/birthPlace']['@id'];
            }
            if (item['https://schema.org/deathDate']) {
                personData.deathDate = item['https://schema.org/deathDate']['@value'];
            }
            if (item['https://schema.org/deathPlace']) {
                personData.deathPlace = item['https://schema.org/deathPlace']['@id'];
            }
            if (item['https://www.w3.org/TR/owl-ref/sameAs']) {
                personData.sameAs.push(item['https://www.w3.org/TR/owl-ref/sameAs']['@id']);
            }
        });

        return generatePersonXML(personData);
    }
}