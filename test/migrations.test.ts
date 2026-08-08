import { describe, it, expect } from 'vitest'
import { pendingMigrations, MIGRATIONS, type Migration } from '../electron/main/db/migrations'

// NOTE: the SQL side of the migration runner is not unit-tested here. better-sqlite3
// is compiled against Electron's ABI (NODE_MODULE_VERSION 119) and cannot be loaded
// by the Node test runner, so opening a real database in-process is not possible.
// What is covered here is the selection/ordering rule; the actual DDL is verified by
// running the app against a real pre-versioning database.

const stub = (version: number): Migration => ({ version, name: `m${version}`, up: () => {} })

describe('pendingMigrations', () => {
  it('returns everything for a brand new database', () => {
    const list = [stub(1), stub(2), stub(3)]
    expect(pendingMigrations(0, list).map(m => m.version)).toEqual([1, 2, 3])
  })

  it('skips migrations at or below the current version', () => {
    const list = [stub(1), stub(2), stub(3)]
    expect(pendingMigrations(2, list).map(m => m.version)).toEqual([3])
  })

  it('returns nothing when already current', () => {
    const list = [stub(1), stub(2)]
    expect(pendingMigrations(2, list)).toEqual([])
  })

  it('returns nothing when the database is ahead (downgraded app)', () => {
    const list = [stub(1), stub(2)]
    expect(pendingMigrations(5, list)).toEqual([])
  })

  it('sorts out-of-order declarations ascending', () => {
    const list = [stub(3), stub(1), stub(2)]
    expect(pendingMigrations(0, list).map(m => m.version)).toEqual([1, 2, 3])
  })

  it('does not mutate the source list', () => {
    const list = [stub(3), stub(1), stub(2)]
    pendingMigrations(0, list)
    expect(list.map(m => m.version)).toEqual([3, 1, 2])
  })
})

describe('MIGRATIONS list', () => {
  it('starts at version 1', () => {
    expect(Math.min(...MIGRATIONS.map(m => m.version))).toBe(1)
  })

  it('has unique versions', () => {
    const versions = MIGRATIONS.map(m => m.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('has no gaps', () => {
    const versions = MIGRATIONS.map(m => m.version).sort((a, b) => a - b)
    expect(versions).toEqual(versions.map((_, i) => i + 1))
  })

  it('gives every migration a name', () => {
    for (const m of MIGRATIONS) expect(m.name.length).toBeGreaterThan(0)
  })
})
