/**
 * Generates XML string with work data
 * @param {import('../types').WorkData} data
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

export function generateWorkXML(data) {

    const identifiers = data.sameAs.map(uri => 
        `    <identifier auth.uri="${uri}"/>`
    ).join('\n');

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
                `    <identifier label="${identifier.label || ''}">${identifier.value}</identifier>`
            ).join('\n') : '',

        // External Identifiers
        identifiers ? identifiers : null,

        // Titles with type
        data.titles?.length > 0 ? 
            data.titles?.map(title => 
                `    <title type="${title.titleType.split('#')[1] || ''}" xml:lang="${title.language || ''}">${title.title}</title>`
            ).join('\n') : '<title/>',

        // Contributors
        contributorElements.length > 0 ? `<contributor>${contributorElements}</contributor>` : null,

        // history description
        data.historyDescription?.length > 0 ? 
            `    <history>
                ${data.historyDescription.map(desc => 
                `    <p>${desc}</p>`
            ).join('\n')}</history>` : '',
        
        // context
        data.context ? 
            `    <context><p>${data.context}</p></context>` : '',

        // Bibliography/citations
        biblElements.length > 0 ? `<biblList>${biblElements}</biblList>` : null,

        //work status and description
        data.workStatus || data.annotation?.length > 0 ? `    <notesStmt>
        ${data.workStatus ? 
            `   <annot type="workStatus"><p>${data.workStatus}</p></annot>` : ''}
        ${// Annotations
        data.annotation?.length > 0 ? 
            data.annotation.map(annotation => 
                `   <annot label="${annotation.label || ''}" type="description">
                        ${annotation.paragraph?.length > 0 ? 
                            annotation.paragraph.map(paragraph => 
                `<p>${paragraph}</p>`
            ).join('\n') : ''}
                    </annot>`
            ).join('\n') : ''}</notesStmt>` : '',
    ];

    // Add term elements inside classification
    if (data.classification && data.classification.length > 0) {
        const termElements = data.classification.map(term => {
            return `        <term sameas="${term}"/>`;
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
            return `        <relation rel="isRealisedIn" target="${expression}"/>`;
        }).join('\n');

        const partOfElements = data.isPartOf.map(partOf => {
            return `        <relation rel="isPartOf" target="${partOf}"/>`;
        }).join('\n');

        const hasPartElements = data.hasPart.map(hasPart => {
            return `        <relation rel="hasPart" target="${hasPart}"/>`;
        }).join('\n');

        const otherElements = data.otherRelations.map(relation => {
            return `        <relation rel="" target="${relation}"/>`;
        }).join('\n');

        elements.push(`    <relationList>
${expressionElements}
${partOfElements}
${hasPartElements}
${otherElements}
    </relationList>`);
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
<work sameas="${data.subjectUri}">
${validElements}
</work>
    </workList>
</meiHead>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}