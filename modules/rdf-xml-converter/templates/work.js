/**
 * Generates XML string with work data
 * @param {import('../types').WorkData} data
 * @returns {string}
 */
export function generateWorkXML(data) {
    
    const link = data.sameAs
            ? ` sameAs="${Array.isArray(data.sameAs) ? data.sameAs.join(' ') : data.sameAs}"`
            : '';

    const elements = [

        // Identifiers
        data.identifiers?.length > 0 ? 
            data.identifiers.map(identifier => 
                `    <identifier label="${identifier.label || ''}">${identifier.value}</identifier>`
            ).join('\n') : '',

        // Titles with type
        data.titles?.length > 0 ? 
            data.titles.map(title => 
                `    <title type="${title.titleType || ''}" xml:lang="${title.language || ''}">${title.title}</title>`
            ).join('\n') : '',

        // work status
        data.workStatus ? 
            `    <annot type="workStatus">
                    <p>${data.workStatus}</p>
                </annot>` : '',

        // Description
        data.description?.length > 0 ? 
            data.description.map(description => 
                `   <annot type="description">
                        <p>${description}</p>
                    </annot>`
            ).join('\n') : '',
        
        // context
        data.context ? 
            `    <context><p>${data.context}</p></context>` : '',

        // history description
        data.historyDescription ? 
            `    <history><p>${data.historyDescription}</p></history>` : '',
    ];

    // Add contributions with persName/corpName elements inside contributor
    if (data.contributors && data.contributors.length > 0) {
        const contributorElements = data.contributors.map(contribution => {
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

    // Add bibl elements inside biblList
    if (data.citations && data.citations.length > 0) {
        const biblElements = data.citations.map(bibl => {
            return `        <bibl xml:id="${bibl}"/>`;
        }).join('\n');

        elements.push(`    <biblList>
${biblElements }
    </biblList>`);
    }

    // Add term elements inside classification
    if (data.classification && data.classification.length > 0) {
        const termElements = data.classification.map(term => {
            return `        <term sameAs="${term}"/>`;
        }).join('\n');

        elements.push(`    <classification>
            <termList>
${termElements}
    </termList>
</classification>`);
    }

    // Add relation elements inside relationList
    if (data.expressions || data.isPartOf || data.hasPart || data.otherRelations ) {
        const expressionElements = data.expressions.map(expression => {
            return `        <relation rel="isRealisedIn" xml:id="${expression}"/>`;
        }).join('\n');

        const partOfElements = data.isPartOf.map(partOf => {
            return `        <relation rel="isPartOf" xml:id="${partOf}"/>`;
        }).join('\n');

        const hasPartElements = data.hasPart.map(hasPart => {
            return `        <relation rel="hasPart" xml:id="${hasPart}"/>`;
        }).join('\n');

        const otherElements = data.otherRelations.map(relation => {
            return `        <relation rel="" xml:id="${relation}"/>`;
        }).join('\n');

        elements.push(`    <relationList>
${expressionElements}
${partOfElements}
${hasPartElements}
${otherElements}
    </relationList>`);
    }

    const validElements = elements.filter(Boolean).join('\n');

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<work xml:id="${data.subjectUri}"${link}>
${validElements}
</work>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

return xml;
}