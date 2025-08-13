/**
 * Generates XML string with bibliography data
 * @param {import('../types').BibliographyData} data 
 * @returns {string}
 */
export function generateBibliographyXML(data) {

    const elements = [
        // Genre entries
        data.genre ? 
            `    <genre sameas="${data.genre}">${data.genre.split('#')[1]}</genre>` : null,
        // Short title
        data.abbreviation ? 
            `    <title type="short">${data.abbreviation}</title>` : null,
        
        // External identifier (e.g. Zotero)
        data.sameAs?.length > 0 ? 
            data.sameAs.map(sameAs => 
                `    <identifier auth="${sameAs.split('/')[0]}" auth.uri="${sameAs}"/>`
            ).join('\n') : null,

        // Main title and related titles
        data.title?.length > 0 ? 
            data.title.map(title => 
                `    <title${title.titleLevel ? ` level="${title.titleLevel}"` : ''}${title.titleType ? ` type="${title.titleType}"}"` : ''}>${title.title}</title>`
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
        
        data.classification ? 
            `    <term>${data.classification}</term>` : null,
        
        // Authors
        data.authors?.length > 0 ? 
            data.authors.map(author => 
                `    <author sameas="${author}"/>`
            ).join('\n') : null,
        
        data.isPartOf ? 
            `    <title level="${data.genre === 'article' ? 'j' : 'm'}" xml:id="${data.isPartOf}"/>` : null,
        
        // Editors
        data.editors?.length > 0 ? 
            data.editors.map(editor => 
                `    <editor sameas="${editor}"/>`
            ).join('\n') : null,
        
        // Imprint information
        `    <imprint label="${data.publication?.label || ''}">
        <date${data.publication?.startDate ? ` startdate="${data.publication.startDate}"` : ''}${
            data.publication?.endDate ? ` enddate="${data.publication.endDate}"` : ''}/>
        <pubPlace${data.publication.location ? ` sameas="${data.publication.location}"`: ''}/>
        <publisher${data.publication.publisher ? ` sameas="${data.publication.publisher || ''}"`: ''}/>${
            data.publication.description ? `\n        <annot><p>${data.publication.description}</p></annot>` : ''}
    </imprint>`,
        data.description?.length > 0 ? 
            data.description.map(description => 
                `    <annot><p>${description}</p></annot>`
            ).join('\n') : null,
    ];

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
            <biblList>
                <bibl sameas="${data.subjectUri}">
                ${validElements}
                </bibl>
            </biblList>
        </work>
    </workList>
</meiHead>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

return xml;

}