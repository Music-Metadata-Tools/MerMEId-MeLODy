/**
 * @typedef {Object} PersonData
 * @property {string} subjectUri
 * @property {string} familyName
 * @property {string} givenName
 * @property {string} [gender]
 * @property {string} [birthDate]
 * @property {string} [birthPlace]
 * @property {string} [deathDate]
 * @property {string} [deathPlace]
 * @property {string[]} [sameAs]
 */

/**
 * @typedef {Object} InstitutionData
 * @property {string} subjectUri
 * @property {string} name
 * @property {string} [abbreviation]
 * @property {string} [location]
 * @property {string} [address]
 * @property {Date} [date]
 * @property {string} [description]
 * @property {string[]} [sameAs]
 */

/**
 * @typedef {Object} PlaceData
 * @property {string} subjectUri
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} [sameAs]
 */

/**
 * @typedef {Object} VenueData
 * @property {string} subjectUri
 * @property {string} name
 * @property {string} [containedIn]
 * @property {string} [description]
 * @property {string[]} [sameAs]
 */

/**
 * @typedef {Object} Contribution
 * @property {string} agent
 * @property {string} [role]
 * @property {string} [certainty]
 */

/**
 * @typedef {Object} Date
 * @property {string} value
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [notBefore]
 * @property {string} [notAfter]
 * @property {string} [certainty]
 * @property {string} [dateDescription]
 */

/**
 * @typedef {Object} EventData
 * @property {string} subjectUri
 * @property {string} label
 * @property {string} [classification]
 * @property {string} [location]
 * @property {string} [description]
 * @property {string[]} [sameAs]
 * @property {Date} [date]
 * @property {Contribution[]} [contributions]
 * @property {string[]} [citations]
 */

/**
 * @typedef {Object} PerformanceEventData
 * @property {string} subjectUri
 * @property {string} label
 * @property {string} [classification]
 * @property {string} [venue]
 * @property {string} [location]
 * @property {string} [duration]
 * @property {string} [description]
 * @property {string[]} [sameAs]
 * @property {Date} [date]
 * @property {Contribution[]} [contributions]
 * @property {string[]} [citations]
 */

/**
 * @typedef {Object} Publication
 *  @property {string} [publisher]
 *  @property {string} [label]
 *  @property {string} [startDate]
 *  @property {string} [endDate]
 *  @property {string} [publisher]
 *  @property {string} [location]
 *  @property {string} [description]
 */

/**
 * @typedef {Object} Title
 *  @property {string} [title]
 *  @property {string} [language]
 *  @property {string} [titleType]
 *  @property {string} [titleLevel]
 */

/**
 * @typedef {Object} BibliographyData
 * @property {string} subjectUri
 * @property {string} genre
 * @property {string} [classification]
 * @property {Title[]} [title]
 * @property {string[]} [description]
 * @property {string} [abbreviation]
 * @property {string} [isPartOf]
 * @property {string[]} [sameAs]
 * @property {string[]} [authors]
 * @property {string[]} [editors]
 * @property {Publication} [publication]
 * @property {string} [position]
 * @property {string} [pagination]
 * @property {string} [materialExtent]
 * @property {string} [language]
 * @property {string[]} [citations]
 */

/**
 * @typedef {Object} InstrumentationData
 * @property {string} [label] - Label of the instrumentation (e.g. "Orchestra")
 * @property {InstrumentationDetail[]} [details] - Instruments and voices
 * @property {InstrumentationGroup[]} [groups] - Ensembles
 */

/**
 * @typedef {Object} InstrumentationGroup
 * @property {string} [label] - Label of the group (e.g. "String section")
 * @property {InstrumentationDetail[]} details - Instruments and voices (required, minCount 1)
 */

/**
 * @typedef {Object} InstrumentationDetail
 * @property {string} [medium] - Medium of performance (e.g. URI or label)
 * @property {string} [name] - Name of the medium (e.g. "Violin")
 * @property {string} [link] - External identifier (IRI, e.g. MARC)
 * @property {number} [quantity] - Quantity of this medium
 * @property {boolean} [solo] - Is soloist
 * @property {boolean} [adLib] - Is ad libitum
 * @property {CastingDetail} [castingDetail] - Casting detail
 * @property {InstrumentationDetail[]} [alternativeInstrumentation] - Alternative instrumentation
 */

/**
 * @typedef {Object} CastingDetail
 * @property {string} roleName - Name of the role (required)
 * @property {string} [roleDescription] - Description of the role
 */

