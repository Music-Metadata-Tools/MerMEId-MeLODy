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

export {};

