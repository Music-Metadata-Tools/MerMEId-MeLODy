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
 * @property {string[]} [description]          // schema:description
 * @property {string} [context]                // melod:hasContext
 * @property {string} [historyDescription]     // melod:hasHistoryDesc
 * @property {string[]} [expressions]          // efrbroo:R9_is_realised_in
 * @property {string[]} [isPartOf]               // schema:isPartOf
 * @property {string[]} [hasPart]              // schema:hasPart
 * @property {string[]} [otherRelations]       // melod:hasAbridgement, melod:isAbridgementOf, etc.
 * @property {string[]} [classification]       // melod:hasClassification
 */

/**
 * @typedef {Object} Identifier
 * @property {string} [label]      // rdfs:label
 * @property {string} [value]      // owl:hasValue
 */

export {};

