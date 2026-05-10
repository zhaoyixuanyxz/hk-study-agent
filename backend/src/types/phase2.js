/**
 * @typedef {Object} ProfileSnapshotDoc
 * @property {string} schemaVersion
 * @property {string} summary
 * @property {Record<string, string>} structuredFacts
 * @property {string[]} gaps
 * @property {string[]} insights
 * @property {{ facts: Array<{ id: string, key: string, value: string, status: 'confirmed'|'pending'|'conflict' }> }} confirmationState
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} PlanDimensionBlock
 * @property {Record<string, unknown>} value
 * @property {'confirmed'|'candidate'|'inferred'} source
 */

/**
 * @typedef {Object} PlanInputViewDoc
 * @property {string} schemaVersion
 * @property {PlanDimensionBlock} academic
 * @property {PlanDimensionBlock} goals
 * @property {PlanDimensionBlock} budget
 * @property {PlanDimensionBlock} timeline
 * @property {PlanDimensionBlock} riskPreference
 * @property {{ ready: boolean, missingRequired: string[] }} readiness
 */

export {};
