import { generateLetterXML } from '../templates/letter.js';

export class LetterConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const letterData = {
            subjectUri: '',
            label: '',
            sent: {
                participant: [],
                place: '',
                date: {
                    value: '',
                    startDate: '',
                    endDate: '',
                    notBefore: '',
                    notAfter: '',
                    certainty: '',
                    dateDescription: ''
                }
            },
            received: {
                participant: [],
                place: '',
                date: {
                    value: '',
                    startDate: '',
                    endDate: '',
                    notBefore: '',
                    notAfter: '',
                    certainty: '',
                    dateDescription: ''
                }
            },
            description: '',
            sameAs: [],
        };

        

        // --- Merge all objects with the same @id ---
        const byId = {};
        jsonLdData.forEach(obj => {
            if (obj['http://www.w3.org/2002/07/owl#sameAs'] && !obj['@id'].startsWith('_:')) {
                letterData.sameAs.push(obj['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (obj['http://www.w3.org/2000/01/rdf-schema#label'] && !obj['@id'].startsWith('_:')) {
                letterData.label = obj['http://www.w3.org/2000/01/rdf-schema#label']['@value'] || '';
            }
            // Check descriptions based on their subject IDs
            if (obj['https://schema.org/description'] && !obj['@id'].startsWith('_:')) {
                letterData.description = obj['https://schema.org/description']['@value'] || '';
            }
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

        // --- Find main letter object ---
        const main = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Letter'
        );
        if (!main) {
            console.warn('No main letter object found');
            return '';
        }

        // Find the sent object ID
        const sent = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/correspsearch/vocab/terms#Sent'
        );
        if (!sent) {
            console.warn('No Sent object found');
        }

        // Find the received object ID
        const received = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/correspsearch/vocab/terms#Received'
        );
        if (!received) {
            console.warn('No Received object found');
        }

        letterData.subjectUri = main['@id'];

        if (sent) {

            letterData.sent = parseCorresp(sent['@id'], byId)
            console.log('Parsed sent id:', sent['@id']);

        }

        if (received) {

            letterData.received = parseCorresp(received['@id'], byId)

        }

        // Debug logging
        console.log('Processed letter:', letterData);

        return generateLetterXML(letterData);
    }
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

// Helper: Parse Annotations
function parseCorresp(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const corresp = {};

    if (obj['https://lod.academy/correspsearch/vocab/terms#tookPlaceAt']) {
        corresp.place = obj['https://lod.academy/correspsearch/vocab/terms#tookPlaceAt']['@id'];
    }

    // date
    const date = obj['https://lod.academy/correspsearch/vocab/terms#hasTimespan'];
    if (date) {
        corresp.date = parseDate(date['@id'], byId)
    }

    // participant
    const participant = obj['https://lod.academy/correspsearch/vocab/terms#hasParticipant'];
    if (participant) {
        corresp.participant = [];
        if (Array.isArray(participant)) {
            for (const item of participant) {
                if (item['@id']) {
                    corresp.participant.push(item['@id']);
                }
            }
        } else if (participant['@id']) {
            corresp.participant.push(participant['@id']);
        }
    }
    
    return corresp;
}