/**
 * @typedef {Object} WorkData
 * @property {string} subjectUri
 * @property {Title[]} [titles]                // melod:hasTitle
 * @property {Identifier[]} [identifiers]      // melod:hasIdentifier
 * @property {string[]} [sameAs]               // owl:sameAs
 * @property {Contribution[]} [contributors]   // melod:hasContribution
 * @property {string} [workStatus]             // schema:creativeWorkStatus
 * @property {string[]} [citations]            // schema:citation
 * @property {Annotation[]} [annotation]       // melod:hasAnnotation
 * @property {string} [context]                // melod:hasContext
 * @property {string[]} [historyDescription]     // melod:hasHistoryDesc
 * @property {string[]} [expressions]          // lrmoo:R3_is_realised_in
 * @property {string[]} [isPartOf]               // melod:isWorkPartOf
 * @property {string[]} [hasPart]              // melod:hasWorkPart
 * @property {string[]} [otherRelations]       // melod:hasAbridgement, melod:isAbridgementOf, etc.
 * @property {string[]} [classification]       // melod:hasClassification
 */

/**
 * @typedef {Object} Identifier
 * @property {string} [label]      // rdfs:label
 * @property {string} [value]      // owl:hasValue
 */

/**
 * @typedef {Object} Annotation
 * @property {string} [label]      // rdfs:label
 * @property {string[]} [paragraph]      // melod:paragraph
 */

/**
 * @typedef {Object} ExpressionData
 * @property {string} subjectUri
 * @property {string} label
 * @property {string[]} [sameAs]               // owl:sameAs
 * @property {Identifier[]} [identifiers]      // melod:hasIdentifier
 * @property {string[]} [language]             // schema:inLanguage
 * @property {string} [completionStatus]       // melod:completionStatus
 * @property {Contribution[]} [contributors]   // melod:hasContribution
 * @property {Date} [creationDate]             // schema:dateCreated
 * @property {string} [creationLocation]       // schema:locationCreated
 * @property {string[]} [historicEvent]        // melod:hasHistoricEvent
 * @property {EventData[]} [historicEventObj]        // melod:hasHistoricEvent
 * @property {string} [firstPerformance]       // schema:firstPerformance
 * @property {string[]} [performances]         // melod:hasPerformance
 * @property {string} [extent]                 // schema:materialExtent
 * @property {string} [tempo]                  // melod:hasTempo
 * @property {Key} [key]                       // mus:U11_has_key
 * @property {Meter} [meter]                   // melod:hasMeter
 * @property {string} [duration]               // melod:hasDuration
 * @property {string} [mensuration]            // melod:hasMensuration
 * @property {string} [instrumentation]        // melod:hasInstrumentation
 * @property {Incipit} [incipit]               // melod:hasIncipit
 * @property {ExpressionComponent[]} [movements] // schema:includedComposition
 * @property {string[]} [movementIris] // schema:includedComposition
 * @property {string[]} [otherRelations]       // melod:hasAbridgement, melod:isAbridgementOf, etc.
 * @property {string[]} [classification]       // melod:hasClassification
 * @property {string[]} [citations]            // schema:citation
 * @property {Annotation[]} [annotation]          // melod:hasAnnotation
 */

/**
 * @typedef {Object} Key
 * @property {string} [pitch]      
 * @property {string} [accidental]
 * @property {string} [mode]
 * @property {string} [description]
 */

/**
 * @typedef {Object} Meter
 * @property {string} [count]
 * @property {string} [unit]
 * @property {string} [symbol]
 * @property {string} [description]
 */

/**
 * @typedef {Object} Incipit
 * @property {string[]} [value]
 * @property {string} [text]
 * @property {string[]} [mei]
 */

/**
 * @typedef {Object} ExpressionComponent
 * @property {string} [expression]
 * @property {string} [label]
 */

/**
 * @typedef {Object} ManifestationData
 * @property {string} subjectUri
 * @property {Title} [title]                // melod:hasTitle
 * @property {string[]} [sameAs]               // owl:sameAs
 * @property {string[]} [classification]       // melod:hasClassificationOfManifestation
 * @property {Contribution[]} [contributors]   // melod:hasContribution
 * @property {PhysDesc} [physDesc]             // melod:hasPhysicalDescription
 * @property {TitlePage[]} [titlePages]         // melod:hasTitlePage
 * @property {Publication} [publication]       // schema:publication
 * @property {Annotation[]} [annotation]          // melod:hasAnnotation
 * @property {Annotation[]} [contents]          // melod:hasContents
 * @property {string[]} [expressions]          // lrmoo:R4_embodies
 * @property {string[]} [isPartOf]               // melod:isManifestationPartOf
 * @property {string[]} [hasPart]              // melod:hasManifestationPart
 * @property {string[]} [otherRelations]       // melod:hasAbridgement, melod:isAbridgementOf, etc.
 */

