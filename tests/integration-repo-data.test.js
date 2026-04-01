import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'isomorphic-git/http/node'
import fs from 'fs'
import path from 'path'
import os from 'os'
import 'dotenv/config'
import ADWLMVirtualFilesystem from '../modules/filesystem-manager/virtual-filesystem/index.js'

// ─── Helper functions ─────────────────────────────────────────────────────────

function createTempDir(label) {
  return path.join(os.tmpdir(), `mermeid-test-${label}-${Date.now()}`)
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function createVfs() {
  return new ADWLMVirtualFilesystem(fs, { httpPlugin: http, corsProxy: undefined })
}

// ─── Credentials from .env ────────────────────────────────────────────────────
const TOKEN    = process.env.GITHUB_TOKEN
const USERNAME = process.env.GITHUB_USERNAME
const REPO_URL = process.env.TEST_REPO_URL

const SKIP = !TOKEN || !USERNAME || !REPO_URL

// ─── Helper: read a file via vfs; returns '' when the file does not exist ────
async function readFile(vfs, repoDir, relativePath) {
  try {
    return await vfs.read_file(repoDir, relativePath)
  } catch {
    return ''
  }
}


// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: Full clone — verify file structure and content
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(SKIP)('Clone completeness: all repository data transferred correctly', () => {
  let repoDir
  let vfs

  beforeAll(async () => {
    repoDir = createTempDir('klon-check')
    vfs = createVfs()

    await vfs.add_repository({
      folder: repoDir,
      token: TOKEN,
      username: USERNAME,
      url: REPO_URL,
      branch: undefined,
    })
  }, 60_000)

  afterAll(() => {
    if (repoDir) removeTempDir(repoDir)
  })

  // ── Test 1: One sample file per entity-type folder ────────────────────────
  const Sample_Data = [
    'persons/2736609098.ttl',         
    'works/1031334055.ttl',            
    'expressions/2372423187.ttl',      
    'places/2884711907.ttl',           
    'venues/3689561562.ttl',           
    'items/244351973.ttl',             
    'manifestations/3043558560.ttl',   
    'institutions/484401742.ttl',      
    'instrumentations/1134679629.ttl', 
    'performanceEvents/1412123009.ttl', 
    'bibliography/382681371.ttl',      
  ]

  it('should contain one sample file from each entity-type folder', async () => {
    for (const dataPath of Sample_Data) {
      const content = await readFile(vfs, repoDir, dataPath)
      expect(content, `Missing or empty file: ${dataPath}`).not.toBe('')
    }
  })

  // ── Test 2: Person file content ───────────────────────────────────────────
  it('should contain Georg Philipp Telemann with correct content', async () => {
    const content = await vfs.read_file(repoDir, 'persons/2736609098.ttl')

    expect(content).toContain('urn:uuid:2736609098')
    expect(content).toContain('schema:familyName "Telemann"')
    expect(content).toContain('schema:givenName "Georg Philipp"')
    expect(content).toContain('melod:Person')
    expect(content).toContain('http://d-nb.info/gnd/11862119X') 
  })

  it('should contain Erdmann Neumeister with correct content', async () => {
    const content = await vfs.read_file(repoDir, 'persons/4202043203.ttl')

    expect(content).toContain('urn:uuid:4202043203')
    expect(content).toContain('schema:familyName "Neumeister"')
    expect(content).toContain('schema:givenName "Erdmann"')
    expect(content).toContain('http://d-nb.info/gnd/11893094X')
  })

  // ── Test 3: Work file with complex content ────────────────────────────────
  it('should contain "Musicalisches Lob Gottes" with complete content', async () => {
    const content = await vfs.read_file(repoDir, 'works/1031334055.ttl')

    expect(content).toContain('urn:uuid:1031334055')
    expect(content).toContain('melod:Work')
    expect(content).toContain('Musicalisches Lob Gottes')
    expect(content).toContain('MusLG')                        
    expect(content).toContain('urn:uuid:555068543')           
    expect(content).toContain('lrmoo:R3_is_realised_in')      
    expect(content).toContain('schema:creativeWorkStatus "authentic"')
  })

  // ── Test 4: Item file with provenance data ────────────────────────────────
  it('should contain the Telemann autograph (D-B) with provenance data', async () => {
    const content = await vfs.read_file(repoDir, 'items/244351973.ttl')

    expect(content).toContain('urn:uuid:244351973')
    expect(content).toContain('melod:Item')
    expect(content).toContain('Mus.ms.autogr. Telemann, G. P. 60') 
    expect(content).toContain('https://rism.online/sources/1001029770') 
    expect(content).toContain('urn:uuid:484401742')           
    expect(content).toContain('1841-01-01')                   
    expect(content).toContain('melod:hasProvenance')
  })

  // ── Test 5: Institution with abbreviation and location ────────────────────
  it('should contain the Staatsbibliothek zu Berlin with correct content', async () => {
    const content = await vfs.read_file(repoDir, 'institutions/484401742.ttl')

    expect(content).toContain('urn:uuid:484401742')
    expect(content).toContain('Staatsbibliothek zu Berlin')
    expect(content).toContain('"D-B"')                        
    expect(content).toContain('https://rism.online/institutions/30000655')
  })

  // ── Test 6: PerformanceEvent with date ───────────────────────────────────
  it('should contain the 1742 New Year performance with correct content', async () => {
    const content = await vfs.read_file(repoDir, 'performanceEvents/1412123009.ttl')

    expect(content).toContain('urn:uuid:1412123009')
    expect(content).toContain('melod:PerformanceEvent')
    expect(content).toContain('1742-01-01')
    expect(content).toContain('urn:uuid:3689561562')          
    expect(content).toContain('melod:hasEventDate')
  })

  // ── Test 7: Configuration file present ───────────────────────────────────
  it('should contain the configuration file with the required keys', async () => {
    const content = await readFile(vfs, repoDir, 'configuration/config.json')
    const config = JSON.parse(content)

    expect(config).toHaveProperty('datasetBaseUrl')
    expect(config).toHaveProperty('projectDomain')
    expect(config.projectDomain).toBe('urn:uuid:')
  })
})


// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 5: Complex parallel collaboration — push conflict and recovery
//
// Sequence:
//   beforeAll  — create corpus files (deleted during the test), both clone
//   Phase 1    — Person A creates 3 files and pushes
//   Phase 2    — Both pull; B sees A's files
//   Phase 3    — Person B creates 2 files, deletes A's file + corpus file, pushes
//   Phase 4    — Person A makes changes WITHOUT pulling → push is rejected
//   Phase 5    — canPullSafely detects no conflict; A pulls (auto-merge) + pushes
//   Phase 6    — Final state verified with a fresh clone
//
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(SKIP)('Complex parallel collaboration: push conflict and recovery', () => {
  let repoDirA, repoDirB
  let vfsA, vfsB

  // ── Corpus: created in beforeAll, deleted during the test ─────────────────
  // These files do not exist in the repo beforehand and are removed by the
  // test actions themselves — no afterAll cleanup needed for them.
  const CORPUS_DEL_BY_A = 'persons/test-corpus-del-a.ttl'
  const CORPUS_DEL_BY_B = 'persons/test-corpus-del-b.ttl'

  // ── Person A's files (Phase 1) ────────────────────────────────────────────
  const A_PERSON1 = 'persons/test-a-p1.ttl'   // survives → afterAll-Cleanup
  const A_PERSON2 = 'persons/test-a-p2.ttl'   // deleted by B in Phase 3
  const A_WORK1   = 'works/test-a-w1.ttl'     // survives → afterAll-Cleanup

  // ── Person A's later file (Phase 4, after the failed push) ───────────────
  const A_PERSON3 = 'persons/test-a-p3.ttl'   // survives → afterAll-Cleanup

  // ── Person B's files (Phase 3) ────────────────────────────────────────────
  const B_WORK1  = 'works/test-b-w1.ttl'              // survives → afterAll-Cleanup
  const B_EVENT1 = 'performanceEvents/test-b-ev1.ttl' // survives → afterAll-Cleanup

  // ── Turtle content for each test file ────────────────────────────────────
  const TTL = {
    corpusA: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      @prefix schema: <https://schema.org/>.
      <urn:uuid:test-corpus-del-a> schema:familyName "Corpus"; schema:givenName "DelA"; a melod:Person.`,

          corpusB: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      @prefix schema: <https://schema.org/>.
      <urn:uuid:test-corpus-del-b> schema:familyName "Corpus"; schema:givenName "DelB"; a melod:Person.`,

          aP1: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      @prefix schema: <https://schema.org/>.
      <urn:uuid:test-a-p1> schema:familyName "Alpha"; schema:givenName "Eins"; a melod:Person.`,

          aP2: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      @prefix schema: <https://schema.org/>.
      <urn:uuid:test-a-p2> schema:familyName "Alpha"; schema:givenName "Zwei"; a melod:Person.`,

          aW1: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      <urn:uuid:test-a-w1> a melod:Work.`,

          aP3: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      @prefix schema: <https://schema.org/>.
      <urn:uuid:test-a-p3> schema:familyName "Alpha"; schema:givenName "Drei"; a melod:Person.`,

          bW1: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      <urn:uuid:test-b-w1> a melod:Work.`,

          bEv1: `@prefix melod: <https://lod.academy/melod/vocab/ontology#>.
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
      <urn:uuid:test-b-ev1> rdfs:label "Testaufführung B"; a melod:PerformanceEvent.`,
    }

  // ── Setup: both clone, corpus files are created ───────────────────────────
  beforeAll(async () => {
    repoDirA = createTempDir('komplex-a')
    repoDirB = createTempDir('komplex-b')
    vfsA = createVfs()
    vfsB = createVfs()

    await Promise.all([
      vfsA.add_repository({ folder: repoDirA, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined }),
      vfsB.add_repository({ folder: repoDirB, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined }),
    ])

    // Create corpus files — will be deleted by A and B during the test phases
    await vfsA.save_and_stage_file(repoDirA, TTL.corpusA, CORPUS_DEL_BY_A)
    await vfsA.save_and_stage_file(repoDirA, TTL.corpusB, CORPUS_DEL_BY_B)
    const staged = await vfsA.list_staged_files(repoDirA)
    await vfsA.commit_and_push_file(repoDirA, staged.filter(Boolean), [])

    // Bring B up to the same state
    await vfsB.pull(repoDirB)
  }, 120_000)

  // ── Cleanup: only remove test files that still exist ─────────────────────
  afterAll(async () => {
    const vfsClean = createVfs()
    const repoDirClean = createTempDir('cleanup-komplex')
    try {
      await vfsClean.add_repository({ folder: repoDirClean, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined })

      // Only delete files that still exist (A_PERSON2 etc. were already deleted during the test)
      const toDelete = [A_PERSON1, A_WORK1, A_PERSON3, B_WORK1, B_EVENT1]
      let hasChanges = false
      for (const path of toDelete) {
        const content = await readFile(vfsClean, repoDirClean, path)
        if (content) {
          await vfsClean.add_file(repoDirClean, path)
          hasChanges = true
        }
      }

      if (hasChanges) {
        const staged = await vfsClean.list_staged_files(repoDirClean)
        await vfsClean.commit_and_push_file(repoDirClean, staged.filter(Boolean), [])
      }
    } catch (err) {
      console.error('Cleanup error:', err.message)
    } finally {
      removeTempDir(repoDirClean)
    }

    if (repoDirA) removeTempDir(repoDirA)
    if (repoDirB) removeTempDir(repoDirB)
  }, 60_000)

  // ── Phase 1: Person A creates files and pushes ────────────────────────────
  it('Phase 1 — Person A creates 3 files (2 persons + 1 work) and pushes', async () => {
    await vfsA.save_and_stage_file(repoDirA, TTL.aP1, A_PERSON1)
    await vfsA.save_and_stage_file(repoDirA, TTL.aP2, A_PERSON2)
    await vfsA.save_and_stage_file(repoDirA, TTL.aW1, A_WORK1)

    const staged = await vfsA.list_staged_files(repoDirA)
    const pushOk = await vfsA.commit_and_push_file(repoDirA, staged.filter(Boolean), [])
    expect(pushOk).toBe(true)
  }, 30_000)

  // ── Phase 2: Both pull ────────────────────────────────────────────────────
  it("Phase 2 — both pull; Person B sees all of Person A's files", async () => {
    await Promise.all([
      vfsA.pull(repoDirA),
      vfsB.pull(repoDirB),
    ])

    // B can read A's three files
    expect(await vfsB.read_file(repoDirB, A_PERSON1)).toContain('test-a-p1')
    expect(await vfsB.read_file(repoDirB, A_PERSON2)).toContain('test-a-p2')
    expect(await vfsB.read_file(repoDirB, A_WORK1)).toContain('test-a-w1')

    // B can also read the corpus files created in beforeAll
    expect(await vfsB.read_file(repoDirB, CORPUS_DEL_BY_A)).toContain('test-corpus-del-a')
    expect(await vfsB.read_file(repoDirB, CORPUS_DEL_BY_B)).toContain('test-corpus-del-b')
  }, 30_000)

  // ── Phase 3: Person B creates files, deletes others, and pushes ──────────
  it('Phase 3 — Person B creates 2 files, deletes A_PERSON2 + CORPUS_DEL_BY_B and pushes', async () => {
    // B creates its own files
    await vfsB.save_and_stage_file(repoDirB, TTL.bW1, B_WORK1)
    await vfsB.save_and_stage_file(repoDirB, TTL.bEv1, B_EVENT1)

    // B deletes one of A's files and one corpus file
    await vfsB.add_file(repoDirB, A_PERSON2)
    await vfsB.add_file(repoDirB, CORPUS_DEL_BY_B)

    const staged = await vfsB.list_staged_files(repoDirB)
    const pushOk = await vfsB.commit_and_push_file(repoDirB, staged.filter(Boolean), [])

    // B's state is current (pulled in Phase 2) — push must succeed
    expect(pushOk).toBe(true)
  }, 30_000)

  // ── Phase 4: Person A pushes without pulling → rejected ──────────────────
  it('Phase 4 — Person A pushes without pulling — rejected by GitHub', async () => {
    // A is unaware of B's push and has not pulled.
    await vfsA.save_and_stage_file(repoDirA, TTL.aP3, A_PERSON3)
    await vfsA.add_file(repoDirA, CORPUS_DEL_BY_A)

    const staged = await vfsA.list_staged_files(repoDirA)

    // Push must fail: A's local state is outdated (B has already pushed).
    // commit_and_push_file commits locally first — the commit exists,
    // but GitHub rejects the push because the remote history has diverged.
    await expect(
      vfsA.commit_and_push_file(repoDirA, staged.filter(Boolean), [])
    ).rejects.toThrow()
  }, 30_000)

  // ── Phase 5: Person A pulls (auto-merge) and pushes again ─────────────────
  it('Phase 5 — canPullSafely detects no conflict; A pulls, merge succeeds, push succeeds', async () => {
    // A's local changes (A_PERSON3, CORPUS_DEL_BY_A) do not overlap
    // with B's remote changes (B_WORK1, B_EVENT1, A_PERSON2, CORPUS_DEL_BY_B)
    const safe = await vfsA.canPullSafely(repoDirA, [A_PERSON3, CORPUS_DEL_BY_A])
    expect(safe).toBe(true)

    // Auto-merge: A's local commit + B's remote commit → merge commit
    await vfsA.pull(repoDirA)

    // Push the merge commit
    const pushOk = await vfsA.commit_and_push_file(repoDirA, [], [])
    expect(pushOk).toBe(true)
  }, 30_000)

  // ── Phase 6: Verify final state with a fresh clone ────────────────────────
  it('Phase 6 — a fresh clone shows the correct final state of all changes', async () => {
    const repoDirCheck = createTempDir('check-komplex')
    const vfsCheck = createVfs()

    await vfsCheck.add_repository({ folder: repoDirCheck, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined })

    // A_PERSON1 and A_WORK1: created by A, never deleted — should exist
    expect(await vfsCheck.read_file(repoDirCheck, A_PERSON1)).toContain('test-a-p1')
    expect(await vfsCheck.read_file(repoDirCheck, A_WORK1)).toContain('test-a-w1')

    // A_PERSON2: created by A, deleted by B in Phase 3 — should be absent
    expect(await readFile(vfsCheck, repoDirCheck, A_PERSON2)).toBe('')

    // A_PERSON3: created by A in Phase 4, pushed via merge commit — should exist
    expect(await vfsCheck.read_file(repoDirCheck, A_PERSON3)).toContain('test-a-p3')

    // B_WORK1 and B_EVENT1: created by B — should exist
    expect(await vfsCheck.read_file(repoDirCheck, B_WORK1)).toContain('test-b-w1')
    expect(await vfsCheck.read_file(repoDirCheck, B_EVENT1)).toContain('test-b-ev1')

    // CORPUS_DEL_BY_A: deleted by A in Phase 4, included in merge commit — should be absent
    expect(await readFile(vfsCheck, repoDirCheck, CORPUS_DEL_BY_A)).toBe('')

    // CORPUS_DEL_BY_B: deleted by B in Phase 3 — should be absent
    expect(await readFile(vfsCheck, repoDirCheck, CORPUS_DEL_BY_B)).toBe('')

    removeTempDir(repoDirCheck)
  }, 60_000)
})
