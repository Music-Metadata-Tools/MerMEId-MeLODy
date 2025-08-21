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
        data.location ? `    <geogName sameas="${data.location}"/>` : null,
        data.address ? `    <address><addrLine>${data.address}</addrLine></address>` : null,
        data.date ? `    <date${data.date.value ? ` isodate="${data.date.value}"` : ''}${
        data.date.startDate ? ` startdate="${data.date.startDate}"` : ''}${
        data.date.endDate ? ` enddate="${data.date.endDate}"` : ''}${
        data.date.notBefore ? ` notbefore="${data.date.notBefore}"` : ''}${
        data.date.notAfter ? ` notafter="${data.date.notAfter}"` : ''}${
        data.date.certainty ? ` cert="${data.date.certainty}"` : ''}>${
        data.date.dateDescription || ''}</date>` : null,
        data.description ? `    <annot type="description"><p>${data.description}</p></annot>` : null
        
    ].filter(Boolean).join('\n');

let xml = `
<meiHead xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
    <fileDesc>
        <titleStmt>
            <title/>
        </titleStmt>
        <pubStmt/>
    </fileDesc>
    <workList>
        <work>
            <title/>
            <contributor>
<corpName sameas="${data.subjectUri}">
${elements}
</corpName>
</contributor>
        </work>
    </workList>
</meiHead>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}