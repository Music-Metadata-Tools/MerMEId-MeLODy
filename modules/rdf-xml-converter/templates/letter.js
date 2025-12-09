/**
 * Generates XML string with event data
 * @param {import('../types').LetterData} data 
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

export function generateLetterXML(data) {

    // ToDo: Need to change cert="https://lod.academy/melod/vocab/terms#HighCertainty" to high as value
    const elements = [
    `<correspAction type="sent">
        <placeName${data.sent.place ? ` key="${data.sent.place}"` : ''}/>
        ${data.sent.participant?.length > 0 ? data.sent.participant.map(participant => `    <persName key="${participant}"/>`).join('\n') : ''}
        <date${data.sent.date?.value ? ` when="${data.sent.date?.value}"` : ''}${data.sent.date?.startDate ? ` startdate="${data.sent.date?.startDate}"` : ''}${
            data.sent.date?.endDate ? ` enddate="${data.sent.date?.endDate}"` : ''}${
            data.sent.date?.notAfter ? ` notafter="${data.sent.date?.notAfter}"` : ''}${
            data.sent.date?.notBefore ? ` notbefore="${data.sent.date?.notBefore}"` : ''}${
            data.sent.date?.certainty ? ` cert="${data.sent.date?.certainty}"` : ''}>${data.sent.date?.dateDescription || ''}</date>
    </correspAction>`,
    // Received information
        `<correspAction type="received">
        <placeName${data.received.place ? ` ref="${data.received.place}"` : ''}/>
        ${data.received.participant?.length > 0 ? data.received.participant.map(participant => `    <persName ref="${participant}"/>`).join('\n') : ''}
        <date${data.received.date?.value ? ` when="${data.received.date?.value}"` : ''}${data.received.date?.startDate ? ` from="${data.received.date?.startDate}"` : ''}${
            data.received.date?.endDate ? ` to="${data.received.date?.endDate}"` : ''}${
            data.received.date?.notAfter ? ` notAfter="${data.received.date?.notAfter}"` : ''}${
            data.received.date?.notBefore ? ` notBefore="${data.received.date?.notBefore}"` : ''}${
            data.received.date?.certainty ? ` cert="${data.received.date?.certainty}"` : ''}>${data.received.date?.dateDescription || ''}</date>
    </correspAction>`,
    ];

    if (data.description) {
        elements.push(`    <note>${data.description}</note>`);
    }

    const validElements = elements.filter(Boolean).join('\n');

let xml =  
`<teiHeader xmlns="http://www.tei-c.org/ns/1.0">
    <fileDesc>
      <titleStmt>
        <title>${data.label}</title>
      </titleStmt>
      <publicationStmt>
        <publisher>Zentrum für Telemann-Pflege und -Forschung</publisher>
      </publicationStmt>
      <sourceDesc/>
    </fileDesc>
    <profileDesc>
      <correspDesc ref="${data.subjectUri}" sameas="${data.sameAs?.length > 0 ? ` ${data.sameAs.join(' ')}` : ''}">
                    ${validElements}
                    </correspDesc>
                </profileDesc>
  </teiHeader>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}