import { generateItemXML } from '../templates/item.js';

export class ItemConverter {
    /**
     * Convert JSON-LD data to XML format
     * @param {any[]} jsonLdData
     * @returns {string}
     */
    static toXML(jsonLdData) {
        const itemData = {
            subjectUri: '',
            label: '',
            sameAs: [],
            history: [],
            historyObj: [],
            classification: [],
            repository: '',
            shelfmark: '',
            formerShelfmark: '',
            hands: [],
            acquisition: {
                value: '',
                startDate: '',
                endDate: '',
                notBefore: '',
                notAfter: '',
                certainty: '',
                dateDescription: ''
            },
            provenance: [],
            provenanceObj: [],
            physDesc: {
                extent: {
                    value: '',
                    unit: '',
                },
                dimensions: [],
                watermarks: [],
                physicalMedium: [],
                paperDetail: {
                    label: '',
                    pagination: '',
                    orientation: '',
                    extent: {
                        value: '',
                        unit: '',
                    },
                    format: [],
                    rastral: {
                        dimensions: [],
                    },
                    watermarks: [],
                    quality: '',
                    condition: '',
                    binding: {
                        description: '',
                        dimensions: [],
                        condition: '',
                        decoDesc: ''
                    },
                },
                plateNumber: '',
                addDescAuto: '',
                addDescForeign: '',
                supportDescAuto: '',
                supportDescForeign: '',
                binding: {
                    description: '',
                    dimensions: [],
                    condition: '',
                    decoDesc: ''
                },
                condition: '',
                decoDesc: '',
                scriptDesc: '',
                stamp: [],
                inscription: []
            },
            titlePages: [],
            annotation: [],
            manifestations: [],
            isPartOf: [],
            hasPart: [],
            otherRelations: []
        };

        // --- Merge all objects with the same @id ---
        const byId = {};
        jsonLdData.forEach(obj => {
            if (obj['http://www.w3.org/2002/07/owl#sameAs'] && !obj['@id'].startsWith('_:')) {
                itemData.sameAs.push(obj['http://www.w3.org/2002/07/owl#sameAs']['@id']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasHistoricEvent'] && !obj['@id'].startsWith('_:') && !obj['https://lod.academy/melod/vocab/ontology#hasHistoricEvent']['@id'].startsWith('_:')) {
                itemData.history.push(obj['https://lod.academy/melod/vocab/ontology#hasHistoricEvent']['@id']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasProvenance'] && !obj['@id'].startsWith('_:') && !obj['https://lod.academy/melod/vocab/ontology#hasProvenance']['@id'].startsWith('_:')) {
                itemData.provenance.push(obj['https://lod.academy/melod/vocab/ontology#hasProvenance']['@id']);
            }
            if (obj['http://erlangen-crm.org/efrbroo/R7_is_materialization_of'] && !obj['@id'].startsWith('_:')) {
                itemData.manifestations.push(obj['http://erlangen-crm.org/efrbroo/R7_is_materialization_of']['@id']);
            }
            if (obj['https://lod.academy/melod/vocab/ontology#hasPhysMedium'] && !obj['https://lod.academy/melod/vocab/ontology#hasPhysMedium']['@id']) {
                itemData.physDesc.physicalMedium.push(obj['https://lod.academy/melod/vocab/ontology#hasPhysMedium']['@value'] || '');
            }

            if (obj['https://lod.academy/melod/vocab/ontology#hasStamp']) {
                itemData.physDesc.stamp.push(obj['https://lod.academy/melod/vocab/ontology#hasStamp']['@value'] || '');
            }

            if (obj['https://schema.org/isPartOf'] && !obj['@id'].startsWith('_:')) {
                itemData.isPartOf.push(obj['https://schema.org/isPartOf']['@id']);
            }

            if (obj['https://schema.org/hasPart'] && !obj['@id'].startsWith('_:')) {
                itemData.hasPart.push(obj['https://schema.org/hasPart']['@id']);
            }

            if (obj['https://lod.academy/melod/vocab/ontology#hasClassificationOfManifestation'] && !obj['@id'].startsWith('_:')) {
                itemData.classification.push(obj['https://lod.academy/melod/vocab/ontology#hasClassificationOfManifestation']['@id']);
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

        // --- Find main manifestation object ---
        const main = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Item'
        );
        if (!main) {
            console.warn('No main item object found');
            return '';
        }


        // --- Find physDesc manifestation object ---
        const physicalDesc = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#PhysicalDescription'
        );
        if (!physicalDesc) {
            console.warn('No PhysicalDescription object found');
        }

        // --- Find paper manifestation object ---
        const paperDetail = Object.values(byId).find(obj =>
            obj['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#PaperDetail'
        );
        if (!paperDetail) {
            console.warn('No PaperDetail object found');
        }

        itemData.subjectUri = main['@id'];

        if (main['http://www.w3.org/2000/01/rdf-schema#label']) {
                itemData.label = main['http://www.w3.org/2000/01/rdf-schema#label']['@value'] || '';
        }

        if (main['http://www.cidoc-crm.org/cidoc-crm/P50_has_current_keeper']) {
                itemData.repository = main['http://www.cidoc-crm.org/cidoc-crm/P50_has_current_keeper']['@id'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasShelfmark']) {
                itemData.shelfmark = main['https://lod.academy/melod/vocab/ontology#hasShelfmark']['@value'] || '';
        }

        if (main['https://lod.academy/melod/vocab/ontology#hasFormerShelfmark']) {
                itemData.formerShelfmark = main['https://lod.academy/melod/vocab/ontology#hasFormerShelfmark']['@value'] || '';
        }

        if (physicalDesc) {

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasPlateNum']) {
                itemData.physDesc.plateNumber = physicalDesc['https://lod.academy/melod/vocab/ontology#hasPlateNum']['@value'] || '';
            }

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasAddDescAutograph']) {
                itemData.physDesc.addDescAuto = physicalDesc['https://lod.academy/melod/vocab/ontology#hasAddDescAutograph']['@value'] || '';
            }

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasAddDescForeign']) {
                itemData.physDesc.addDescForeign = physicalDesc['https://lod.academy/melod/vocab/ontology#hasAddDescForeign']['@value'] || '';
            }

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasSupportDescAutograph']) {
                itemData.physDesc.supportDescAuto = physicalDesc['https://lod.academy/melod/vocab/ontology#hasSupportDescAutograph']['@value'] || '';
            }

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasSupportDescForeign']) {
                itemData.physDesc.supportDescForeign = physicalDesc['https://lod.academy/melod/vocab/ontology#hasSupportDescForeign']['@value'] || '';
            }

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasCondition']) {
                itemData.physDesc.condition = physicalDesc['https://lod.academy/melod/vocab/ontology#hasCondition']['@value'] || '';
            }

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasDecoDesc']) {
                itemData.physDesc.decoDesc = physicalDesc['https://lod.academy/melod/vocab/ontology#hasDecoDesc']['@value'] || '';
            }

