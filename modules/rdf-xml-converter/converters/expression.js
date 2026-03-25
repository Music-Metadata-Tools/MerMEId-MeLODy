import { generateExpressionXML } from '../templates/expression.js';

export class ExpressionConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const expressionData = {
            subjectUri: '',
            label: '',
            sameAs: [],
            identifiers: [],
            language: [],
            completionStatus: '',
            contributors: [],
            creationDate: {
                value: '',
                startDate: '',
                endDate: '',
                notBefore: '',
                notAfter: '',
                certainty: '',
                dateDescription: ''
            },
            creationLocation: '',
            historicEvent: [],
            historicEventObj: [],
            firstPerformance: '',
            performances: [],
            extent: '',
            tempo: '',
            key: {
                pitch: '',
                accidental: '',
                mode: '',
                description: ''
            },
            meter: {
                count: '',
                unit: '',
                symbol: '',
                description: ''
            },
            duration: '',
            mensuration: '',
            instrumentation: '',
            incipit: {
                value: [],
                text: '',
                mei: []
            },
            movements: [],
            movementIris: [],
            otherRelations: [],
            classification: [],
            citations: [],
            annotation: []
        };
        // Find the date object ID
        const dateObjectId = jsonLdData.find(item => 
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Date'
        )?.['@id'];

        // Find the key object ID
        const keyObjectId = jsonLdData.find(item => 
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Key'
        )?.['@id'];

        // Find the meter object ID
        const meterObjectId = jsonLdData.find(item => 
            item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Meter'
        )?.['@id'];
        // --- Merge all objects with the same @id ---
        const byId = {};
        jsonLdData.forEach(obj => {
            if (obj['http://www.w3.org/2002/07/owl#sameAs'] && !obj['@id'].startsWith('_:')) {
                expressionData.sameAs.push(obj['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (obj['https://schema.org/citation'] && !obj['@id'].startsWith('_:')) {
                expressionData.citations.push(obj['https://schema.org/citation']['@id']);
            }

            if (obj['https://schema.org/includedComposition'] && !obj['@id'].startsWith('_:') && !obj['https://schema.org/includedComposition']['@id'].startsWith('_:')) {
                expressionData.movementIris.push(obj['https://schema.org/includedComposition']['@id']);
            }
            // Check descriptions based on their subject IDs
            if (obj['https://schema.org/description']) {
                if (obj['@id'] === keyObjectId) {
                    // This is the date description
                    expressionData.key.description = obj['https://schema.org/description']['@value'];
                }
                else if (obj['@id'] === meterObjectId) {
                    // This is the date description
                    expressionData.meter.description = obj['https://schema.org/description']['@value'];
                }
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasClassification'] && !obj['@id'].startsWith('_:')) {
                expressionData.classification.push(obj['https://lod.academy/melod/vocab/ontology#hasClassification']['@id']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#inLanguage'] && !obj['@id'].startsWith('_:')) {
                expressionData.language.push(obj['https://lod.academy/melod/vocab/ontology#inLanguage']['@id']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasHistoricEvent'] && !obj['@id'].startsWith('_:') && !obj['https://lod.academy/melod/vocab/ontology#hasHistoricEvent']['@id'].startsWith('_:')) {
                expressionData.historicEvent.push(obj['https://lod.academy/melod/vocab/ontology#hasHistoricEvent']['@id']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasPerformance'] && !obj['@id'].startsWith('_:')) {
                expressionData.performances.push(obj['https://lod.academy/melod/vocab/ontology#hasPerformance']['@id']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasIncipitValue']) {
                expressionData.incipit.value.push(obj['https://lod.academy/melod/vocab/ontology#hasIncipitValue']['@value']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasMEIScore']) {
                expressionData.incipit.mei.push(obj['https://lod.academy/melod/vocab/ontology#hasMEIScore']['@value']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasPitch']) {
                expressionData.key.pitch = obj['https://lod.academy/melod/vocab/ontology#hasPitch']['@id'];
            }

            if (obj['https://lod.academy/melod/vocab/ontology#hasAccidental']) {
                expressionData.key.accidental = obj['https://lod.academy/melod/vocab/ontology#hasAccidental']['@id'];
            }

            if (obj['https://lod.academy/melod/vocab/ontology#isInMode']) {
                expressionData.key.mode = obj['https://lod.academy/melod/vocab/ontology#isInMode']['@id'];
            }

            if (obj['https://lod.academy/melod/vocab/ontology#hasMeterCount']) {
                expressionData.meter.count = obj['https://lod.academy/melod/vocab/ontology#hasMeterCount']['@value'] || '';
            }

            if (obj['https://lod.academy/melod/vocab/ontology#inMeterUnit']) {
                expressionData.meter.unit = obj['https://lod.academy/melod/vocab/ontology#inMeterUnit']['@value'] || '';
            }

            if (obj['https://lod.academy/melod/vocab/ontology#usesMeterSymbol']) {
                expressionData.meter.symbol = obj['https://lod.academy/melod/vocab/ontology#usesMeterSymbol']['@value'] || '';
            }

            if (obj['https://lod.academy/melod/vocab/ontology#hasIncipitText']) {
                expressionData.incipit.text = obj['https://lod.academy/melod/vocab/ontology#hasIncipitText']['@value'] || '';
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

        // --- Find main Work object ---
        const main = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Expression'
        );
        if (!main) return '';

        expressionData.subjectUri = main['@id'];

        if (main['https://lod.academy/melod/vocab/ontology#completionStatus']) {
            expressionData.completionStatus = main['https://lod.academy/melod/vocab/ontology#completionStatus']['@id'];
        }

        if (main['http://www.w3.org/2000/01/rdf-schema#label']) {
            expressionData.label = main['http://www.w3.org/2000/01/rdf-schema#label']['@value'] || '';
        }

        if (main['https://schema.org/locationCreated']) {
            expressionData.creationLocation = main['https://schema.org/locationCreated']['@id'];
        }

        if (main['https://schema.org/firstPerformance']) {
            expressionData.firstPerformance = main['https://schema.org/firstPerformance']['@id'];
        }

        if (main['https://schema.org/materialExtent']) {
            expressionData.extent = main['https://schema.org/materialExtent']['@value'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasTempo']) {
            expressionData.tempo = main['https://lod.academy/melod/vocab/ontology#hasTempo']['@value'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasDuration']) {
            expressionData.duration = main['https://lod.academy/melod/vocab/ontology#hasDuration']['@value'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasMensuration']) {
            expressionData.mensuration = main['https://lod.academy/melod/vocab/ontology#hasMensuration']['@value'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasInstrumentation']) {
            expressionData.instrumentation = main['https://lod.academy/melod/vocab/ontology#hasInstrumentation']['@id'];
        }

        

        // --- Identifier ---
        let identifierLinks = main['https://lod.academy/melod/vocab/ontology#hasIdentifier'];
        if (identifierLinks) {
            if (!Array.isArray(identifierLinks)) identifierLinks = [identifierLinks];
            expressionData.identifiers = identifierLinks
                .map(link => parseIdentifier(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Annotations ---
        let annotationLinks = main['https://lod.academy/melod/vocab/ontology#hasAnnotation'];
        if (annotationLinks) {
            if (!Array.isArray(annotationLinks)) annotationLinks = [annotationLinks];
            expressionData.annotation = annotationLinks
                .map(link => parseAnnotation(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Contribution ---
        let contributorsLinks = main['https://lod.academy/melod/vocab/ontology#hasContribution'];
        if (contributorsLinks) {
            if (!Array.isArray(contributorsLinks)) contributorsLinks = [contributorsLinks];
            expressionData.contributors = contributorsLinks
                .map(link => parseContribution(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Creation Date ---
        let creationDateLink = main['https://schema.org/dateCreated'];
        if (creationDateLink) {
            expressionData.creationDate = parseDate(creationDateLink['@id'], byId)
        }

        // --- Movement ---
        let movementLinks = main['https://schema.org/includedComposition'];
        if (movementLinks) {
            if (!Array.isArray(movementLinks)) movementLinks = [movementLinks];
            expressionData.movements = movementLinks
                .map(link => parseMovements(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Historic Events ---
        let eventsLinks = main['https://lod.academy/melod/vocab/ontology#hasHistoricEvent'];
        if (eventsLinks) {
            if (!Array.isArray(eventsLinks)) eventsLinks = [eventsLinks];
            expressionData.historicEventObj = eventsLinks
                .map(link => parseEvents(link['@id'], byId))
                .filter(Boolean);
        }

        // Debug logging
        //console.log('Processed work:', expressionData);

        return generateExpressionXML(expressionData);
    }
}

// Helper: Parse Identifiers
function parseIdentifier(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const identifier = {};

    // Label
    if (obj['http://www.w3.org/2000/01/rdf-schema#label']) {
        identifier.label = obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '';
    }
    // Value
    if (obj['http://www.w3.org/2002/07/owl#hasValue']) {
        identifier.value = obj['http://www.w3.org/2002/07/owl#hasValue']?.['@value'] || '';
    }
    return identifier;
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

// Helper: Parse Movements
function parseMovements(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const movement = {};

    // Label
    if (obj['http://www.w3.org/2000/01/rdf-schema#label']) {
        movement.label = obj['http://www.w3.org/2000/01/rdf-schema#label']?.['@value'] || '';
    }

    return movement;
}

// Helper: Parse Events
function parseEvents(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const event = {};

    // name
    if (obj['http://www.w3.org/2000/01/rdf-schema#label']) {
        event.label = obj['http://www.w3.org/2000/01/rdf-schema#label']['@value'] || '';
    }

    // location
    if (obj['https://schema.org/location']) {
        event.location = obj['https://schema.org/location']['@id'] || '';
    }

    // event contributor
    const eventContribution = obj['https://lod.academy/melod/vocab/ontology#hasContribution'];
    if (eventContribution) {
        event.contributions = parseContribution(eventContribution['@id'], byId)
    }

    // event date
    const eventDate = obj['https://lod.academy/melod/vocab/ontology#hasEventDate'];
    if (eventDate) {
        event.date = parseDate(eventDate['@id'], byId)
    }

    // description
    if (obj['https://schema.org/description']) {
        event.description = obj['https://schema.org/description']['@value'] || '';
    }

    return event;
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