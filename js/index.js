import init_oxigraph, * as oxigraph from "https://cdn.jsdelivr.net/npm/oxigraph@0.4.5/+esm";
await init_oxigraph();
import { PersonConverter } from '../modules/rdf-xml-converter/converters/person.js';
import { PlaceConverter } from '../modules/rdf-xml-converter/converters/place.js';
import { VenueConverter } from '../modules/rdf-xml-converter/converters/venue.js';
import { EventConverter } from '../modules/rdf-xml-converter/converters/event.js';
import { PerformanceEventConverter } from '../modules/rdf-xml-converter/converters/performance-event.js';
import { InstitutionConverter } from '../modules/rdf-xml-converter/converters/institution.js';
import { BibliographyConverter } from '../modules/rdf-xml-converter/converters/bibliography.js';
import { InstrumentationConverter } from '../modules/rdf-xml-converter/converters/instrumentation.js';
import { WorkConverter } from '../modules/rdf-xml-converter/converters/work.js';
import { ExpressionConverter } from '../modules/rdf-xml-converter/converters/expression.js';
import { ManifestationConverter } from '../modules/rdf-xml-converter/converters/manifestation.js';
import { ItemConverter } from '../modules/rdf-xml-converter/converters/item.js';
import { LetterConverter } from '../modules/rdf-xml-converter/converters/letter.js';



