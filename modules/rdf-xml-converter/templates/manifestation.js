/**
 * Generates XML string with work data
 * @param {import('../types').ManifestationData} data
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

function isEffectivelyEmpty(obj) {
    if (!obj || typeof obj !== 'object') return true;

    return Object.values(obj).every(value => {
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object' && value !== null) return isEffectivelyEmpty(value);
        return value === '' || value === null || value === undefined;
    });
}

export function generateManifestationXML(data) {
    let contributorElements = [];
    // Add contributions with persName/corpName elements inside contributor
    if (data.contributors && data.contributors.length > 0) {
        contributorElements = data.contributors.map(contribution => {
            const agent = ` sameas="${contribution.agent}"` || '';
            const role = contribution.role || '';
            const cert = contribution.certainty || '';
            
            // Check if it's an institution or person
            const isInstitution = agent.toLowerCase().includes('institution');
            
            const elementType = isInstitution ? 'corpName' : 'persName';
            
            return `        <${elementType} role="${role}" cert="${cert}"/>`;
        }).join('\n');
    }

    const identifiers = data.sameAs.map(uri => 
        `    <identifier auth.uri="${uri}"/>`
    ).join('\n');

    const elements = [

        // Identifiers
        identifiers ? identifiers : null,

        // Titles with type
        `   <titleStmt>
        <title>${data.title?.title || ''}</title>
        ${contributorElements ? `<respStmt>
${contributorElements}
        </respStmt>` : ''}
    </titleStmt>`,

        // Imprint information
        `    <pubStmt label="${data.publication?.label || ''}">
        <date${data.publication?.startDate ? ` startdate="${data.publication.startDate}"` : ''}${
                data.publication?.endDate ? ` enddate="${data.publication.endDate}"` : ''}/>
        <pubPlace${data.publication.location ? ` sameas="${data.publication.location}"` : ''}/>
        <publisher${data.publication.publisher ? ` sameas="${data.publication.publisher}"` : ''}/>
    </pubStmt>`,
        
        // phys desc
        !isEffectivelyEmpty(data.physDesc) || data.titlePages?.length > 0 ? `   <physDesc>
    ${!isEffectivelyEmpty(data.physDesc?.extent) ? `    <extent quantity="${data.physDesc?.extent?.value || ''}" unit="${data.physDesc?.extent?.unit.split('#')[1] || ''}"/>` : ''}
    ${data.physDesc?.dimensions?.length > 0 ? `    <dimensions>
${data.physDesc.dimensions.map(dimension => `           <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" quantity="${dimension.value}"/>`
            ).join('\n')}
        </dimensions>` : ''}
${data.titlePages?.length > 0 ? data.titlePages.map((titlePage, index) => `        <titlePage label="${titlePage.type || ''}" n="${index + 1}">
            <p>${titlePage.paragraph}</p>
        </titlePage>`
            ).join('\n') : '' }
${data.physDesc?.watermarks?.length > 0 ? data.physDesc?.watermarks.map(watermark => `         <watermark sameas="${Array.isArray(watermark.sameAs) ? watermark.sameAs.join(' ') : watermark.sameAs}">
            <title>${watermark.type || ''}</title>
            <heraldry>${watermark.heraldry || ''}</heraldry>
            <annot type="content"><p>${watermark.content || ''}</p></annot>
            <locus>${watermark.position || ''}</locus>
            <annot type="creation">
                <date${watermark.creationDate?.value ? ` isodate="${watermark.creationDate.value}"` : ''}${watermark.creationDate?.startDate ? ` startdate="${watermark.creationDate.startDate}"` : ''}${
            watermark.creationDate?.endDate ? ` enddate="${watermark.creationDate.endDate}"` : ''}${
            watermark.creationDate?.notAfter ? ` notafter="${watermark.creationDate.notAfter}"` : ''}${
            watermark.creationDate?.notBefore ? ` notbefore="${watermark.creationDate.notBefore}"` : ''}${
            watermark.creationDate?.certainty ? ` cert="${watermark.creationDate.certainty}"` : ''}>${watermark.creationDate.dateDescription || ''}</date>
                <geogName type="place"${watermark.creationLocation ? ` sameas="${watermark.creationLocation}"` : ''}/>
                <geogName type="paper_mill"${watermark.paperMill ? ` sameas="${watermark.paperMill}"` : ''}/>
                <persName role="paper_maker"${watermark.paperMaker ? ` sameas="${watermark.paperMaker}"` : ''}/>
            </annot>
    ${watermark.dimensions?.length > 0 ? `        <dimensions>
${watermark.dimensions.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" quantity="${dimension.value}"/>`
            ).join('\n')}
            </dimensions>` : ''}
        </watermark>`
            ).join('\n') : '' }
    ${data.physDesc.physicalMedium?.length > 0 ?data.physDesc.physicalMedium.map(medium => `    <physMedium><p>${medium}</p></physMedium>`).join('\n') : ''}
    ${data.physDesc.plateNumber ? `    <plateNum>${data.physDesc.plateNumber}</plateNum>` : ''}
    ${data.physDesc?.addDescAuto || data.physDesc?.addDescForeign ? `    <addDesc>
            <annot type="autograph">
                <p>${data.physDesc?.addDescAuto || ''}</p>
            </annot>
            <annot type="foreign">
                <p>${data.physDesc?.addDescForeign || ''}</p>
            </annot>
        </addDesc>` : ''}
    ${data.physDesc?.supportDescAuto || data.physDesc?.supportDescForeign ? `    <supportDesc>
            <annot type="autograph">
                <p>${data.physDesc?.supportDescAuto || ''}</p>
            </annot>
            <annot type="foreign">
                <p>${data.physDesc?.supportDescForeign || ''}</p>
            </annot>
        </supportDesc>` : ''}
    ${data.physDesc?.condition ? `   <condition>
            <p type="general_description">${data.physDesc?.condition || ''}</p>
        </condition>` : ''}
        ${data.physDesc.decoDesc ? `    <decoDesc><p>${data.physDesc.decoDesc}</p></decoDesc>` : ''}
        ${data.physDesc.scriptDesc ? `    <scriptDesc><p>${data.physDesc.scriptDesc}</p></scriptDesc>` : ''}
        ${data.physDesc.stamp?.length > 0 ? data.physDesc.stamp?.map(stamp => `<stamp>${stamp}</stamp>`).join('\n') : ''}
    ${!isEffectivelyEmpty(data.physDesc.binding) ? `    <bindingDesc>
            <binding>
                <condition>
                    <p>${data.physDesc.binding.condition || ''}</p>
                </condition>
                <decoNote>
                    <p>${data.physDesc.binding.decoDesc || ''}</p>
                </decoNote>
    ${data.physDesc.binding.dimensions?.length > 0 ? `        <dimensions>
                    ${data.physDesc.binding.dimensions?.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit?.split('#')[1] || ''}" quantity="${dimension.value}"/>`
        ).join('\n')}
                </dimensions>` : ''}
            </binding>
            <p>${data.physDesc.binding.description || ''}</p>
        </bindingDesc>` : ''}
    ${!isEffectivelyEmpty(data.physDesc.paperDetail) ? `    <physMedium type="paper" label="${data.physDesc.paperDetail.label || ''}">
            <dimensions>
            ${data.physDesc.paperDetail.pagination ? `    <locusGrp>
                    <locus>${data.physDesc.paperDetail.pagination}</locus>
                </locusGrp>` : ''}
            ${data.physDesc.paperDetail.orientation ? `    <term>${data.physDesc.paperDetail.orientation}</term>` : ''}
            ${!isEffectivelyEmpty(data.physDesc.paperDetail.extent) ? `    <extent quantity="${data.physDesc.paperDetail.extent.value}" unit="${data.physDesc.paperDetail.extent.unit.split('#')[1]}"/>` : ''}
            ${data.physDesc.paperDetail.format.length > 0 ? `     <dimensions type="format">
${data.physDesc.paperDetail.format.map(format => `                  <${format.type || ''} unit="${format.unit?.split('#')[1] || ''}" quantity="${format.value}"/>`
            ).join('\n')}
                </dimensions>` : ''}
            ${data.physDesc.paperDetail.rastral.dimensions.length > 0 ? `     <dimensions type="rastral_mirror">
${data.physDesc.paperDetail.rastral.dimensions.map(dimension => `                   <${dimension.type || ''} unit="${dimension.unit?.split('#')[1] || ''}" quantity="${dimension.value}"/>`
            ).join('\n')}
                </dimensions>` : ''}
            </dimensions>
            ${data.physDesc.paperDetail.quality || data.physDesc.paperDetail.condition ? `    <supportDesc>
            ${data.physDesc.paperDetail.quality ? `    <support type="paper_quality"><p>${data.physDesc.paperDetail.quality}</p></support>` : ''}
            ${data.physDesc.paperDetail.condition ? `    <condition><p>${data.physDesc.paperDetail.condition}</p></condition>` : ''}
            </supportDesc>` : ''}
            ${!isEffectivelyEmpty(data.physDesc.paperDetail.binding) ? `<bindingDesc>
                <binding>
                    <condition><p>${data.physDesc.paperDetail.binding.condition || ''}</p></condition>
                    <decoNote><p>${data.physDesc.paperDetail.binding.decoDesc || ''}</p></decoNote>
                 ${data.physDesc.paperDetail.binding.dimensions?.length > 0 ? `<dimensions>
                        ${data.physDesc.paperDetail.binding.dimensions.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" quantity="${dimension.value}"/>`
            ).join('\n')}
                    </dimensions>` : ''}
                </binding>
                <p>${data.physDesc.paperDetail.binding.description || ''}</p>
            </bindingDesc>` : ''}
            ${data.physDesc?.paperDetail.watermarks?.length > 0 ? data.physDesc?.paperDetail.watermarks.map(watermark => `<watermark sameas="${Array.isArray(watermark.sameAs) ? watermark.sameAs.join(' ') : watermark.sameAs}">
                <title>${watermark.type || ''}</title>
                <heraldry>${watermark.heraldry || ''}</heraldry>
                <annot type="content"><p>${watermark.content || ''}</p></annot>
                <locus>${watermark.position || ''}</locus>
                <annot type="creation">
                    <date${watermark.creationDate?.value ? ` isodate="${watermark.creationDate.value}"` : ''}${watermark.creationDate?.startDate ? ` startdate="${watermark.creationDate.startDate}"` : ''}${
            watermark.creationDate?.endDate ? ` enddate="${watermark.creationDate.endDate}"` : ''}${
            watermark.creationDate?.notAfter ? ` notafter="${watermark.creationDate.notAfter}"` : ''}${
            watermark.creationDate?.notBefore ? ` notbefore="${watermark.creationDate.notBefore}"` : ''}${
            watermark.creationDate?.certainty ? ` cert="${watermark.creationDate.certainty}"` : ''}>${watermark.creationDate?.dateDescription || ''}</date>
                    <geogName type="place"${watermark.creationLocation ? ` sameas="${watermark.creationLocation}"` : ''}/>
                    <geogName type="paper_mill"${watermark.paperMill ? ` sameas="${watermark.paperMill}"` : ''}/>
                    <persName role="paper_maker"${watermark.paperMaker ? ` sameas="${watermark.paperMaker}"` : ''}/>
                </annot>
        ${watermark.dimensions?.length > 0 ? `        <dimensions>
    ${watermark.dimensions.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" quantity="${dimension.value}"/>`
                ).join('\n')}
                </dimensions>` : ''}
            </watermark>`
            ).join('\n') : '' }
        </physMedium>` : ''}
        ${!isEffectivelyEmpty(data.physDesc.inscription) ? `<inscription>
                <persName${data.physDesc.inscription.agent ? ` sameas="${data.physDesc.inscription.agent || ''}}"` : ''}/>
                <annot><p>${data.physDesc.inscription.description || ''}</p></annot>
            </inscription>` : ''}
    </physDesc>` : '' ,

    // Contents
        data.contents?.length > 0 ? `<contents>
            ${data.contents.map(content => 
                `   <head>${content.label || ''}</head>
                        ${content.paragraph?.length > 0 ? 
                            content.paragraph.map(paragraph => 
                `<contentItem>${paragraph}</contentItem>`
            ).join('\n') : ''}`
            ).join('\n')}</contents>` : '',

        // Annotations
        data.annotation?.length > 0 ? `<notesStmt>
            ${data.annotation.map(annotation => 
                `   <annot label="${annotation.label || ''}" type="description">
                        ${annotation.paragraph?.length > 0 ? 
                            annotation.paragraph.map(paragraph => 
                `<p>${paragraph}</p>`
            ).join('\n') : ''}
                    </annot>`
            ).join('\n')}</notesStmt>` : '',
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

    // Add relation elements inside relationList
    if (data.expressions || data.isPartOf || data.hasPart || data.otherRelations ) {
        const expressionElements = data.expressions.map(expression => {
            return `        <relation rel="isEmbodimentOf" target="${expression}"/>`;
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
${expressionElements || ''}
${partOfElements || ''}
${hasPartElements || ''}
${otherElements || ''}
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
    <manifestationList>
<manifestation sameas="${data.subjectUri}" label="${data.title?.titleType || ''}">
${validElements}
</manifestation>
    </manifestationList>
</meiHead>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}