            if (physicalDesc['https://lod.academy/melod/vocab/ontology#hasScriptDesc']) {
                itemData.physDesc.scriptDesc = physicalDesc['https://lod.academy/melod/vocab/ontology#hasScriptDesc']['@value'] || '';
            }
        }

        if (paperDetail) {
            if (paperDetail['http://www.w3.org/2000/01/rdf-schema#label']) {
                itemData.physDesc.paperDetail.label = paperDetail['http://www.w3.org/2000/01/rdf-schema#label']['@value'] || '';
            }

            if (paperDetail['https://schema.org/pagination']) {
                itemData.physDesc.paperDetail.pagination = paperDetail['https://schema.org/pagination']['@value'] || '';
            }

            if (paperDetail['https://lod.academy/melod/vocab/ontology#hasOrientation']) {
                itemData.physDesc.paperDetail.orientation = paperDetail['https://lod.academy/melod/vocab/ontology#hasOrientation']['@value'] || '';
            }

            if (paperDetail['https://lod.academy/melod/vocab/ontology#hasPaperQuality']) {
                itemData.physDesc.paperDetail.quality = paperDetail['https://lod.academy/melod/vocab/ontology#hasPaperQuality']['@value'] || '';
            }

            if (paperDetail['https://lod.academy/melod/vocab/ontology#hasCondition']) {
                itemData.physDesc.paperDetail.condition = paperDetail['https://lod.academy/melod/vocab/ontology#hasCondition']['@value'] || '';
            }
        }

        // --- Title Pages ---
        let titlePageLinks = main['https://lod.academy/melod/vocab/ontology#hasTitlePage'];
        if (titlePageLinks) {
            if (!Array.isArray(titlePageLinks)) titlePageLinks = [titlePageLinks];
            itemData.titlePages = titlePageLinks
                .map(link => parseTitlePages(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Annotations ---
        let annotationLinks = main['https://lod.academy/melod/vocab/ontology#hasAnnotation'];
        if (annotationLinks) {
            if (!Array.isArray(annotationLinks)) annotationLinks = [annotationLinks];
            itemData.annotation = annotationLinks
                .map(link => parseAnnotation(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Hands ---
        let handLinks = main['https://lod.academy/melod/vocab/ontology#hasHand'];
        if (handLinks) {
            if (!Array.isArray(handLinks)) handLinks = [handLinks];
            itemData.hands = handLinks
                .map(link => parseHands(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Provenance ---
        let provenanceLinks = main['https://lod.academy/melod/vocab/ontology#hasProvenance'];
        if (provenanceLinks) {
            if (!Array.isArray(provenanceLinks)) provenanceLinks = [provenanceLinks];
            itemData.provenanceObj = provenanceLinks
                .map(link => parseEvents(link['@id'], byId))
                .filter(Boolean);
        }

        // --- History Obj ---
        let historyLinks = main['https://lod.academy/melod/vocab/ontology#hasHistoricEvent'];
        if (historyLinks) {
            if (!Array.isArray(historyLinks)) historyLinks = [historyLinks];
            itemData.historyObj = historyLinks
                .map(link => parseEvents(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Acquisition ---
        let acquisitionLink = main['https://lod.academy/melod/vocab/ontology#hasAcquisition'];
        if (acquisitionLink) {
            itemData.acquisition = parseDate(acquisitionLink['@id'], byId)
        }

        // --- Phys Desc Dimensions ---
        let dimensionsLinks = physicalDesc?.['http://erlangen-crm.org/efrbroo/CLP_should_have_dimension'];
        if (dimensionsLinks) {
            if (!Array.isArray(dimensionsLinks)) dimensionsLinks = [dimensionsLinks];
            itemData.physDesc.dimensions = dimensionsLinks
                .map(link => parseDimensions(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Phys Desc Extent ---
        let extentLink = physicalDesc?.['https://lod.academy/melod/vocab/ontology#hasExtent'];
        if (extentLink) {
            itemData.physDesc.extent = parseExtent(extentLink['@id'], byId)
        }

        // --- Phys Desc Binding ---
        let bindingLink = physicalDesc?.['https://lod.academy/melod/vocab/ontology#hasBinding'];
        if (bindingLink) {
            itemData.physDesc.binding = parseBinding(bindingLink['@id'], byId)
        }

        // --- Phys Desc Watermarks ---
        let watermarksLinks = physicalDesc?.['https://lod.academy/melod/vocab/ontology#hasWatermark'];
        if (watermarksLinks) {
            if (!Array.isArray(watermarksLinks)) watermarksLinks = [watermarksLinks];
            itemData.physDesc.watermarks = watermarksLinks
                .map(link => parseWatermarks(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Phys Desc Inscription ---
        let inscriptionLinks = physicalDesc?.['https://lod.academy/melod/vocab/ontology#hasInscription'];
        if (inscriptionLinks) {
            if (!Array.isArray(inscriptionLinks)) inscriptionLinks = [inscriptionLinks];
            itemData.physDesc.inscription = inscriptionLinks
                .map(link => parseInscriptions(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Paper Detail Watermarks ---
        let paperWatermarksLinks = paperDetail?.['https://lod.academy/melod/vocab/ontology#hasWatermark'];
        if (paperWatermarksLinks) {
            if (!Array.isArray(paperWatermarksLinks)) paperWatermarksLinks = [paperWatermarksLinks];
            itemData.physDesc.paperDetail.watermarks = paperWatermarksLinks
                .map(link => parseWatermarks(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Paper Detail Extent ---
        let paperExtentLink = paperDetail?.['https://lod.academy/melod/vocab/ontology#hasExtent'];
        if (paperExtentLink) {
            itemData.physDesc.paperDetail.extent = parseExtent(paperExtentLink['@id'], byId)
        }

        // --- Paper Detail Format ---
        let paperFormatLinks = paperDetail?.['https://lod.academy/melod/vocab/ontology#hasFormat'];
        if (paperFormatLinks) {
            if (!Array.isArray(paperFormatLinks)) paperFormatLinks = [paperFormatLinks];
            itemData.physDesc.paperDetail.format = paperFormatLinks
                .map(link => parseDimensions(link['@id'], byId))
                .filter(Boolean);
        }

        // --- Paper Detail Binding ---
        let paperBindingLink = paperDetail?.['https://lod.academy/melod/vocab/ontology#hasBinding'];
        if (paperBindingLink) {
            itemData.physDesc.paperDetail.binding = parseBinding(paperBindingLink['@id'], byId)
        }

        // --- Paper Detail Rastral ---
        let paperRastralLink = paperDetail?.['https://lod.academy/melod/vocab/ontology#hasRastral'];
        if (paperRastralLink) {
            itemData.physDesc.paperDetail.rastral = parseRastral(paperRastralLink['@id'], byId)
        }

        // Debug logging
        console.log('Processed item:', itemData);

        return generateItemXML(itemData);
    }
}

// Helper: Parse Title Pages
function parseTitlePages(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const titlePage = {};

    // type
    if (obj['http://www.cidoc-crm.org/cidoc-crm/P2_has_type']) {
        titlePage.type = obj['http://www.cidoc-crm.org/cidoc-crm/P2_has_type']['@value'] || '';
    }

    // paragraph
    if (obj['https://lod.academy/melod/vocab/ontology#paragraph']) {
        titlePage.paragraph = obj['https://lod.academy/melod/vocab/ontology#paragraph']['@value'] || '';
    }

    return titlePage;
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

// Helper: Parse Hands
function parseHands(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const hand = {};

    // agent
    if (obj['https://lod.academy/melod/vocab/ontology#hasAgent']) {
        hand.agent = obj['https://lod.academy/melod/vocab/ontology#hasAgent']['@id'] || '';
    }

    // type
    if (obj['https://lod.academy/melod/vocab/ontology#hasHandType']) {
        hand.type = obj['https://lod.academy/melod/vocab/ontology#hasHandType']['@id'] || '';
    }

    // medium
    if (obj['https://lod.academy/melod/vocab/ontology#hasMedium']) {
        hand.medium = obj['https://lod.academy/melod/vocab/ontology#hasMedium']['@id'] || '';
    }

    // description
    if (obj['https://schema.org/description']) {
        hand.description = obj['https://schema.org/description']['@value'] || '';
    }

    return hand;
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

// Helper: Parse Dimensions
function parseDimensions(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const dimension = {};

    // type
    if (obj['http://www.cidoc-crm.org/cidoc-crm/P2_has_type']) {
        dimension.type = obj['http://www.cidoc-crm.org/cidoc-crm/P2_has_type']['@value'] || '';
    }

    // value
    if (obj['http://www.cidoc-crm.org/cidoc-crm/P90_has_value']) {
        dimension.value = obj['http://www.cidoc-crm.org/cidoc-crm/P90_has_value']['@value'] || '';
    }

    // unit
    if (obj['http://www.cidoc-crm.org/cidoc-crm/P91_has_unit']) {
        dimension.unit = obj['http://www.cidoc-crm.org/cidoc-crm/P91_has_unit']['@id'] || '';
    }

    return dimension;
}

// Helper: Parse Extent
function parseExtent(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const extent = {};

    // value
    if (obj['http://www.cidoc-crm.org/cidoc-crm/P90_has_value']) {
        extent.value = obj['http://www.cidoc-crm.org/cidoc-crm/P90_has_value']['@value'] || '';
    }

    // unit
    if (obj['http://www.cidoc-crm.org/cidoc-crm/P91_has_unit']) {
        extent.unit = obj['http://www.cidoc-crm.org/cidoc-crm/P91_has_unit']['@id'] || '';
    }

    return extent;
}

// Helper: Parse Binding
function parseBinding(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const binding = {};

    if (obj['https://schema.org/description']) {
        binding.description = obj['https://schema.org/description']['@value'] || '';
    }

    if (obj['https://lod.academy/melod/vocab/ontology#hasCondition']) {
        binding.condition = obj['https://lod.academy/melod/vocab/ontology#hasCondition']['@value'] || '';
    }

    if (obj['https://lod.academy/melod/vocab/ontology#hasDecoDesc']) {
        binding.decoDesc = obj['https://lod.academy/melod/vocab/ontology#hasDecoDesc']['@value'] || '';
    }

    const dimensions = obj['http://erlangen-crm.org/efrbroo/CLP_should_have_dimension'];
    if (dimensions) {
        binding.dimensions = [];

        if (Array.isArray(dimensions)) {
            for (const dim of dimensions) {
                if (dim['@id']) {
                    const parsed = parseDimensions(dim['@id'], byId);
                    if (parsed) binding.dimensions.push(parsed);
                }
            }
        } else if (dimensions['@id']) {
            const parsed = parseDimensions(dimensions['@id'], byId);
            if (parsed) binding.dimensions.push(parsed);
        }
    }

    return binding;
}

// Helper: Parse Rastral
function parseRastral(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const rastral = {};

    const dimensions = obj['http://erlangen-crm.org/efrbroo/CLP_should_have_dimension'];
    if (dimensions) {
        rastral.dimensions = [];

        if (Array.isArray(dimensions)) {
            for (const dim of dimensions) {
                if (dim['@id']) {
                    const parsed = parseDimensions(dim['@id'], byId);
                    if (parsed) rastral.dimensions.push(parsed);
                }
            }
        } else if (dimensions['@id']) {
            const parsed = parseDimensions(dimensions['@id'], byId);
            if (parsed) rastral.dimensions.push(parsed);
        }
    }

    return rastral;
}

// Helper: Parse Inscriptions
function parseInscriptions(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const inscription = {};

    // Person
    const person = obj['https://lod.academy/melod/vocab/ontology#hasAgent'];
    if (person) {
        inscription.agent = [];

        if (Array.isArray(person)) {
            for (const item of person) {
                if (item['@id']) {
                    inscription.agent.push(item['@id']);
                }
            }
        } else if (person['@id']) {
            inscription.agent.push(person['@id']);
        }
    }

    // description
    const paragraph = obj['https://schema.org/description'];
    if (paragraph) {
        inscription.description = [];

        if (Array.isArray(paragraph)) {
            for (const item of paragraph) {
                if (item['@value']) {
                    inscription.description.push(item['@value']);
                }
            }
        } else if (paragraph['@value']) {
            inscription.description.push(paragraph['@value']);
        }
    }
    
    return inscription;
}

// Helper: Parse Watermarks
function parseWatermarks(id, byId) {
    const obj = byId[id];
    if (!obj) return null;
    const watermark = {};

    // type
    if (obj['http://www.cidoc-crm.org/cidoc-crm/P2_has_type']) {
        watermark.type = obj['http://www.cidoc-crm.org/cidoc-crm/P2_has_type']['@value'] || '';
    }

    // sameAs (kann einzelnes Objekt oder Array sein)
    const sameAs = obj['http://www.w3.org/2002/07/owl#sameAs'];
    if (sameAs) {
        watermark.sameAs = [];

        if (Array.isArray(sameAs)) {
            for (const item of sameAs) {
                if (item['@id']) {
                    watermark.sameAs.push(item['@id']);
                }
            }
        } else if (sameAs['@id']) {
            watermark.sameAs.push(sameAs['@id']);
        }
    }

    if (obj['https://lod.academy/melod/vocab/ontology#hasHeraldry']) {
        watermark.heraldry = obj['https://lod.academy/melod/vocab/ontology#hasHeraldry']['@value'] || '';
    }

    if (obj['https://lod.academy/melod/vocab/ontology#hasContent']) {
        watermark.content = obj['https://lod.academy/melod/vocab/ontology#hasContent']['@value'] || '';
    }

    if (obj['https://lod.academy/melod/vocab/ontology#paperPosition']) {
        watermark.position = obj['https://lod.academy/melod/vocab/ontology#paperPosition']['@value'] || '';
    }

    const creationDate = obj['https://schema.org/creationDate'];
    if (creationDate) {
        watermark.creationDate = parseDate(creationDate['@id'], byId)
    }

    const dimensions = obj['http://erlangen-crm.org/efrbroo/CLP_should_have_dimension'];
    if (dimensions) {
        watermark.dimensions = [];

        if (Array.isArray(dimensions)) {
            for (const dim of dimensions) {
                if (dim['@id']) {
                    const parsed = parseDimensions(dim['@id'], byId);
                    if (parsed) watermark.dimensions.push(parsed);
                }
            }
        } else if (dimensions['@id']) {
            const parsed = parseDimensions(dimensions['@id'], byId);
            if (parsed) watermark.dimensions.push(parsed);
        }
    }

    if (obj['https://schema.org/creationLocation']) {
        watermark.creationLocation = obj['https://schema.org/creationLocation']['@id'];
    }

    if (obj['https://lod.academy/melod/vocab/ontology#hasPaperMaker']) {
        watermark.paperMaker = obj['https://lod.academy/melod/vocab/ontology#hasPaperMaker']['@id'];
    }

    if (obj['https://lod.academy/melod/vocab/ontology#hasPaperMill']) {
        watermark.paperMill = obj['https://lod.academy/melod/vocab/ontology#hasPaperMill']['@id'];
    }

    if (obj['https://lod.academy/melod/vocab/ontology#hasTwinMark']) {
        watermark.twinMark = obj['https://lod.academy/melod/vocab/ontology#hasTwinMark']['@id'];
    }

    return watermark;
}