import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";

// ontologies
const classifications = {
    "https://mei-metadata.org/classification/1": "text",
    "https://mei-metadata.org/classification/2": "manuscript",
    "https://mei-metadata.org/classification/3": "autograph",
    "https://mei-metadata.org/classification/4": "sketch",
    "https://mei-metadata.org/classification/5": "fragment"
};

const repositories = {
    "https://mei-metadata.org/repository/1": "D-B",
    "https://mei-metadata.org/repository/2": "D-LEm",
    "https://mei-metadata.org/repository/3": "D-Hs",
};

const person_names = {
    "https://mei-metadata.org/persons/1": "Erdmann Neumeister",
    "https://mei-metadata.org/persons/2": "Georg Michael Telemann",
    "https://mei-metadata.org/persons/3": "Georg Philipp Telemann",
};

const roles = {
    "https://mei-metadata.org/Arranger": "arranger",
    "https://mei-metadata.org/Author": "author",
    "https://mei-metadata.org/Composer": "composer",
    "https://mei-metadata.org/Contributor": "contributor",
    "https://mei-metadata.org/Editor": "editor",
    "https://mei-metadata.org/Funder": "funder",
    "https://mei-metadata.org/Librettist": "librettist",
    "https://mei-metadata.org/Lyricist": "lyricist",
    "https://mei-metadata.org/Sponsor": "sponsor",
};

// templates
const source_template = (data) =>
    `
        <manifestation>
            <identifier label=""/>
            <titleStmt>
                <title>${data.title}</title>
                ${generate_person_records(data.persons)}
            </titleStmt>
            <classification>
                <termList>
                    <term>${data.classification}</term>
                </termList>
            </classification>
            <itemList>
                <item>
                    <physLoc>
                        <repository>
                            <identifier auth.uri="http://www.rism.info" auth="RISM">${data.repository}</identifier>
                        </repository>
                    </physLoc>
                </item>
            </itemList>
        </manifestation>
`;

const place_template = (data) =>
    `
        <geogName type="PlaceOrGeographicName" auth="liszt-portal" auth.uri="https://liszt-portal.de/places/" codedval="1008">
            <settlement type="city">${data.place_name}</settlement>
            <name type="variant">${data.alternateName}</name>
            <country xml:lang="de">${data.country}</country>
            <creation><date isodate="${data.date}">${data.date}</date></creation>
            <identifier auth="GND" auth.uri="http://d-nb.info/gnd/" codedval=""/>
            <desc xml:lang="de">${data.desc}</desc>
        </geogName>
`;

const person_template = (data) => `<${data.role}>${data.name}</${data.role}>`;

const identifier_template = (data) => `<identifier auth="${data.auth}" auth.uri="${data.uri}" codedval="${data.id}"/>`;

// util functions
const generate_person_records = (persons) => Object.values(persons).map(item => person_template(item)).join("");

const generate_identifiers = (identifiers) => Object.values(identifiers).map(item => identifier_template(item)).join("");
/*
// Initialize isomorphic-git with a file system
window.fs = new LightningFS("mermeid");
window.pfs = window.fs.promises;

window.dir = "/mermeid_sample_data";

// check if dir exists
try {
await pfs.stat(dir);
} catch (error) {
console.log("clone the repo");
await pfs.mkdir(dir);
await git.clone({
fs,
http,
dir,
corsProxy: 'https://cors.isomorphic-git.org',
url: 'https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid-sample-data.git',
ref: 'main',
singleBranch: true,
depth: 1
});
}
let files = await pfs.readdir(dir + "/data");

// display the files
const lazyItem = document.querySelector("sl-tree-item");

for (const file of files) {
const treeItem = document.createElement("sl-tree-item");
treeItem.innerText = file;
lazyItem.append(treeItem);
}*/

let form = document.getElementById("shacl-form");
let xml_output = document.getElementById("shacl-xml-output");
let rdf_output = document.getElementById("shacl-rdf-output");

