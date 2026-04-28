/**
 * Generates XML string with event data
 * @param {import('../types').PerformanceEventData} data 
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

export function generatePerformanceEventXML(data) {

    const elements = [

    `    <name>${data.label || ''}</name>`,
    data.date ? `    <date${data.date.value ? ` isodate="${data.date.value}"` : ''}${
        data.date.startDate ? ` startdate="${data.date.startDate}"` : ''}${
        data.date.endDate ? ` enddate="${data.date.endDate}"` : ''}${
        data.date.notBefore ? ` notbefore="${data.date.notBefore}"` : ''}${
        data.date.notAfter ? ` notafter="${data.date.notAfter}"` : ''}${
        data.date.certainty ? ` cert="${data.date.certainty}"` : ''}>${
        data.date.dateDescription || ''}</date>` : null,
        data.venue ? `    <geogName type="venue" sameas="${data.venue}"/>` : null,
        data.location ? `    <geogName type="place" sameas="${data.location}"/>` : null,
        data.duration ? `    <p type="duration">${data.duration}"</p>` : null
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

    if (data.annotation.length > 0) {
        const annotationElements = data.annotation.map(annotation => 
                `<desc label="${annotation.label || ''}">${annotation.paragraph?.length > 0 ? annotation.paragraph.map(paragraph => `${paragraph}`) : ''}</desc>`
            ).join('\n');

        elements.push(annotationElements);
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

let xml = `<meiHead xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
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
            <eventList type="performances">
                <event type="${data.classification || 'performance'}" label="${data.label || ''}" sameas="${data.subjectUri}${data.sameAs?.length > 0 ? ` ${data.sameAs.join(' ')}` : ''}">
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