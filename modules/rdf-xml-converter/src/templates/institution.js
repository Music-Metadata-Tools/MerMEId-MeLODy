/**
 * Generates XML string with person data
 * @param {import('../../types').InstitutionData} data 
 * @returns {string}
 */
export function generateInstitutionXML(data) {
    const identifiers = data.sameAs.map(uri => 
        `    <identifier auth.uri="${uri}"/>`
    ).join('\n');

    // Create elements only if data exists
    const elements = [
        identifiers ? identifiers : null,
        `    <name>${data.name || ''}</name>`,
        data.abbreviation ? `    <abbr>${data.abbreviation}</abbr>` : null,
        data.address ? `    <address>${data.address}</address>` : null,
        data.date ? `    <date${data.date.value ? ` isodate="${data.date.value}"` : ''}${
        data.date.startDate ? ` startdate="${data.date.startDate}"` : ''}${
        data.date.endDate ? ` enddate="${data.date.endDate}"` : ''}${
        data.date.notBefore ? ` notbefore="${data.date.notBefore}"` : ''}${
        data.date.notAfter ? ` notafter="${data.date.notAfter}"` : ''}${
        data.date.certainty ? ` cert="${data.date.certainty}"` : ''}>${
        data.date.dateDescription || ''}</date>` : null,
        data.location ? `    <geogName xml:id="${data.location}"/>` : null,
        data.description ? `    <desc>${data.description}</desc>` : null
        
    ].filter(Boolean).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<corpName xml:id="${data.subjectUri}">
${elements}
</corpName>`;
}