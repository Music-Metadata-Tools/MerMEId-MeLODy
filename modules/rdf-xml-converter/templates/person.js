/**
 * Generates XML string with person data
 * @param {import('../types').PersonData} data 
 * @returns {string}
 */
export function generatePersonXML(data) {
    const identifiers = data.sameAs.map(uri => 
        `    <idno>${uri}</idno>`
    ).join('\n');

    // Create elements only if data exists
    const elements = [
        `    <persName>
        <surname>${data.familyName || ''}</surname>
        <forename>${data.givenName || ''}</forename>
    </persName>`,
        data.gender ? `    <gender value="${data.gender}">${data.gender}</gender>` : null,
        (data.birthDate || data.birthPlace) ? 
            `    <birth>
        ${data.birthDate ? `<date when="${data.birthDate}"/>` : ''}
        ${data.birthPlace ? `<place xml:id="${data.birthPlace}"/>` : ''}
    </birth>` : null,
        (data.deathDate || data.deathPlace) ?
            `    <death>
        ${data.deathDate ? `<date when="${data.deathDate}"/>` : ''}
        ${data.deathPlace ? `<place xml:id="${data.deathPlace}"/>` : ''}
    </death>` : null,
        identifiers ? identifiers : null
    ].filter(Boolean).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<person xml:id="${data.subjectUri}">
${elements}
</person>`;
}