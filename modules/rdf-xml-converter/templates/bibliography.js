/**
 * Generates XML string with bibliography data
 * @param {import('../types').BibliographyData} data 
 * @returns {string}
 */
export function generateBibliographyXML(data) {

    const elements = [
        // Short title
        data.abbreviation ? 
            `    <title type="short">${data.abbreviation}</title>` : null,
        
        // External identifier (e.g. Zotero)
        data.sameAs?.length > 0 ? 
            data.sameAs.map(sameAs => 
                `    <identifier auth="${sameAs.split('/')[0]}" auth.uri="${sameAs}"/>`
            ).join('\n') : null,

        // Pagination and volume
        data.pagination ? 
            `    <biblScope unit="page">${data.pagination}</biblScope>` : null,
        data.position ? 
            `    <biblScope unit="vol">${data.position}</biblScope>` : null,
        data.materialExtent ? 
            `    <extent>${data.materialExtent}</extent>` : null,
        data.language ? 
            `    <textLang xml:lang="${data.langcode}">${data.language}</textLang>` : null,
        
        // Genre entries
        data.genre ? 
            `    <genre>${data.genre}</genre>` : null,
        data.classification ? 
            `    <classification>${data.classification}</classification>` : null,
        
        // Authors
        data.authors?.length > 0 ? 
            data.authors.map(author => 
                `    <author xml:id="${author}"/>`
            ).join('\n') : null,
        
        // Main title and related titles
        data.title?.length > 0 ? 
            data.title.map(title => 
                `    <title level="${title.titleLevel || ''}" type="${title.titleType || ''}">${title.title}</title>`
            ).join('\n') : null,
        
        data.isPartOf ? 
            `    <title level="${data.genre === 'article' ? 'j' : 'm'}" xml:id="${data.isPartOf}"/>` : null,
        
        // Editors
        data.editors?.length > 0 ? 
            data.editors.map(editor => 
                `    <editor xml:id="${editor}"/>`
            ).join('\n') : null,
        
        // Imprint information
        `    <imprint label="${data.publication?.label || ''}">
        <date${data.publication?.startDate ? ` startdate="${data.publication.startDate}"` : ''}${
            data.publication?.endDate ? ` enddate="${data.publication.endDate}"` : ''}/>
        <pubPlace xml:id="${data.publication.location || ''}"/>
        <publisher xml:id="${data.publication.publisher || ''}"/>${
            data.publication.description ? `\n        <annot>${data.publication.description}</annot>` : ''}
    </imprint>`,
        data.description?.length > 0 ? 
            data.description.map(description => 
                `    <annot>${description}</annot>`
            ).join('\n') : null,
    ];

    const validElements = elements.filter(Boolean).join('\n');

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<bibl xml:id="${data.subjectUri}">
${validElements}
</bibl>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

return xml;

}