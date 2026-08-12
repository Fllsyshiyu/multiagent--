import { z } from 'zod'
import type { FinalProposal, InitialAssessmentCard, ObjectionCard } from '../types'

const stringList = z.array(z.string())

export const initialAssessmentSchema: z.ZodType<InitialAssessmentCard> = z.object({
  kind: z.literal('InitialAssessmentCard'),
  agent_id: z.string().min(1),
  initial_stance: z.string().min(1),
  main_concerns: stringList,
  proposal_sketch: stringList,
  non_negotiables: stringList,
  possible_concessions: stringList,
  content: z.string().min(1),
})

export const objectionSchema: z.ZodType<ObjectionCard> = z.object({
  kind: z.literal('ObjectionCard'),
  round: z.number().int().positive(),
  agent_id: z.string().min(1),
  objection_type: z.string().min(1),
  objection: z.string().min(1),
  required_revision: stringList,
  support_condition: z.string().min(1),
  reply_to: z.preprocess((value) => value === null ? undefined : value, z.string().optional()),
})

export const finalProposalSchema: z.ZodType<FinalProposal> = z.object({
  kind: z.literal('FinalProposal'),
  title: z.string().min(1),
  goal: z.string().min(1),
  measures: stringList,
  responsible_parties: stringList,
  resources: z.string(),
  timeline: z.string(),
  risk_control: stringList,
  exit_mechanism: z.string(),
  review_mechanism: z.string(),
  revision_path: stringList,
})
