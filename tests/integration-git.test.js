import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'isomorphic-git/http/node'
import fs from 'fs'
import path from 'path'
import os from 'os'
import 'dotenv/config'
import ADWLMVirtualFilesystem from '../modules/filesystem-manager/virtual-filesystem/index.js'

// ─── Helper: create a temporary directory ────────────────────────────────────
function createTempDir(label) {
  return path.join(os.tmpdir(), `mermeid-test-${label}-${Date.now()}`)
}

// ─── Helper: remove a temporary directory ────────────────────────────────────
function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

// ─── Helper: create a VirtualFilesystem instance for tests ───────────────────
// Injects Node.js fs instead of LightningFS and node-http instead of browser-http.
// corsProxy is undefined — Node.js can reach GitHub directly, no proxy needed.
function createVfs() {
  return new ADWLMVirtualFilesystem(fs, { httpPlugin: http, corsProxy: undefined })
}

// ─── Helper: remove test files left over from previous test runs ─────────────
// Deletes all files that may have been left behind so the test repo stays clean.
async function cleanupTestFiles(vfs, repoDir, filePaths) {
  let hasChanges = false

  for (const filePath of filePaths) {
    if (fs.existsSync(path.join(repoDir, filePath))) {
      await vfs.add_file(repoDir, filePath)
      hasChanges = true
    }
  }

  if (hasChanges) {
    // staged_file_paths=[] and selected_staged_file_paths=[] → commits everything that is staged
    await vfs.commit_and_push_file(repoDir, [], [])
    console.log(`Aufgeräumt: ${filePaths.join(', ')}`)
  }
}

// ─── Credentials from .env ────────────────────────────────────────────────────
const TOKEN    = process.env.GIT_TOKEN
const USERNAME = process.env.GIT_USERNAME
const REPO_URL = process.env.TEST_REPO_URL

// Skip all tests when .env is not configured
const SKIP = !TOKEN || !USERNAME || !REPO_URL


// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: One person works with the repo
// ════════════════════════════════════════════════════════════════════════════
describe('Git Integration: clone, save, push', () => {

  it.skipIf(SKIP)('preconditions: token and repo URL are set', () => {
    expect(TOKEN).toBeTruthy()
    expect(USERNAME).toBeTruthy()
    expect(REPO_URL).toBeTruthy()
  })

  describe.skipIf(SKIP)('one person works with the repo', () => {
    let repoDir
    let vfs

    beforeAll(async () => {
      repoDir = createTempDir('person-a')
      vfs = createVfs()
      console.log(`Clone repo to: ${repoDir}`)

      // add_repository clones the repo and stores token + username in the git config
      await vfs.add_repository({
        folder: repoDir,
        token: TOKEN,
        username: USERNAME,
        url: REPO_URL,
        branch: undefined,
      })

      // Remove leftover test files from previous runs
      await cleanupTestFiles(vfs, repoDir, ['persons/test-person.ttl'])
    }, 60_000)

    afterAll(() => {
      if (repoDir) removeTempDir(repoDir)
    })

    // ── Test 1 ────────────────────────────────────────────────────────────────
    it('should have cloned the repo successfully', () => {
      expect(fs.existsSync(path.join(repoDir, '.git'))).toBe(true)
    })

    // ── Test 2 ────────────────────────────────────────────────────────────────
    it('should be able to save and stage a new Turtle file', async () => {
      const dataPath   = 'persons/test-person.ttl'
      const dataContent = `@prefix : <http://example.org/> .
        :TestPerson a :Person ;
        :name "Test Person" .`

      const result = await vfs.save_and_stage_file(repoDir, dataContent, dataPath)

      expect(result.success).toBe(true)
      expect(result.filename).toBe('test-person.ttl')
      expect(result.folder).toBe('persons')
    })

    // ── Test 3 ────────────────────────────────────────────────────────────────
    it('should be able to commit and push the staged file', async () => {
      const staged = await vfs.list_staged_files(repoDir)
      const pushOk = await vfs.commit_and_push_file(repoDir, staged.filter(Boolean), [])

      expect(pushOk).toBe(true)
    }, 30_000)

    // ── Test 4 ────────────────────────────────────────────────────────────────
    it('should be able to read the pushed file back after a pull', async () => {
      await vfs.pull(repoDir)

      const inhalt = await vfs.read_file(repoDir, 'persons/test-person.ttl')
      expect(inhalt).toContain(':TestPerson a :Person')
    }, 30_000)

  })
})


// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Two persons edit the same file → conflict
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(SKIP)('two persons work simultaneously', () => {
  let repoDirA, repoDirB
  let vfsA, vfsB

  beforeAll(async () => {
    repoDirA = createTempDir('person-a')
    repoDirB = createTempDir('person-b')
    vfsA = createVfs()
    vfsB = createVfs()

    console.log(`Person A: ${repoDirA}`)
    console.log(`Person B: ${repoDirB}`)

    await Promise.all([
      vfsA.add_repository({ folder: repoDirA, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined }),
      vfsB.add_repository({ folder: repoDirB, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined }),
    ])

    // Remove the conflict test file from previous runs (only via Person A)
    await cleanupTestFiles(vfsA, repoDirA, ['persons/konflikt-person.ttl'])

    // Synchronise Person B so both start from the same state
    await vfsB.pull(repoDirB)

  }, 120_000)

  afterAll(() => {
    if (repoDirA) removeTempDir(repoDirA)
    if (repoDirB) removeTempDir(repoDirB)
  })

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it('both should have cloned the repo successfully', () => {
    expect(fs.existsSync(path.join(repoDirA, '.git'))).toBe(true)
    expect(fs.existsSync(path.join(repoDirB, '.git'))).toBe(true)
  })

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it('Person A pushes first — should succeed', async () => {
    const content = `@prefix : <http://example.org/> .
:PersonA a :Person ; :name "Person A war zuerst hier" .`

    await vfsA.save_and_stage_file(repoDirA, content, 'persons/konflikt-person.ttl')
    const staged = await vfsA.list_staged_files(repoDirA)
    const pushOk = await vfsA.commit_and_push_file(repoDirA, staged.filter(Boolean), [])

    expect(pushOk).toBe(true)
  }, 30_000)

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it('Person B pushes the same file afterwards — should be rejected', async () => {
    const content = `@prefix : <http://example.org/> .
:PersonB a :Person ; :name "Person B kam zu spät" .`

    await vfsB.save_and_stage_file(repoDirB, content, 'persons/konflikt-person.ttl')
    const staged = await vfsB.list_staged_files(repoDirB)

    // Commit + push without pull → rejected by Git because the local state is outdated
    await expect(
      vfsB.commit_and_push_file(repoDirB, staged.filter(Boolean), [])
    ).rejects.toThrow()
  }, 30_000)

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  it('Person B pulls — gets a merge conflict because both edited the same file', async () => {
    // Git cannot auto-merge the two versions because both changed the same line
    // — this is the expected error.
    // canPullSafely() in the editor detects this beforehand and shows the warning
    // "Synchronizing is not possible" — the pull is never even attempted.
    await expect(vfsB.pull(repoDirB)).rejects.toThrow('Automatic merge failed')
  }, 30_000)

})


// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Two persons edit different files → no conflict
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(SKIP)('two persons edit different files', () => {
  let repoDirA, repoDirB
  let vfsA, vfsB

  beforeAll(async () => {
    repoDirA = createTempDir('person-a-verschiedene')
    repoDirB = createTempDir('person-b-verschiedene')
    vfsA = createVfs()
    vfsB = createVfs()

    await Promise.all([
      vfsA.add_repository({ folder: repoDirA, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined }),
      vfsB.add_repository({ folder: repoDirB, token: TOKEN, username: USERNAME, url: REPO_URL, branch: undefined }),
    ])

    // Remove leftover test files from previous runs
    await cleanupTestFiles(vfsA, repoDirA, [
      'persons/person-a-exklusiv.ttl',
      'persons/person-b-exklusiv.ttl',
    ])

    // Synchronise Person B so both start from the same state
    await vfsB.pull(repoDirB)

  }, 120_000)

  afterAll(() => {
    if (repoDirA) removeTempDir(repoDirA)
    if (repoDirB) removeTempDir(repoDirB)
  })

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it('Person A pushes her file — should succeed', async () => {
    const inhalt = `@prefix : <http://example.org/> .
:PersonA a :Person ; :name "Nur Person A bearbeitet diese Datei" .`

    await vfsA.save_and_stage_file(repoDirA, inhalt, 'persons/person-a-exklusiv.ttl')
    const staged = await vfsA.list_staged_files(repoDirA)
    const pushOk = await vfsA.commit_and_push_file(repoDirA, staged.filter(Boolean), [])

    expect(pushOk).toBe(true)
  }, 30_000)

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it('Person B commits her file — editor pulls automatically in the background and then pushes', async () => {
    const content = `@prefix : <http://example.org/> .
:PersonB a :Person ; :name "Nur Person B bearbeitet diese Datei" .`

    // ── From here: exactly what the editor does in the background ────────────
    // Person B clicks "Share files" — the editor runs canPullSafely() + pull + push

    // Step 1: check whether a pull is safe (no conflicts with Person A's changes)
    // canPullSafely receives the planned file — it does not need to be saved yet
    const canPullSafely = await vfsB.canPullSafely(repoDirB, ['persons/person-b-exklusiv.ttl'])
    expect(canPullSafely).toBe(true)

    // Step 2: automatic pull in the background — BEFORE the file is saved
    // so the index is not reset by the pull
    await vfsB.pull(repoDirB)

    // Step 3: save and stage the file (after the pull)
    await vfsB.save_and_stage_file(repoDirB, content, 'persons/person-b-exklusiv.ttl')

    // Step 4: commit and push — works because the pull has already been integrated
    const staged = await vfsB.list_staged_files(repoDirB)
    const pushOk = await vfsB.commit_and_push_file(repoDirB, staged.filter(Boolean), [])
    expect(pushOk).toBe(true)

    const contentRead = await vfsB.read_file(repoDirB, 'persons/person-b-exklusiv.ttl')
    expect(contentRead).toContain('Nur Person B bearbeitet diese Datei')

  }, 30_000)

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it('both files should be present in the repo', async () => {
    const repoDirCheck = createTempDir('check')
    const vfsCheck = createVfs()

    await vfsCheck.add_repository({
      folder: repoDirCheck,
      token: TOKEN,
      username: USERNAME,
      url: REPO_URL,
      branch: undefined,
    })

    // Both files must exist — neither has overwritten the other
    const dateiA = await vfsCheck.read_file(repoDirCheck, 'persons/person-a-exklusiv.ttl')
    const dateiB = await vfsCheck.read_file(repoDirCheck, 'persons/person-b-exklusiv.ttl')

    expect(dateiA).toContain('Nur Person A bearbeitet diese Datei')
    expect(dateiB).toContain('Nur Person B bearbeitet diese Datei')

    removeTempDir(repoDirCheck)
  }, 60_000)

})
