import { describe, it, expect } from 'vitest'
import { PersonConverter }      from '../modules/rdf-xml-converter/converters/person.js'
import { WorkConverter }         from '../modules/rdf-xml-converter/converters/work.js'
import { InstitutionConverter }  from '../modules/rdf-xml-converter/converters/institution.js'

// ─── Namespace prefixes ───────────────────────────────────────────────────────
const SCHEMA   = 'https://schema.org/'
const MELOD    = 'https://lod.academy/melod/vocab/ontology#'
const OWL      = 'http://www.w3.org/2002/07/owl#'
const RDFS     = 'http://www.w3.org/2000/01/rdf-schema#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const LRMOO    = 'http://iflastandards.info/ns/lrm/lrmoo/'
const SAMEAS_PERSON = 'https://www.w3.org/TR/owl-ref/sameAs'


// ════════════════════════════════════════════════════════════════════════════
// PersonConverter
// ════════════════════════════════════════════════════════════════════════════
describe('PersonConverter', () => {

  // ── Test 1: Complete person ───────────────────────────────────────────────
  it('converts a complete person with all fields correctly', () => {
    const input = [
      {
        '@id': 'urn:uuid:2736609098',
        [`${SCHEMA}familyName`]: { '@value': 'Telemann' },
        [`${SCHEMA}givenName`]:  { '@value': 'Georg Philipp' },
        [`${SCHEMA}gender`]:     { '@value': 'male' },
        [`${SCHEMA}birthDate`]:  { '@value': '1681-03-14' },
        [`${SCHEMA}birthPlace`]: { '@id': 'urn:uuid:place-magdeburg' },
        [`${SCHEMA}deathDate`]:  { '@value': '1767-06-25' },
        [`${SCHEMA}deathPlace`]: { '@id': 'urn:uuid:place-hamburg' },
      },
      {
        [SAMEAS_PERSON]: { '@id': 'http://d-nb.info/gnd/11862119X' },
      },
    ]

    const xml = PersonConverter.toXML(input)

    expect(xml).toContain('xml:id="urn:uuid:2736609098"')
    expect(xml).toContain('<surname>Telemann</surname>')
    expect(xml).toContain('<forename>Georg Philipp</forename>')
    expect(xml).toContain('value="male"')
    expect(xml).toContain('when="1681-03-14"')
    expect(xml).toContain('xml:id="urn:uuid:place-magdeburg"')
    expect(xml).toContain('when="1767-06-25"')
    expect(xml).toContain('xml:id="urn:uuid:place-hamburg"')
    expect(xml).toContain('<idno>http://d-nb.info/gnd/11862119X</idno>')
  })

  // ── Test 2: Name only — optional fields are omitted ───────────────────────
  it('omits birth/death/gender elements when those fields are absent', () => {
    const input = [
      {
        '@id': 'urn:uuid:minimal',
        [`${SCHEMA}familyName`]: { '@value': 'Bach' },
        [`${SCHEMA}givenName`]:  { '@value': 'Johann Sebastian' },
      },
    ]

    const xml = PersonConverter.toXML(input)

    expect(xml).toContain('<surname>Bach</surname>')
    expect(xml).toContain('<forename>Johann Sebastian</forename>')
    expect(xml).not.toContain('<birth')
    expect(xml).not.toContain('<death')
    expect(xml).not.toContain('<gender')
    expect(xml).not.toContain('<idno')
  })

  // ── Test 3: Birth date without birth place ────────────────────────────────
  it('creates a birth element with a date but no place when birth place is absent', () => {
    const input = [
      {
        '@id': 'urn:uuid:person-geburt',
        [`${SCHEMA}familyName`]: { '@value': 'Händel' },
        [`${SCHEMA}givenName`]:  { '@value': 'Georg Friedrich' },
        [`${SCHEMA}birthDate`]:  { '@value': '1685-02-23' },
      },
    ]

    const xml = PersonConverter.toXML(input)

    expect(xml).toContain('<birth')
    expect(xml).toContain('when="1685-02-23"')
    expect(xml).not.toContain('<place')
  })

  // ── Test 4: Multiple sameAs entries ──────────────────────────────────────
  it('generates multiple idno elements for multiple sameAs references', () => {
    const input = [
      { '@id': 'urn:uuid:person-x' },
      { [SAMEAS_PERSON]: { '@id': 'http://d-nb.info/gnd/abc' } },
      { [SAMEAS_PERSON]: { '@id': 'http://viaf.org/viaf/123' } },
    ]

    const xml = PersonConverter.toXML(input)

    expect(xml).toContain('<idno>http://d-nb.info/gnd/abc</idno>')
    expect(xml).toContain('<idno>http://viaf.org/viaf/123</idno>')
  })

  // ── Test 5: Empty array — no crash ───────────────────────────────────────
  it('does not throw on an empty array and returns valid XML', () => {
    const xml = PersonConverter.toXML([])

    expect(xml).toContain('<person')
    expect(xml).toContain('<surname>')
    expect(xml).toContain('<forename>')
  })
})