/**
 * @typedef {Object} PhysDesc
 * @property {Extent} [extent]
 * @property {Dimension[]} [dimensions]
 * @property {Watermark[]} [watermarks]
 * @property {string[]} [physicalMedium]
 * @property {PaperDetail} [paperDetail]
 * @property {string} [plateNumber]
 * @property {string} [addDescAuto]
 * @property {string} [addDescForeign]
 * @property {string} [supportDescAuto]
 * @property {string} [supportDescForeign]
 * @property {Binding} [binding]
 * @property {string} [condition]
 * @property {string} [decoDesc]
 * @property {string} [scriptDesc]
 * @property {string[]} [stamp]
 * @property {Inscription[]} [inscription]
 */

/**
 * @typedef {Object} PaperDetail
 * @property {string} [label]
 * @property {string} [pagination]
 * @property {string} [orientation]
 * @property {Extent} [extent]
 * @property {Format[]} [format]
 * @property {Rastral} [rastral]
 * @property {Watermark[]} [watermarks]
 * @property {string} [quality]
 * @property {string} [condition]
 * @property {Binding} [binding]
 */

/**
 * @typedef {Object} Extent
 * @property {string} [value]
 * @property {string} [unit]
 */

/**
 * @typedef {Object} Format
 * @property {string} [type]
 * @property {string} [value]
 * @property {string} [unit]
 */

/**
 * @typedef {Object} Dimension
 * @property {string} [type]
 * @property {string} [value]
 * @property {string} [unit]
 */

/**
 * @typedef {Object} Watermark
 * @property {string} [type]
 * @property {string[]} [sameAs]
 * @property {string} [heraldry]
 * @property {string} [content]
 * @property {string} [position]
 * @property {Dimension[]} [dimensions]
 * @property {Date} [creationDate]             // schema:dateCreated
 * @property {string} [creationLocation]       // schema:locationCreated
 * @property {string} [paperMaker]            // melod:hasPaperMaker
 * @property {string} [paperMill]            // melod:hasPaperMill
 * @property {string} [twinMark]            // melod:hasTwinMark
 */

/**
 * @typedef {Object} Binding
 * @property {string} [description]
 * @property {Dimension[]} [dimensions]
 * @property {string} [condition]
 * @property {string} [decoDesc]
 */

/**
 * @typedef {Object} Inscription
 * @property {string[]} [description]
 * @property {string[]} [agent]
 */

/**
 * @typedef {Object} Rastral
 * @property {Format[]} [dimensions]
 */

/**
 * @typedef {Object} TitlePage
 * @property {string} [type]
 * @property {string} [paragraph]
 */

/**
 * @typedef {Object} ItemData
 * @property {string} subjectUri
 * @property {string} label
 * @property {string[]} [sameAs]               // owl:sameAs
 * @property {string[]} [classification]       // melod:hasClassificationOfManifestation
 * @property {string} [repository]             // cidoc:P50_has_current_keeper
 * @property {string} [shelfmark]             // melod:hasShelfmark
 * @property {string} [formerShelfmark]        // melod:hasFormerShelfmark
 * @property {Date} [acquisition]             // melod:hasAcquisition
 * @property {string[]} [provenance]             // melod:hasProvenance
 * @property {EventData[]} [provenanceObj]       // melod:hasProvenance
 * @property {Hand[]} [hands]                   // melod:hasHand
 * @property {string[]} [history]             // melod:hasHistoricEvent
 * @property {EventData[]} [historyObj]          // melod:hasHistoricEvent
 * @property {PhysDesc} [physDesc]             // melod:hasPhysicalDescription
 * @property {TitlePage[]} [titlePage]         // melod:hasTitlePage
 * @property {string[]} [manifestations]          // lrmoo:R7_exemplifies
 * @property {string[]} [isPartOf]               // melod:isItemPartOf
 * @property {string[]} [hasPart]              // melod:hasItemPart
 * @property {string[]} [otherRelations]       // melod:hasAbridgement, melod:isAbridgementOf, etc.
 * @property {Annotation[]} [annotation]          // melod:hasAnnotation
 */

/**
 * @typedef {Object} Hand
 * @property {string} [agent]
 * @property {string} [type]
 * @property {string} [medium]
 * @property {string} [description]
 */

export {};

