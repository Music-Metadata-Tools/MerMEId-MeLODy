/**
 * Generates XML string with person data
 * @param {import('../types').VenueData} data 
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

xml = formatXML(xml);

return xml;
}