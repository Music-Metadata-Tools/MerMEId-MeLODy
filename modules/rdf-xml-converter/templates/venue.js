/**
 * Generates XML string with person data
 * @param {import('../types').VenueData} data 
 * @returns {string}
 */
export function generateVenueXML(data) {
    const identifiers = data.sameAs.map(uri => 
        `    <idno>${uri}</idno>`
    ).join('\n');

    // Create elements only if data exists
    const elements = [
        `    <placeName>${data.name || ''}</placeName>`,
        data.containedIn ? `    <location>
        <settlement type="city" xml:id="${data.containedIn}"/>
    </location>` : null,
        data.description ? `    <desc>${data.description}</desc>` : null,
        identifiers ? identifiers : null
    ].filter(Boolean).join('\n');

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<place xml:id="${data.subjectUri}" type="venue">
${elements}
</place>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

return xml;
}