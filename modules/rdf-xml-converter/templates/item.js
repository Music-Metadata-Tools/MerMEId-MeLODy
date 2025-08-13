/**
 * Generates XML string with work data
 * @param {import('../types').ItemData} data
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

export function generateItemXML(data) {
    
    const link = data.sameAs
            ? ` sameAs="${Array.isArray(data.sameAs) ? data.sameAs.join(' ') : data.sameAs}"`
            : '';

    const elements = [

        // Repository
        data.repository || data.shelfmark || data.formerShelfmark ? `    <physLoc>
        <repository xml:id="${data.repository || ''}"/>
        <identifier type="shelfmark">${data.shelfmark || ''}</identifer>
        ${data.formerShelfmark ? `<identifier type="former_shelfmark">${data.formerShelfmark}</identifier>` : ''}
    </physLoc>` : '',

    // history
        data.history?.length > 0 || data.provenance?.length > 0 || !isEffectivelyEmpty(data.acquisition) ? `    <history>
        ${!isEffectivelyEmpty(data.acquisition) ? `<acquisition>
            <date${data.acquisition?.value ? ` isodate="${data.acquisition?.value}"` : ''}${data.acquisition?.startDate ? ` startdate="${data.acquisition?.startDate}"` : ''}${
            data.acquisition?.endDate ? ` enddate="${data.acquisition?.endDate}"` : ''}${
            data.acquisition?.notAfter ? ` notAfter="${data.acquisition?.notAfter}"` : ''}${
            data.acquisition?.notBefore ? ` notBefore="${data.acquisition?.notBefore}"` : ''}${
            data.acquisition?.certainty ? ` cert"${data.acquisition?.certainty}"` : ''}>${data.acquisition?.dateDescription || ''}</date>
        </acquisition>` : ''}
        ${data.provenance?.length > 0 ? `<provenance>
            <eventList>
${data.provenance.map(event => 
                `               <event xml:id="${event || ''}"/>`
            ).join('\n')}
            </eventList>
        </provenance>` : ''}
        ${data.history?.length > 0 ? 
            `<eventList>
${data.history.map(event => 
                `           <event xml:id="${event || ''}"/>`
            ).join('\n')}
        </eventList>` : ''}
    </history>` : '',

        // phys desc
        !isEffectivelyEmpty(data.physDesc) || data.titlePages?.length > 0 || data.hands?.length > 0 ? `   <physDesc>
    ${!isEffectivelyEmpty(data.physDesc?.extent) ? `    <extent quantity="${data.physDesc?.extent?.value || ''}" unit="${data.physDesc?.extent?.unit.split('#')[1] || ''}"/>` : ''}
    ${data.physDesc?.dimensions?.length > 0 ? `    <dimensions>
${data.physDesc.dimensions.map(dimension => `           <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" value="${dimension.value}"/>`
            ).join('\n')}
        </dimensions>` : ''}
${data.titlePages?.length > 0 ? data.titlePages.map((titlePage, index) => `        <titlePage label="${titlePage.type || ''}" n="${index + 1}">
            <p>${titlePage.paragraph}</p>
        </titlePage>`
            ).join('\n') : '' }
${data.physDesc?.watermarks?.length > 0 ? data.physDesc?.watermarks.map(watermark => `         <watermark sameAs="${Array.isArray(watermark.sameAs) ? watermark.sameAs.join(' ') : watermark.sameAs}">
            <title>${watermark.type || ''}</title>
            <heraldry>${watermark.heraldry || ''}</heraldry>
            <p>${watermark.content || ''}</p>
            <locus>${watermark.position || ''}</locus>
            <annot type="creation">
                <date${watermark.creationDate?.value ? ` isodate="${watermark.creationDate.value}"` : ''}${watermark.creationDate?.startDate ? ` startdate="${watermark.creationDate.startDate}"` : ''}${
            watermark.creationDate?.endDate ? ` enddate="${watermark.creationDate.endDate}"` : ''}${
            watermark.creationDate?.notAfter ? ` notAfter="${watermark.creationDate.notAfter}"` : ''}${
            watermark.creationDate?.notBefore ? ` notBefore="${watermark.creationDate.notBefore}"` : ''}${
            watermark.creationDate?.certainty ? ` cert"${watermark.creationDate.certainty}"` : ''}>${watermark.creationDat?.dateDescription || ''}</date>
                <geogName type="place" xml:id="${watermark.creationLocation || ''}"/>
                <geogName type="paper_mill" xml:id="${watermark.paperMill || ''}"/>
                <persName role="paper_maker" xml:id="${watermark.paperMaker || ''}"/>
            </annot>
    ${watermark.dimensions?.length > 0 ? `        <dimensions>
${watermark.dimensions.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" value="${dimension.value}"/>`
            ).join('\n')}
            </dimensions>` : ''}
        </watermark>`
            ).join('\n') : '' }
    ${data.physDesc.physicalMedium ? `    <physMedium><p>${data.physDesc.physicalMedium}</p></physMedium>` : ''}
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
        ${data.physDesc.stamp ? `    <stamp>${data.physDesc.stamp}</stamp>` : ''}
    ${!isEffectivelyEmpty(data.physDesc.binding) ? `    <bindingDesc>
            <p>${data.physDesc.binding.description || ''}</p>
            <binding>
                <condition>
                    <p>${data.physDesc.binding.condition || ''}</p>
                </condition>
                <decoNote>
                    <p>${data.physDesc.binding.decoDesc || ''}</p>
                </decoNote>
    ${data.physDesc.binding.dimensions?.length > 0 ? `        <dimensions>
                    ${data.physDesc.binding.dimensions?.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit?.split('#')[1] || ''}" value="${dimension.value}"/>`
        ).join('\n')}
                </dimensions>` : ''}
            </binding>
        </bindingDesc>` : ''}
        
    ${!isEffectivelyEmpty(data.physDesc.paperDetail) ? `    <physMedium type="paper" label="${data.physDesc.paperDetail.label || ''}">
            <dimensions>
            ${data.physDesc.paperDetail.pagination ? `    <locusGrp>
                    <locus>${data.physDesc.paperDetail.pagination}</locus>
                </locusGrp>` : ''}
            ${data.physDesc.paperDetail.orientation ? `    <term>${data.physDesc.paperDetail.orientation}</term>` : ''}
            ${!isEffectivelyEmpty(data.physDesc.paperDetail.extent) ? `    <extent quantity="${data.physDesc.paperDetail.extent.value}" unit="${data.physDesc.paperDetail.extent.unit.split('#')[1]}"/>` : ''}
            ${data.physDesc.paperDetail.format.length > 0 ? `     <dimensions type="format">
${data.physDesc.paperDetail.format.map(format => `                  <${format.type || ''} unit="${format.unit?.split('#')[1] || ''}" value="${format.value}"/>`
            ).join('\n')}
                </dimensions>` : ''}
            ${data.physDesc.paperDetail.rastral.dimensions.length > 0 ? `     <dimensions type="rastral_mirror">
${data.physDesc.paperDetail.rastral.dimensions.map(dimension => `                   <${dimension.type || ''} unit="${dimension.unit?.split('#')[1] || ''}" value="${dimension.value}"/>`
            ).join('\n')}
                </dimensions>` : ''}
            </dimensions>
            <supportDesc>
            ${data.physDesc.paperDetail.quality ? `    <support type="paper_quality"><p>${data.physDesc.paperDetail.quality}</p></support>` : ''}
            ${data.physDesc.paperDetail.condition ? `    <condition><p>${data.physDesc.paperDetail.condition}</p></condition>` : ''}
            </supportDesc>
            ${!isEffectivelyEmpty(data.physDesc.paperDetail.binding) ? `<bindingDesc>
                <p>${data.physDesc.paperDetail.binding.description || ''}</p>
                <binding>
                    <condition><p>${data.physDesc.paperDetail.binding.condition || ''}</p></condition>
                    <decoNote><p>${data.physDesc.paperDetail.binding.decoDesc || ''}</p></decoNote>
                 ${data.physDesc.paperDetail.binding.dimensions?.length > 0 ? `<dimensions>
                        ${data.physDesc.paperDetail.binding.dimensions.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" value="${dimension.value}"/>`
            ).join('\n')}
                    </dimensions>` : ''}
                </binding>
            </bindingDesc>` : ''}
            ${data.physDesc?.paperDetail.watermarks?.length > 0 ? data.physDesc?.paperDetail.watermarks.map(watermark => `<watermark sameAs="${Array.isArray(watermark.sameAs) ? watermark.sameAs.join(' ') : watermark.sameAs}">
                <title>${watermark.type || ''}</title>
                <heraldry>${watermark.heraldry || ''}</heraldry>
                <p>${watermark.content || ''}</p>
                <locus>${watermark.position || ''}</locus>
                <annot type="creation">
                    <date${watermark.creationDate?.value ? ` isodate="${watermark.creationDate.value}"` : ''}${watermark.creationDate?.startDate ? ` startdate="${watermark.creationDate.startDate}"` : ''}${
            watermark.creationDate?.endDate ? ` enddate="${watermark.creationDate.endDate}"` : ''}${
            watermark.creationDate?.notAfter ? ` notAfter="${watermark.creationDate.notAfter}"` : ''}${
            watermark.creationDate?.notBefore ? ` notBefore="${watermark.creationDate.notBefore}"` : ''}${
            watermark.creationDate?.certainty ? ` cert"${watermark.creationDate.certainty}"` : ''}>${watermark.creationDate?.dateDescription || ''}</date>
                    <geogName type="place" xml:id="${watermark.creationLocation || ''}"/>
                    <geogName type="paper_mill" xml:id="${watermark.paperMill || ''}"/>
                    <persName role="paper_maker" xml:id="${watermark.paperMaker || ''}"/>
                </annot>
        ${watermark.dimensions?.length > 0 ? `        <dimensions>
    ${watermark.dimensions.map(dimension => `               <${dimension.type || ''} unit="${dimension.unit.split('#')[1]}" value="${dimension.value}"/>`
                ).join('\n')}
                </dimensions>` : ''}
            </watermark>`
            ).join('\n') : '' }
        </physMedium>` : ''}
        ${!isEffectivelyEmpty(data.physDesc.inscription) ? `<inscription>
                <p>${data.physDesc.inscription.description || ''}</p>
                <persName xml:id="${data.physDesc.inscription.agent || ''}"/>
            </inscription>` : ''}
            ${data.hands?.length > 0 ? `<handList>
${data.hands.map(hand => `           <hand type="${hand.type.split('#')[1]}" medium="${hand.medium.split('#')[1]}"><persName xml:id="${hand.agent || ''}"/>${hand.description || ''}</hand>`
            ).join('\n')}
        </handList>` : ''}
    </physDesc>` : '' ,

        // Description
        data.description?.length > 0 ? 
            data.description.map(description => 
                `    <annot type="description"><p>${description}</p></annot>`
            ).join('\n') : null,
    ];

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

    // Add relation elements inside relationList
    if (data.manifestations || data.isPartOf || data.hasPart || data.otherRelations ) {
        const manifestationElements = data.manifestations.map(manifestation => {
            return `        <relation rel="isMaterializationOf" xml:id="${manifestation}"/>`;
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
${manifestationElements || ''}
${partOfElements || ''}
${hasPartElements || ''}
${otherElements || ''}
    </relationList>`);
    }

    const validElements = elements.filter(Boolean).join('\n');

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<item xml:id="${data.subjectUri}"${link} label="${data.label || ''}">
${validElements}
</item>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

xml = formatXML(xml);

return xml;
}