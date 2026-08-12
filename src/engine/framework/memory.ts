import type {
  Artifact, BlackboardEntry, BlackboardRegister, ConflictRecord, PositionRevision, TaskCheckpoint,
} from '../types'

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export class StructuredBlackboard {
  private entries: BlackboardEntry[] = []
  private conflicts: ConflictRecord[] = []
  private revisions: PositionRevision[] = []
  private checkpoints: TaskCheckpoint[] = []

  writeArtifact(input: {
    artifact: Artifact
    issueId: string
    phaseId: string
    createdBy: string
    sourceRefs?: string[]
    visibility?: string[]
    register?: BlackboardRegister
  }): BlackboardEntry {
    const entry: BlackboardEntry = {
      id: id('artifact'), version: 1, created_at: new Date().toISOString(),
      created_by: input.createdBy, source_refs: input.sourceRefs ?? [],
      visibility: input.visibility ?? ['public'], status: 'valid',
      register: input.register ?? registerFor(input.artifact), issue_id: input.issueId,
      phase_id: input.phaseId, payload: input.artifact,
    }
    this.entries.push(entry)
    return entry
  }

  writeRecord(input: {
    register: BlackboardRegister
    issueId: string
    phaseId: string
    payload: unknown
    createdBy: string
    sourceRefs?: string[]
    visibility?: string[]
  }): BlackboardEntry {
    const entry: BlackboardEntry = {
      id: id(input.register), version: 1, created_at: new Date().toISOString(), created_by: input.createdBy,
      source_refs: input.sourceRefs ?? [], visibility: input.visibility ?? ['public'], status: 'valid',
      register: input.register, issue_id: input.issueId, phase_id: input.phaseId, payload: input.payload,
    }
    this.entries.push(entry)
    return entry
  }

  query(input: { registers?: BlackboardRegister[]; visibleTo?: string; issueId?: string }): BlackboardEntry[] {
    return this.entries.filter((entry) => {
      if (input.registers && !input.registers.includes(entry.register)) return false
      if (input.issueId && entry.issue_id !== input.issueId) return false
      if (input.visibleTo && !entry.visibility.includes('public') && !entry.visibility.includes(input.visibleTo)) return false
      return true
    })
  }

  registerConflict(record: Omit<ConflictRecord, keyof import('../types').VersionedRecord>): ConflictRecord {
    const value: ConflictRecord = {
      ...record, id: id('conflict'), version: 1, created_at: new Date().toISOString(),
      created_by: 'conflict_event_rule', source_refs: record.claim_refs,
      visibility: ['public'], status: 'valid',
    }
    this.conflicts.push(value)
    return value
  }

  recordRevision(record: Omit<PositionRevision, keyof import('../types').VersionedRecord>): PositionRevision {
    const value: PositionRevision = {
      ...record, id: id('revision'), version: 1, created_at: new Date().toISOString(),
      created_by: record.agent_id, source_refs: record.cited_argument_ids,
      visibility: ['audit'], status: 'valid',
    }
    this.revisions.push(value)
    return value
  }

  updateConflicts(
    predicate: (record: ConflictRecord) => boolean,
    resolutionStatus: ConflictRecord['resolution_status'],
    resolution: string,
  ): ConflictRecord[] {
    const updated: ConflictRecord[] = []
    this.conflicts = this.conflicts.map((record) => {
      if (!predicate(record)) return record
      const value = { ...record, version: record.version + 1, resolution_status: resolutionStatus, resolution }
      updated.push(value)
      return value
    })
    return updated
  }

  invalidateEntries(predicate: (entry: BlackboardEntry) => boolean): BlackboardEntry[] {
    const invalidated: BlackboardEntry[] = []
    this.entries = this.entries.map((entry) => {
      if (!predicate(entry) || entry.status !== 'valid') return entry
      const value: BlackboardEntry = { ...entry, version: entry.version + 1, status: 'superseded' }
      invalidated.push(value)
      return value
    })
    return invalidated
  }

  recordCheckpoint(record: TaskCheckpoint): TaskCheckpoint {
    this.checkpoints.push(record)
    this.writeRecord({
      register: 'checkpoints', issueId: record.issue_id, phaseId: record.phase_id,
      payload: record, createdBy: record.created_by, sourceRefs: record.source_refs,
      visibility: record.visibility,
    })
    return record
  }

  latestCheckpoint(issueId?: string): TaskCheckpoint | undefined {
    return [...this.checkpoints].reverse().find((checkpoint) => !issueId || checkpoint.issue_id === issueId)
  }

  snapshot() {
    return { entries: [...this.entries], conflicts: [...this.conflicts], revisions: [...this.revisions], checkpoints: [...this.checkpoints] }
  }
}

function registerFor(artifact: Artifact): BlackboardRegister {
  if (artifact.kind === 'ConflictMap' || artifact.kind === 'ObjectionCard') return 'objections'
  if (artifact.kind === 'FinalProposal' || artifact.kind === 'ExamResult') return 'decisions'
  return 'artifacts'
}
