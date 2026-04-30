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
    
    let contributorElements = [];
    // Add contributions with persName/corpName elements inside contributor
    if (data.contributors && data.contributors.length > 0) {
        contributorElements = data.contributors.map(contribution => {
            const agent = contribution.agent || '';
            const role = contribution.role || '';
            const cert = contribution.certainty || '';
            
            // Check if it's an institution or person
            const isInstitution = agent.toLowerCase().includes('institution');
            
            const elementType = isInstitution ? 'corpName' : 'persName';
            
            return `        <${elementType} role="${role}" cert="${cert}" sameas="${agent}"/>`;
        }).join('\n');
    }

    let langElements = [];
    // Add language elements inside langUsage
    if (data.language && data.language.length > 0) {
        langElements = data.language.map(lang => {
            return `        <language sameas="${lang}"/>`;
        }).join('\n');
    }

    let biblElements = [];
    // Add bibl elements inside biblList
    if (data.citations && data.citations.length > 0) {
        biblElements = data.citations.map(bibl => {
            return `        <bibl sameas="${bibl}"/>`;
        }).join('\n');
    }
    
    const elements = [

        // Identifiers
        data.identifiers?.length > 0 ? 
            data.identifiers.map(identifier => 
                `   <identifier label="${identifier.label || ''}">${identifier.value}</identifier>`
            ).join('\n') : null,

        // Title
        `    <title>${data.label || ''}</title>`,

        contributorElements?.length > 0 ? `<contributor>${contributorElements}</contributor>` : '',
        
        // key information
        `    <key${data.key?.pitch ? ` pname="${data.key.pitch.split('#')[1]}"` : ''}${
            data.key?.accidental ? ` accid="${data.key.accidental.split('#')[1]}"` : ''}${
            data.key?.mode ? ` mode="${data.key.mode}"` : ''}>${data.key.description || ''}</key>`,
        // mensuration
        data.mensuration ? 
            `    <mensuration>${data.mensuration}</mensuration>` : '',
        // meter information
        `    <meter${data.meter?.count ? ` count="${data.meter.count}"` : ''}${
            data.meter?.unit ? ` unit="${data.meter.unit}"` : ''}${
            data.meter?.symbol ? ` sym="${data.meter.symbol}"` : ''}>${data.meter.description || ''}</meter>`,
        // incipit
        `   <incip>
        ${data.incipit.text ? 
            `    <incipText><p>${data.incipit.text}</p></incipText>` : ''}
        ${data.incipit.mei?.length > 0 ? 
            data.incipit.mei.map(score => 
                `           <score sameas="${score || ''}"/>`
            ).join('\n') : '' }
        ${data.incipit.value?.length > 0 ? 
            data.incipit.value.map(pae => 
                `           <incipCode type="PAE">${pae || ''}</incipCode>`
            ).join('\n') : '' }
    </incip>`,
        // tempo
        data.tempo ? 
            `    <tempo>${data.tempo}</tempo>` : '',

        // creation information
        `   <creation>
        <date${data.creationDate?.value ? ` isodate="${data.creationDate.value}"` : ''}${data.creationDate?.startDate ? ` startdate="${data.creationDate.startDate}"` : ''}${
            data.creationDate?.endDate ? ` enddate="${data.creationDate.endDate}"` : ''}${
            data.creationDate?.notAfter ? ` notafter="${data.creationDate.notAfter}"` : ''}${
            data.creationDate?.notBefore ? ` notbefore="${data.creationDate.notBefore}"` : ''}${
            data.creationDate?.certainty ? ` cert="${data.creationDate.certainty}"` : ''}>${data.creationDate.dateDescription}</date>
        <geogName type="place"${data.creationLocation ? ` sameas="${data.creationLocation}"`: ''}/>
    </creation>`,

    // history information
        `   <history>
    ${data.historicEvent?.length > 0  || data.historicEventObj?.length > 0 ? 
            `   <eventList type="history">
${data.historicEvent.map(event => 
                `           <event sameas="${event || ''}"/>`
            ).join('\n')}
${data.historicEventObj.map(event => 
                `               <event>
                <name>${event.label || ''}</name>
                <geogName type="place"${event.location ? ` sameas="${event.location}"` : ''}/>
                <date${event.date?.value ? ` isodate="${event.date?.value}"` : ''}${event.date?.startDate ? ` startdate="${event.date?.startDate}"` : ''}${
            event.date?.endDate ? ` enddate="${event.date?.endDate}"` : ''}${
            event.date?.notAfter ? ` notafter="${event.date?.notAfter}"` : ''}${
            event.date?.notBefore ? ` notbefore="${event.date?.notBefore}"` : ''}${
            event.date?.certainty ? ` cert="${event.date?.certainty}"` : ''}>${event.date?.dateDescription || ''}</date>
                ${event.contributions?.length > 0 && event.contribution.agent ? event.contributions.map(contribution => 
                    `<${contribution.agent.toLowerCase().includes('institution') ? 'corpName' : 'persName'} role="${contribution.role || ''}" sameas="${contribution.agent}"`).join('\n') : ''}
                <desc>${event.description || ''}</desc>
            </event>`
            ).join('\n')}
        </eventList>` : ''}
    ${data.performances?.length > 0 || data.firstPerformance ? 
            `   <eventList type="performances">
${data.firstPerformance ? 
            `           <event type="firstPerformance" sameas="${data.firstPerformance}"/>` : ''}
${data.performances.map(event => 
            `           <event sameas="${event || ''}"/>`
            ).join('\n')}
        </eventList>` : ''}
    </history>`,

    langElements?.length > 0 ? `<langUsage>${langElements}</langUsage>` : '',
    
    // instrumentation
        data.instrumentation ? 
            `    <perfMedium sameas="${data.instrumentation}"/>` : '',

    // duration
        data.duration ? 
            `    <perfDuration><p>${data.duration}</p></perfDuration>` : '',

    // extent
        data.extent ? 
            `    <extent>${data.extent}</extent>` : null,

    biblElements?.length > 0 ? `<biblList>${biblElements}</biblList>` : '',
    
    //work status and description
    data.completionStatus || data.annotation?.length > 0 ? `    <notesStmt>
        ${data.completionStatus ? 
            `   <annot type="completionStatus"><p>${data.completionStatus.split('#')[1]}</p></annot>` : ''}
        ${// Annotations
        data.annotation?.length > 0 ? 
            data.annotation.map(annotation => 
                `   <annot label="${annotation.label || ''}" type="description">
                        ${annotation.paragraph?.length > 0 ? 
                            annotation.paragraph.map(paragraph => 
                `<p>${paragraph}</p>`
            ).join('\n') : ''}
                    </annot>`
            ).join('\n') : ''}</notesStmt>` : ''
    ];


    // Add term elements inside classification
    if (data.classification && data.classification.length > 0) {
        const termElements = data.classification.map(term => {
            return `            <term sameas="${term}"/>`;
        }).join('\n');

        elements.push(`    <classification>
        <termList>
${termElements}
        </termList>
    </classification>`);
    }

    // Add movements
    if ( data.movements && data.movements.length > 0 || data.movementIris.length > 0 ) {
        const expressionElements = data.movements.map((movement, index) => {
            const label = movement.label || '';
            const iri = movement.expression || '';
            
            return `        <expression n="${movement.no || index + 1}">
            <title>${label}</title>
            <key${movement.key?.pitch ? ` pname="${movement.key.pitch.split('#')[1]}"` : ''}${
            movement.key?.accidental ? ` accid="${movement.key.accidental.split('#')[1]}"` : ''}${
            movement.key?.mode ? ` mode="${movement.key.mode}"` : ''}>${movement.key.description || ''}</key>
            <meter${movement.meter?.count ? ` count="${movement.meter?.count}"` : ''}${
            movement.meter?.unit ? ` unit="${movement.meter?.unit}"` : ''}${
            movement.meter?.symbol ? ` sym="${movement.meter?.symbol}"` : ''}>${movement.meter?.description || ''}</meter>
            ${movement.incipit ? `<incip>
            ${movement.incipit.text ? 
                `<incipText><p>${movement.incipit.text}</p></incipText>` : ''}
            ${movement.incipit.mei?.length > 0 ? 
                movement.incipit.mei.map(score => 
                    `<score sameas="${score || ''}"/>`
                ).join('\n') : '' }
            ${movement.incipit.value?.length > 0 ? 
                movement.incipit.value.map(pae => 
                    `<incipCode type="PAE">${pae || ''}</incipCode>`
                ).join('\n') : '' }
        </incip>` : ''}
            ${movement.tempo ? `<tempo>${movement.tempo}</tempo>` : ''}
            ${movement.instrumentation ? `<perfMedium sameas="${movement.instrumentation}"/>` : ''}
        </expression>`;
        }).join('\n');

        const movementElements = data.movementIris.map((movement, index) => {
            const iri = movement || '';
            
            return `        <expression sameas="${iri}" n="${index + 1}"><title/></expression>`;
        }).join('\n');

        elements.push(`    <componentList>
${expressionElements}
${movementElements}
    </componentList>`);
    }

    // Add relation elements inside relationList
    if ( data.otherRelations ) {
        const otherElements = data.otherRelations.map(relation => {
            return `        <relation rel="" sameas="${relation}"/>`;
        }).join('\n');

        elements.push(`    <relationList>
${otherElements}
    </relationList>`);
    }

    const validElements = elements.filter(Boolean).join('\n');

let xml = 
`<meiHead xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
    <fileDesc>
        <titleStmt>
            <title/>
        </titleStmt>
        <pubStmt/>
    </fileDesc>
    <workList>
        <work>
            <title/>
            <expressionList>
                <expression label="${data.label}" sameas="${data.subjectUri}${data.sameAs?.length > 0 ? ` ${data.sameAs.join(' ')}` : ''}">
                ${validElements}
                </expression>
            </expressionList>
        </work>
    </workList>
</meiHead>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}