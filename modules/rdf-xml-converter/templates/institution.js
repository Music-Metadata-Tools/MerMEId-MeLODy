/**
 * Generates XML string with person data
 * @param {import('../types').InstitutionData} data 
 * @returns {string}
 */

// Formatting helper function
function formatXML(xml) {
    let formatted = '';
    let indent = '';
    const tab = '    ';
    xml.split(/>\s*</).forEach(node => {
        if (node.match(/^\/\w/)) {
            // Closing tag
            indent = indent.substring(tab.length);
        }
        formatted += indent + '<' + node + '>\n';
        if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith("?")) {
            // Add indent for next line
            indent += tab;
        }
    });
    return formatted.substring(1, formatted.length - 2);
}

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

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<corpName xml:id="${data.subjectUri}">
${elements}
</corpName>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}