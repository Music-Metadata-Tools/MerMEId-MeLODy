/**
 * Generates XML string with event data
 * @param {import('../../types').EventData} data 
 * @returns {string}
 */
export function generateEventXML(data) {
    const elements = [
    `    <name>${data.label || ''}</name>`,
    data.date ? `    <date${data.date.value ? ` isodate="${data.date.value}"` : ''}${
        data.date.startDate ? ` startdate="${data.date.startDate}"` : ''}${
        data.date.endDate ? ` enddate="${data.date.endDate}"` : ''}${
        data.date.notBefore ? ` notbefore="${data.date.notBefore}"` : ''}${
        data.date.notAfter ? ` notafter="${data.date.notAfter}"` : ''}${
        data.date.certainty ? ` cert="${data.date.certainty}"` : ''}>${
        data.date.dateDescription || ''}</date>` : null,
        data.location ? `    <geogName xml:id="${data.location}"/>` : null
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
            
            return `        <${elementType} role="${role}" cert="${cert}" xml:id="${agent}"/>`;
        }).join('\n');

        elements.push(`    <contributor>
${contributorElements}
    </contributor>`);
    }

    // Add bibliography/citations
    if (data.citations.length > 0) {
        const biblElements = data.citations.map(citation =>
            `        <bibl xml:id="${citation}"/>`
        ).join('\n');

        elements.push(`    <biblList>
${biblElements}
    </biblList>`);
    }

    if (data.description) {
        elements.push(`    <desc>${data.description}</desc>`);
    }

    const validElements = elements.filter(Boolean).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<event type="${data.classification || ''}" 
       label="${data.label || ''}" 
       xml:id="${data.subjectUri}" 
       sameas="${data.sameAs.join(' ')}">
${validElements}
</event>`;
}