/*form.addEventListener("change", (event) => {
output.classList.toggle('valid', event.detail?.valid);
output.classList.toggle('invalid', !event.detail?.valid);
output.querySelector("pre").innerText = form.serialize();

console.log(form.serialize());
});*/

document.addEventListener("click", (event) => {
    let target = event.target;

    if (target.matches("button#save")) {
        let rdf_result = form.serialize();
        let result_json = JSON.parse(form.serialize("application/ld+json"));

        let title = "";
        let classification = "";
        let repository = "";
        let persons = {};

        let place_name = "";
        let alternate_name = "";
        let description = "";
        let country = "";
        let date = "";
        let identifiers = {};
        let type = "";

        result_json.forEach((item) => {
            if (item.hasOwnProperty("https://mei-metadata.org/Title")) {
                title = item["https://mei-metadata.org/Title"]["@value"];
            }
            if (item.hasOwnProperty("https://mei-metadata.org/classification")) {
                let classification_iri = item["https://mei-metadata.org/classification"]["@id"];
                classification = classifications[classification_iri];
            }
            if (item.hasOwnProperty("https://mei-metadata.org/repository")) {
                let repository_iri = item["https://mei-metadata.org/repository"]["@id"];
                repository = repositories[repository_iri];
            }
            if (item.hasOwnProperty("http://xmlns.com/foaf/0.1/name")) {
                let person_name_iri = item["http://xmlns.com/foaf/0.1/name"]["@id"];
                let person_name = person_names[person_name_iri];
                let person_id = item["@id"];
                if (!persons.hasOwnProperty(person_id)) {
                    persons[person_id] = {};
            }
            persons[person_id].name = person_name;
            }
            if (item.hasOwnProperty("http://www.w3.org/ns/dcat#hadRole")) {
                let role_iri = item["http://www.w3.org/ns/dcat#hadRole"]["@id"];
                let role = roles[role_iri];
                let person_id = item["@id"];
                if (!persons.hasOwnProperty(person_id)) {
                    persons[person_id] = {};
                }
                persons[person_id].role = role;
            }
            if (item.hasOwnProperty("http://schema.org/name")) {
                place_name = item["http://schema.org/name"]["@value"];
            }
            if (item.hasOwnProperty("https://d-nb.info/standards/elementset/gnd#PlaceOrGeographicName")) {
                let type_iri = item["https://d-nb.info/standards/elementset/gnd#PlaceOrGeographicName"]["@value"];
                type = types[type_iri];
            }
            if (item.hasOwnProperty("http://schema.org/alternateName")) {
                alternate_name = item["http://schema.org/alternateName"]["@value"];
            }
            if (item.hasOwnProperty("http://schema.org/description")) {
                description = item["http://schema.org/description"]["@value"];
            }
            if (item.hasOwnProperty("http://www.cidoc-crm.org/cidoc-crm/P89_falls_within")) {
                country = item["http://www.cidoc-crm.org/cidoc-crm/P89_falls_within"]["@value"];
            }
            if (item.hasOwnProperty("https://d-nb.info/standards/elementset/gnd#dateOfEstablishment")) {
                date = item["https://d-nb.info/standards/elementset/gnd#dateOfEstablishment"]["@value"];
            }
        });

        let xml = source_template({ title, classification, repository, persons })
        let place_xml = place_template({ place_name, alternate_name, country, date, desc })

        //xml_output.querySelector("pre").innerText = xml;
        xml_output.querySelector("pre").innerText = place_xml;
        rdf_output.querySelector("pre").innerText = rdf_result;
    }
});

document.addEventListener("cdmd-git-client:selected-file-contents", (event) => {
    let file_contents = event.detail;

    // detect document type, in order to load the proper SHACL file
    // detect the data values subject, in order to set the corresponding attribute of the shacl-form

    document.querySelector("shacl-form#shacl-form").dataset.values = file_contents;

    document.querySelector("sl-tab-group#main").show("edit");
});