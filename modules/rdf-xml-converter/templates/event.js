/**
 * Generates XML string with event data
 * @param {import('../types').EventData} data 
 * @returns {string}
 */

// Add this helper function before generateEventXML
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

export function generateEventXML(data) {

    // ToDo: Need to change cert="https://lod.academy/melod/vocab/terms#HighCertainty" to high as value
    const elements = [
    `    <name>${data.label || ''}</name>`,
    data.date ? `    <date${data.date.value ? ` isodate="${data.date.value}"` : ''}${
        data.date.startDate ? ` startdate="${data.date.startDate}"` : ''}${
        data.date.endDate ? ` enddate="${data.date.endDate}"` : ''}${
        data.date.notBefore ? ` notbefore="${data.date.notBefore}"` : ''}${
        data.date.notAfter ? ` notafter="${data.date.notAfter}"` : ''}${
        data.date.certainty ? ` cert="${data.date.certainty}"` : ''}>${
        data.date.dateDescription || ''}</date>` : null,
        data.location ? `    <geogName sameas="${data.location}"/>` : null
    ];

    // Add contributions with persName/corpName elements inside contributor
    if (data.contributions && data.contributions.length > 0) {
        const contributorElements = data.contributions.map(contribution => {
            const agent = contribution.agent || '';
            const role = contribution.role || '';
            const cert = contribution.certainty || '';
            
            // Check if it's an institution or person
            const isInstitution = agent.toLowerCase().includes('institution');
            
            const elementType = isInstitution ? 'corpName' : 'persName';
            
            return `        <${elementType} role="${role}" cert="${cert}" sameas="${agent}"/>`;
        }).join('\n');

        elements.push(contributorElements);
    }

    if (data.description) {
        elements.push(`    <desc>${data.description}</desc>`);
    }

    // Add bibliography/citations
    if (data.citations.length > 0) {
        const biblElements = data.citations.map(citation =>
            `        <bibl sameas="${citation}"/>`
        ).join('\n');

        elements.push(`    <biblList>
${biblElements}
    </biblList>`);
    }

    const validElements = elements.filter(Boolean).join('\n');

let xml =  
`<meiHead xmlns="http://www.music-encoding.org/ns/mei">
    <fileDesc>
        <titleStmt>
            <title/>
        </titleStmt>
        <pubStmt/>
    </fileDesc>
    <workList>
        <work>
            <title/>
            <history>
                <eventList>
                    <event${data.classification ? ` type="${data.classification || ''}"` : ''}${data.label ? ` label="${data.label || ''}"` : ''} sameas="${data.subjectUri}${data.sameAs?.length > 0 ? ` ${data.sameAs.join(' ')}` : ''}">
                    ${validElements}
                    </event>
                </eventList>
            </history>
        </work>
    </workList>
</meiHead>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}