// ════════════════════════════════════════════════════════════════════════════
// WorkConverter
// ════════════════════════════════════════════════════════════════════════════
describe('WorkConverter', () => {

  // Helper: minimal Work JSON-LD node
  function makeWork(id, extra = {}) {
    return {
      '@id': id,
      [RDF_TYPE]: { '@id': `${MELOD}Work` },
      ...extra,
    }
  }

  // ── Test 1: No Work type → empty string ──────────────────────────────────
  it('returns an empty string when no melod:Work node is present', () => {
    const input = [
      { '@id': 'urn:uuid:kein-werk', [`${SCHEMA}name`]: { '@value': 'Kein Werk' } },
    ]

    expect(WorkConverter.toXML(input)).toBe('')
  })

  // ── Test 2: Minimal work — MEI skeleton ──────────────────────────────────
  it('produces a valid MEI skeleton for a minimal work', () => {
    const input = [ makeWork('urn:uuid:work-1') ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('xmlns="http://www.music-encoding.org/ns/mei"')
    expect(xml).toContain('sameas="urn:uuid:work-1"')
    expect(xml).toContain('<workList')
  })

  // ── Test 3: workStatus → annot element ───────────────────────────────────
  it('writes workStatus into an annot element of type workStatus', () => {
    const input = [
      makeWork('urn:uuid:work-2', {
        [`${SCHEMA}creativeWorkStatus`]: { '@value': 'authentic' },
      }),
    ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('type="workStatus"')
    expect(xml).toContain('authentic')
  })

  // ── Test 4: Title with language and type ──────────────────────────────────
  it('writes a title with xml:lang and type attributes', () => {
    const input = [
      makeWork('urn:uuid:work-3', {
        [`${MELOD}hasTitle`]: { '@id': '_:t1' },
      }),
      {
        '@id': '_:t1',
        [RDFS + 'label']: { '@value': 'Musicalisches Lob Gottes', '@language': 'de' },
        [`${MELOD}hasTitleType`]: { '@id': `${MELOD}MainTitle` },
      },
    ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('Musicalisches Lob Gottes')
    expect(xml).toContain('xml:lang="de"')
    expect(xml).toContain('type="MainTitle"')
  })

  // ── Test 5: Identifier ───────────────────────────────────────────────────
  it('writes an identifier with label and value', () => {
    const input = [
      makeWork('urn:uuid:work-4', {
        [`${MELOD}hasIdentifier`]: { '@id': '_:id1' },
      }),
      {
        '@id': '_:id1',
        [RDFS + 'label']:      { '@value': 'TVWV' },
        [`${OWL}hasValue`]:    { '@value': '1:713' },
      },
    ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('label="TVWV"')
    expect(xml).toContain('>1:713<')
  })

  // ── Test 6: Contribution — Person → persName ─────────────────────────────
  it('uses persName for a person contributor', () => {
    const input = [
      makeWork('urn:uuid:work-5', {
        [`${MELOD}hasContribution`]: { '@id': '_:contrib1' },
      }),
      {
        '@id': '_:contrib1',
        [`${MELOD}hasAgent`]:       { '@id': 'urn:uuid:person-telemann' },
        [`${MELOD}hasRole`]:        { '@id': 'urn:uuid:role-composer' },
        [`${MELOD}hasCertainty`]:   { '@id': 'urn:uuid:certain' },
      },
    ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('<persName')
    expect(xml).not.toContain('<corpName')
    expect(xml).toContain('sameas="urn:uuid:person-telemann"')
  })

  // ── Test 7: Contribution — Institution → corpName ────────────────────────
  it('uses corpName when the agent is an institution', () => {
    const input = [
      makeWork('urn:uuid:work-6', {
        [`${MELOD}hasContribution`]: { '@id': '_:contrib2' },
      }),
      {
        '@id': '_:contrib2',
        [`${MELOD}hasAgent`]: { '@id': 'urn:uuid:institution-staatsbibliothek' },
        [`${MELOD}hasRole`]:  { '@id': 'urn:uuid:role-owner' },
      },
    ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('<corpName')
    expect(xml).not.toContain('<persName')
  })

  // ── Test 8: Expression → relationList ────────────────────────────────────
  it('writes an isRealisedIn relation for expressions', () => {
    const input = [
      makeWork('urn:uuid:work-7', {
        [`${LRMOO}R3_is_realised_in`]: { '@id': 'urn:uuid:expression-1' },
      }),
    ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('rel="isRealisedIn"')
    expect(xml).toContain('target="urn:uuid:expression-1"')
  })

  // ── Test 9: Citation → biblList ──────────────────────────────────────────
  it('writes citations as bibl elements inside a biblList', () => {
    const input = [
      makeWork('urn:uuid:work-8', {
        [`${SCHEMA}citation`]: { '@id': 'urn:uuid:bib-1' },
      }),
    ]

    const xml = WorkConverter.toXML(input)

    expect(xml).toContain('<biblList')
    expect(xml).toContain('sameas="urn:uuid:bib-1"')
  })
})


// ════════════════════════════════════════════════════════════════════════════
// InstitutionConverter
// ════════════════════════════════════════════════════════════════════════════
describe('InstitutionConverter', () => {

  // ── Test 1: Complete institution ─────────────────────────────────────────
  it('converts a complete institution with all fields correctly', () => {
    const input = [
      {
        '@id': 'urn:uuid:484401742',
        [`${SCHEMA}name`]:                      { '@value': 'Staatsbibliothek zu Berlin' },
        [`${MELOD}hasAbbreviation`]:             { '@value': 'D-B' },
        [`${SCHEMA}location`]:                   { '@id': 'urn:uuid:place-berlin' },
        [`${SCHEMA}address`]:                    { '@value': 'Unter den Linden 8, 10117 Berlin' },
        [`${SCHEMA}description`]:               { '@value': 'Preußischer Kulturbesitz' },
        [`${OWL}sameAs`]:                        { '@id': 'https://rism.online/institutions/30000655' },
      },
    ]

    const xml = InstitutionConverter.toXML(input)

    expect(xml).toContain('sameas="urn:uuid:484401742"')
    expect(xml).toContain('<name>Staatsbibliothek zu Berlin</name>')
    expect(xml).toContain('<abbr>D-B</abbr>')
    expect(xml).toContain('sameas="urn:uuid:place-berlin"')
    expect(xml).toContain('<addrLine>Unter den Linden 8, 10117 Berlin</addrLine>')
    expect(xml).toContain('Preußischer Kulturbesitz')
    expect(xml).toContain('auth.uri="https://rism.online/institutions/30000655"')
  })

  // ── Test 2: No abbreviation → no abbr element ────────────────────────────
  it('omits the abbr element when no abbreviation is set', () => {
    const input = [
      {
        '@id': 'urn:uuid:inst-ohne-abkuerz',
        [`${SCHEMA}name`]: { '@value': 'Unbekannte Bibliothek' },
      },
    ]

    const xml = InstitutionConverter.toXML(input)

    expect(xml).toContain('<name>Unbekannte Bibliothek</name>')
    expect(xml).not.toContain('<abbr')
  })

  // ── Test 3: Date with isodate ─────────────────────────────────────────────
  it('writes the founding date as an isodate attribute', () => {
    const input = [
      {
        '@id': '_:date1',
        [RDF_TYPE]: { '@id': `${MELOD}Date` },
        [`${MELOD}isodate`]: { '@value': '1661-01-01' },
      },
      {
        '@id': 'urn:uuid:inst-datum',
        [`${SCHEMA}name`]: { '@value': 'Alte Institution' },
      },
    ]

    const xml = InstitutionConverter.toXML(input)

    expect(xml).toContain('isodate="1661-01-01"')
  })

  // ── Test 4: Date range (startDate/endDate) ────────────────────────────────
  it('writes startdate and enddate correctly as attributes', () => {
    const input = [
      {
        '@id': 'urn:uuid:inst-zeitspanne',
        [`${SCHEMA}name`]:      { '@value': 'Temporäre Institution' },
        [`${SCHEMA}startDate`]: { '@value': '1800-01-01' },
        [`${SCHEMA}endDate`]:   { '@value': '1900-12-31' },
      },
    ]

    const xml = InstitutionConverter.toXML(input)

    expect(xml).toContain('startdate="1800-01-01"')
    expect(xml).toContain('enddate="1900-12-31"')
  })

  // ── Test 5: Multiple sameAs entries ──────────────────────────────────────
  it('generates multiple identifier elements for multiple sameAs references', () => {
    const input = [
      {
        '@id': 'urn:uuid:inst-links',
        [`${SCHEMA}name`]:   { '@value': 'Verlinkte Institution' },
        [`${OWL}sameAs`]:    { '@id': 'https://rism.online/institutions/111' },
      },
      {
        [`${OWL}sameAs`]:    { '@id': 'https://viaf.org/viaf/222' },
      },
    ]

    const xml = InstitutionConverter.toXML(input)

    expect(xml).toContain('auth.uri="https://rism.online/institutions/111"')
    expect(xml).toContain('auth.uri="https://viaf.org/viaf/222"')
  })
})