// templates
const source_template = (data) =>
    `
        <manifestation>
            <identifier label=""/>
            <titleStmt>
                <title>${data.title}</title>
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


/*
// Initialize isomorphic-git with a file system
window.fs = new LightningFS("mermeid");
window.pfs = window.fs.promises;

window.dir = "/mermeid_sample_data";

// check if dir exists
try {
await pfs.stat(dir);
} catch (error) {
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

/*form.addEventListener("change", (event) => {
output.classList.toggle('valid', event.detail?.valid);
output.classList.toggle('invalid', !event.detail?.valid);
output.querySelector("pre").innerText = form.serialize();

});*/

let filesystem_manager = document.querySelector("adwlm-filesystem-manager");
let entity_editor = document.querySelector("adwlm-entity-editor");

function convertJsonLdToXml(json_ld_contents) {
    // First find the subject entity (the one with urn:uuid)
    const subjectEntity = json_ld_contents.find(item => 
        {if (item['@id'] && item['@id'].startsWith('urn:uuid') && item['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']) {
                return item['@id'];
            }}
    );

    if (subjectEntity) {
        console.log('Subject entity found:', subjectEntity);
    }

    if (!subjectEntity) {
        console.error('No subject entity with urn:uuid found');
        return;
    }

    // Check entity type based only on the subject entity
    const isPersonEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Person';
    
    const isPlaceEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Place';

    const isVenueEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Venue';

    const isEventEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Event';

    const isPerformanceEventEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#PerformanceEvent';

    const isInstitutionEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Institution';

    const isBibliographyEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Bibliography';

    const isInstrumentationEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Instrumentation';

    const isWorkEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Work';

    const isExpressionEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Expression';

    const isManifestationEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Manifestation';

    const isItemEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Item';

    const isLetterEntity = subjectEntity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']?.['@id'] === 'https://lod.academy/melod/vocab/ontology#Letter';

    if (isPersonEntity) {
        return PersonConverter.toXML(json_ld_contents);
    } 
    
    else if (isPlaceEntity) {
        
        return PlaceConverter.toXML(json_ld_contents);
    } 

    else if (isVenueEntity) {
        
        return VenueConverter.toXML(json_ld_contents);
    }

    else if (isEventEntity) {
        
        return EventConverter.toXML(json_ld_contents);
    }

    else if (isPerformanceEventEntity) {
        
        return PerformanceEventConverter.toXML(json_ld_contents);
    }

    else if (isInstitutionEntity) {
        
        return InstitutionConverter.toXML(json_ld_contents);
    }

    else if (isBibliographyEntity) {
        
        return BibliographyConverter.toXML(json_ld_contents);
    }

    else if (isInstrumentationEntity) {
        
        return InstrumentationConverter.toXML(json_ld_contents);
    }

    else if (isWorkEntity) {
        
        return WorkConverter.toXML(json_ld_contents);
    }

    else if (isExpressionEntity) {
        
        return ExpressionConverter.toXML(json_ld_contents);
    }

    else if (isManifestationEntity) {
        
        return ManifestationConverter.toXML(json_ld_contents);
    }

    else if (isItemEntity) {
        
        return ItemConverter.toXML(json_ld_contents);
    }

    else if (isLetterEntity) {
        
        return LetterConverter.toXML(json_ld_contents);
    }

    else {
        // Manifestation or other entity types
        let title = "";
        let classification = "";
        let repository = "";
        let persons = {};

        json_ld_contents.forEach((item) => {
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
        });

        return source_template({ title, classification, repository, persons });
    }
}

document.addEventListener("adwlm-entity-editor:entity-to-save", (event) => {
    let entity_to_save = event.detail;

    // TODO: replace this with event dispatched to adwlm-entity-renderer
    let xml_renderer = document.querySelector("section#renderer sl-tab-group sl-tab-panel[name = 'xml-output'] fieldset pre");
    let rdf_renderer = document.querySelector("section#renderer sl-tab-group sl-tab-panel[name = 'rdf-output'] fieldset pre");
    let shacl_renderer = document.querySelector("section#renderer sl-tab-group sl-tab-panel[name = 'html-output'] fieldset shacl-form");
    // END TODO

    let rdf_contents = entity_to_save.rdf_contents;
    let json_ld_contents = JSON.parse(entity_to_save.json_ld_contents);
    shacl_renderer.setAttribute("data-values-subject", entity_to_save.entity_iri);
    shacl_renderer.setAttribute("data-values", entity_to_save.rdf_contents);

    shacl_renderer.setAttribute("data-shapes-url", entity_to_save.shapesUrl);

    // Debug logging
    console.log('Full JSON-LD contents:', json_ld_contents);

    let xml = convertJsonLdToXml(json_ld_contents);

    // Update displays
    xml_renderer.innerText = xml;
    rdf_renderer.innerText = rdf_contents;

    // save the file in the repository
    filesystem_manager.entity_to_save = entity_to_save;
});

// TODO: move separately
// TODO: change "urn:uuid:" to project specific variable
let ui_language = "en";
let SparqlQueries = {
    "entity_type_definitions":
        `
        prefix melod: <https://lod.academy/melod/vocab/ontology#>
        prefix melod_ui: <https://mei-metadata.org/ui/>
        prefix schema: <http://schema.org/>
        prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        select ?entity_type ?entity_name ?entity_folder_name ?shacl_file_location
        where {
            ?entity_type a melod:Entity .
            ?entity_type rdfs:label ?entity_name .
            filter (lang(?entity_name) = '${ui_language}')
            ?entity_type melod_ui:entity_folder_name ?entity_folder_name .
            ?entity_type melod_ui:shacl_file_location ?shacl_file_location .
        }
    `,
    "entity_type_detection":
        `
        prefix melod: <https://lod.academy/melod/vocab/ontology#>
        prefix schema: <http://schema.org/>
        prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

        select ?entity_iri ?entity_type
        where {
            ?entity_iri a ?entity_type .
            filter(strstarts(str(?entity_iri), "urn:uuid:"))
            filter(strstarts(str(?entity_type), "https://lod.academy/melod/vocab/ontology#"))
        }
    `,
};

// the name argument has to be an array, for localisation of the user interface
class EntityTypeDefinition {
    constructor(type, name, folder_name, shacl_file_location) {
        this.type = type;
        this.name = name;
        this.folder_name = folder_name;
        this.shacl_file_location = shacl_file_location;
    }

    toString() {
        return `type: ${this.type}, name: '${this.name}', folder_name: '${this.folder_name}', shacl_file_location: '${shacl_file_location}'`;
    }
}

class EditorConfiguration {
    constructor(entity_type_definitions) {
        this.entity_type_definitions = entity_type_definitions;
    }
}

let graph_store = new oxigraph.Store();

let configuration_file = await fetch("configuration/editor-default.ttl").then(response => response.text());

graph_store.load(configuration_file,
    {
        format: "text/turtle",
        base_iri: null,
        to_graph_name: oxigraph.Default
    }
);

//extract the entity type definitions
let entity_type_definition_bindings = graph_store.query(SparqlQueries.entity_type_definitions);
let entity_type_definitions = [];

for (const binding of entity_type_definition_bindings) {
    let entity_type = binding.get("entity_type").value;
    let entity_name = binding.get("entity_name").value;
    let entity_folder_name = binding.get("entity_folder_name").value;
    let shacl_file_location = binding.get("shacl_file_location").value;

    let entity_type_definition = new EntityTypeDefinition(entity_type, entity_name, entity_folder_name, shacl_file_location);

    entity_type_definitions.push(entity_type_definition);
}

const editor_configuration = new EditorConfiguration(entity_type_definitions);
entity_editor.entity_type_definitions = editor_configuration.entity_type_definitions;

/*
let entity_types = graph_store.match(null, oxigraph.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), oxigraph.namedNode("https://mei-metadata.org/Entity"), oxigraph.defaultGraph());
for (let entity_type of entity_types) {
    //console.log(`${entity_type.subject.value} ${entity_type.predicate.value} ${entity_type.object.value}`);
}*/

// free the store
graph_store.free();

// END TODO

document.addEventListener("adwlm-filesystem-manager:entity-to-edit", (event) => {
    let entity_to_edit = event.detail;
    let file_contents = entity_to_edit.contents;

    // Update the XML and RDF renderers
    let xml_renderer = document.querySelector("section#renderer sl-tab-group sl-tab-panel[name = 'xml-output'] fieldset pre");
    let rdf_renderer = document.querySelector("section#renderer sl-tab-group sl-tab-panel[name = 'rdf-output'] fieldset pre");
    
    if (xml_renderer) {
        xml_renderer.innerText = entity_to_edit.xml_output || '';
    }
    if (rdf_renderer) {
        rdf_renderer.innerText = entity_to_edit.rdf_output || file_contents;
    }

    let start = performance.now();

    let graph_store = new oxigraph.Store();
    graph_store.load(file_contents,
        {
            format: "text/turtle",
            base_iri: null,
            to_graph_name: oxigraph.Default
        }
    );
    let entity_type_bindings = graph_store.query(SparqlQueries.entity_type_detection);
    let entity_type_statements = [];

    for (const binding of entity_type_bindings) {
        let entity_iri = binding.get("entity_iri").value;
        let entity_type = binding.get("entity_type").value;
        let entity_type_statement = {
            iri: entity_iri,
            type: entity_type,
        };

        entity_type_statements.push(entity_type_statement);
    }

    graph_store.free();

    if (entity_type_statements.length !== 1) {
        alert("The selected document needs one statement with entity IRI and entity type!");

        return;
    }

    let end = performance.now();
    console.log("elapsed time for extracting entity type statement = " + (end - start) + "ms");

    // set the entity_iri and entity_type
    let entity_type_statement = entity_type_statements[0];
    entity_to_edit.entity_iri = entity_type_statement.iri;
    entity_to_edit.entity_type = entity_type_statement.type;

    entity_editor.entity_to_edit = entity_to_edit;


    //shacl_renderer.setAttribute("data-values-subject", _entity_to_edit.entity_iri);
    //shacl_renderer.setAttribute("data-values", _entity_to_edit.rdf_output);
    //shacl_renderer.setAttribute("data-shapes-url", _entity_to_edit.shapesUrl);
});
