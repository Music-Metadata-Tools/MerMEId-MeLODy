/**
 * Generates XML string with person data
 * @param {import('../../types').PlaceData} data 
 * @returns {string}
 */
export function generatePlaceXML(data) {
    const identifiers = data.sameAs.map(uri => 
        `    <idno>${uri}</idno>`
    ).join('\n');

    // Create elements only if data exists
    const elements = [
        `    <placeName>${data.name || ''}</placeName>`,
        data.description ? `    <desc>${data.description}</desc>` : null,
        identifiers ? identifiers : null
    ].filter(Boolean).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<place xml:id="${data.subjectUri}">
${elements}
</place>`;
}