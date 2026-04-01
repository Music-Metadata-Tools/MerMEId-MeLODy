import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [
      'tests/virtual-filesystem.test.js',      
      'tests/rdf-xml-converter.unit.test.js',  
      'tests/integration-git.test.js',         
      'tests/integration-repo-data.test.js',   
    ],
    silent: true,       
    reporter: process.env.CI ? ['verbose', 'github-actions'] : 'dot',
  },
  resolve: {
    alias: {
      'https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm': 'isomorphic-git',
      'https://unpkg.com/isomorphic-git@beta/http/web/index.js': 'isomorphic-git/http/node',
    },
  },
})