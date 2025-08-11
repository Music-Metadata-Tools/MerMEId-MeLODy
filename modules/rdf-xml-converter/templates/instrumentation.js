/**
 * Generates XML string with instrumentation data
 * @param {import('../types').InstrumentationData} data
 * @returns {string}
 */
export function generateInstrumentationXML(data) {
    
    // Helper: perfRes element (recursive for alternatives)
    function perfRes(detail, isAlt = false) {
        if (!detail) return '';
        const mediumLabel = detail.medium?.split('#')[1] || '';
        const medium = detail.medium;
        const link = detail.link
            ? ` sameAs="${Array.isArray(detail.link) ? detail.link.join(' ') : detail.link}"`
            : '';
        const count = detail.quantity ? ` count="${detail.quantity}"` : '';
        const solo = typeof detail.solo === 'boolean' ? ` solo="${detail.solo}"` : '';
        const adlib = detail.adLib ? ` adlib="true"` : '';
        // Alternative instrumentation as nested perfRes
        let alt = '';
        if (detail.alternativeInstrumentation?.length) {
            alt = detail.alternativeInstrumentation.map(a => perfRes(a, true)).join('');
        }
        return `        <perfRes xml:id="${medium}"${count}${solo}${adlib}${link}>${mediumLabel}${alt}</perfRes>`;
    }

    // Helper: castItem for each detail with castingDetail
    function castItem(detail) {
        if (!detail?.castingDetail) return '';
        const medium = detail.medium;
        const mediumLabel = detail.medium?.split('#')[1] || '';
        const link = detail.link
            ? ` sameAs="${Array.isArray(detail.link) ? detail.link.join(' ') : detail.link}"`
            : '';
        const solo = typeof detail.solo === 'boolean' ? ` solo="${detail.solo}"` : '';
        const count = detail.quantity ? ` count="${detail.quantity}"` : '';
        const adlib = detail.adLib ? ` adlib="true"` : '';
        const roleName = detail.castingDetail.roleName || '';
        const roleDesc = detail.castingDetail.roleDescription || '';
        // Alternative instrumentation as nested perfRes
        let alt = '';
        if (detail.alternativeInstrumentation?.length) {
            alt = detail.alternativeInstrumentation.map(a => perfRes(a, true)).join('');
        }
        return `        <castItem>
            <perfRes xml:id="${medium}"${count}${solo}${adlib}${link}>${mediumLabel}${alt}</perfRes>
            <role>
                <name>${roleName}</name>
            </role>
            <roleDesc>${roleDesc}</roleDesc>
        </castItem>`;
    }

    // perfResList for details and groups
    function perfResList(details, groups) {
        const res = [];
        if (details?.length) {
            res.push(details.map(d => perfRes(d)).join('\n'));
        }
        if (groups?.length) {
            res.push(groups.map(g =>
                `       <perfResList label="${g.label}">
${g.details.map(d => perfRes(d)).join('\n')}
        </perfResList>`
            ).join('\n'));
        }
        return res.join('\n');
    }

    // castList for all details (and group details) with castingDetail
    function castList(details, groups) {
        const items = [];
        if (details?.length) {
            items.push(details.filter(d => d.castingDetail).map(d => castItem(d)).join('\n'));
        }
        if (groups?.length) {
            items.push(groups.map(g =>
                g.details.filter(d => d.castingDetail).map(d => castItem(d)).join('\n')
            ).join('\n'));
        }
        return items.join('\n');
    }

    const elements = [
    data.label ? `  <head>${data.label}</head>` : null,
        `   <castList>
${castList(data.details, data.groups)}
    </castList>`,
        `   <perfResList>
${perfResList(data.details, data.groups)}
    </perfResList>`
    ];

    const validElements = elements.filter(Boolean).join('\n');

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<perfMedium xml:id="${data.subjectUri}">
${validElements}
</perfMedium>`;

// Remove empty lines (lines with only whitespace)
xml = xml.replace(/^\s*[\r\n]/gm, '');

return xml;
}