/**
 * Generates XML string with person data
 * @param {import('../types').PersonData} data 
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

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<person xml:id="${data.subjectUri}">
${elements}
</person>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}