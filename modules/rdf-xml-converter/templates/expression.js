/**
 * Generates XML string with work data
 * @param {import('../types').ExpressionData} data
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

export function generateExpressionXML(data) {
    
    const link = data.sameAs
            ? ` sameAs="${Array.isArray(data.sameAs) ? data.sameAs.join(' ') : data.sameAs}"`
            : '';

    const elements = [

        // Identifiers
        data.identifiers?.length > 0 ? 
            data.identifiers.map(identifier => 
                `   <identifier label="${identifier.label || ''}">${identifier.value}</identifier>`
            ).join('\n') : null,

        // work status
        data.completionStatus ? 
            `   <annot type="completionStatus"><p>${data.completionStatus.split('#')[1]}</p></annot>` : null,

        // Description
        data.description?.length > 0 ? 
            data.description.map(description => 
                `    <annot type="description"><p>${description}</p></annot>`
            ).join('\n') : null,
        
        // creation information
        `   <creation>
        <date${data.creationDate?.value ? ` isodate="${data.creationDate.value}"` : ''}${data.creationDate?.startDate ? ` startdate="${data.creationDate.startDate}"` : ''}${
            data.creationDate?.endDate ? ` enddate="${data.creationDate.endDate}"` : ''}${
            data.creationDate?.notAfter ? ` notAfter="${data.creationDate.notAfter}"` : ''}${
            data.creationDate?.notBefore ? ` notBefore="${data.creationDate.notBefore}"` : ''}${
            data.creationDate?.certainty ? ` cert"${data.creationDate.certainty}"` : ''}>${data.creationDate.dateDescription}</date>
        <geogName xml:id="${data.creationLocation || ''}"/>
    </creation>`,

    // history information
        `   <history>
    ${data.historicEvent?.length > 0 ? 
            `   <eventList type="history">
${data.historicEvent.map(event => 
                `           <event xml:id="${event || ''}"/>`
            ).join('\n')}
        </eventList>` : ''}
    ${data.performances?.length > 0 || data.firstPerformance ? 
            `   <eventList type="performances">
${data.firstPerformance ? 
            `           <event type="firstPerformance" xml:id="${data.firstPerformance}"/>` : ''}
${data.performances.map(event => 
            `           <event xml:id="${event || ''}"/>`
            ).join('\n')}
        </eventList>` : ''}
    </history>`,
    // extent
        data.extent ? 
            `    <extent>${data.extent}</extent>` : null,
    // tempo
        data.tempo ? 
            `    <tempo>${data.tempo}</tempo>` : null,

    // key information
        `    <key${data.key?.pitch ? ` pname="${data.key.pitch.split('#')[1]}"` : ''}${
            data.key?.accidental ? ` accid="${data.key.accidental.split('#')[1]}"` : ''}${
            data.key?.mode ? ` mode="${data.key.mode}"` : ''}>${data.key.description}</key>`,
    // meter information
        `    <meter${data.meter?.count ? ` count="${data.meter.count}"` : ''}${
            data.meter?.unit ? ` unit="${data.meter.unit}"` : ''}${
            data.meter?.symbol ? ` sym="${data.meter.symbol}"` : ''}>${data.meter.description}</meter>`,
    // duration
        data.duration ? 
            `    <perfDuration><p>${data.duration}</p></perfDuration>` : '',
    // mensuration
        data.mensuration ? 
            `    <mensuration>${data.mensuration}</mensuration>` : '',
    // instrumentation
        data.instrumentation ? 
            `    <perfMedium xml:id="${data.instrumentation}"/>` : '',
    // incipit
        `   <incip>
        ${data.incipit.text ? 
            `    <incipText><p>${data.incipit.text}</p></incipText>` : ''}
        ${data.incipit.mei?.length > 0 ? 
            data.incipit.mei.map(score => 
                `           <score xml:id="${score || ''}"/>`
            ).join('\n') : '' }
        ${data.incipit.value?.length > 0 ? 
            data.incipit.value.map(pae => 
                `           <incipCode type="PAE">${pae || ''}"</incipCode>`
            ).join('\n') : '' }
    </incip>`,
    ];


    // Add language elements inside langUsage
    if (data.language && data.language.length > 0) {
        const langElements = data.language.map(lang => {
            return `        <language xml:id="${lang}" xml:lang=""/>`;
        }).join('\n');

        elements.push(`    <langUsage>
${langElements }
    </langUsage>`);
    }

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
            return `            <term sameAs="${term}"/>`;
        }).join('\n');

        elements.push(`    <classification>
        <termList>
${termElements}
        </termList>
    </classification>`);
    }

    // Add movements
    if ( data.movements && data.movements.length > 0 ) {
        const expressionElements = data.movements.map(movement => {
            const label = movement.label || '';
            const iri = movement.expression || '';
            
            return `        <expression xml:id="${iri}" n="${movement.indexOf()}">
            <title xml:lang="">${label}</title>
        </expression>`;
        }).join('\n');

        elements.push(`    <componentList>
${expressionElements}
    </componentList>`);
    }

    // Add relation elements inside relationList
    if ( data.otherRelations ) {
        const otherElements = data.otherRelations.map(relation => {
            return `        <relation rel="" xml:id="${relation}"/>`;
        }).join('\n');

        elements.push(`    <relationList>
${otherElements}
    </relationList>`);
    }

    const validElements = elements.filter(Boolean).join('\n');

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<expression xml:id="${data.subjectUri}" label="${data.label}"${link}>
${validElements}
</expression>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}