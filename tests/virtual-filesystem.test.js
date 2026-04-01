import { describe, it, expect, beforeEach } from 'vitest'
import git from 'isomorphic-git'
import { Volume } from 'memfs'
import ADWLMVirtualFilesystem from '../modules/filesystem-manager/virtual-filesystem/index.js'

describe('VirtualFilesystem', () => {
  let vfs

  // beforeEach = a fresh in-memory filesystem is created before EACH test
  // so tests never interfere with one another
  beforeEach(async () => {
    const vol = new Volume()
    vfs = new ADWLMVirtualFilesystem(vol)

    // Initialise a Git repository in memory
    await vfs.pfs.mkdir('/testrepo')
    await git.init({ fs: vfs.fs, dir: '/testrepo' })
  })

  // ── save_and_stage_file ──────────────────────────────────────────────────

  describe('save_and_stage_file', () => {
    it('should save a new file and return a success result', async () => {
      const content = '<rdf:RDF>...</rdf:RDF>'

      const result = await vfs.save_and_stage_file(
        '/testrepo',
        content,
        'persons/bach.ttl'
      )

      expect(result.success).toBe(true)
      expect(result.filename).toBe('bach.ttl')
      expect(result.folder).toBe('persons')
    })

    it('should actually create the file on the filesystem', async () => {
      await vfs.save_and_stage_file('/testrepo', 'inhalt', 'persons/bach.ttl')

      // Verify that the file really exists
      const datasets = await vfs.pfs.readdir('/testrepo/persons')
      expect(datasets).toContain('bach.ttl')
    })

    it('should overwrite an existing file', async () => {
      await vfs.save_and_stage_file('/testrepo', 'alter inhalt', 'persons/bach.ttl')
      await vfs.save_and_stage_file('/testrepo', 'neuer inhalt', 'persons/bach.ttl')

      const content = await vfs.read_file('/testrepo', 'persons/bach.ttl')
      expect(content).toBe('neuer inhalt')
    })

    it('should return the correct folder name', async () => {
      const ergebnis = await vfs.save_and_stage_file(
        '/testrepo',
        'inhalt',
        'works/symphony1.ttl'
      )
      expect(ergebnis.folder).toBe('works')
    })
  })

  // ── read_file ────────────────────────────────────────────────────────────

  describe('read_file', () => {
    it('should read back the saved content correctly', async () => {
      const original = '@prefix : <http://example.org/> . :Bach a :Person .'
      await vfs.save_and_stage_file('/testrepo', original, 'persons/bach.ttl')

      const read = await vfs.read_file('/testrepo', 'persons/bach.ttl')
      expect(read).toBe(original)
    })
  })

  // ── list_repository_names ────────────────────────────────────────────────

  describe('list_repository_names', () => {
    it('should show the created repository in the list', async () => {
      const names = await vfs.list_repository_names()
      expect(names).toContain('testrepo')
    })

    it('should list multiple repositories', async () => {
      await vfs.pfs.mkdir('/zweites-repo')
      const names = await vfs.list_repository_names()
      expect(names).toContain('testrepo')
      expect(names).toContain('zweites-repo')
    })
  })
})
