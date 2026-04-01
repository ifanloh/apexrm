import { z } from "zod";

export const authRoleSchema = z.enum(["admin", "panitia", "crew", "observer"]);

export const checkpointSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kmMarker: z.number().nonnegative(),
  order: z.number().int().nonnegative()
});

export const defaultCheckpoints = [
  { id: "cp-start", code: "START", name: "Millau", kmMarker: 0, order: 0 },
  { id: "cp-10", code: "CP1", name: "Peyreleau", kmMarker: 23.3, order: 1 },
  { id: "cp-21", code: "CP2", name: "Roquesaltes", kmMarker: 44.4, order: 2 },
  { id: "cp-30", code: "CP3", name: "La Salvage", kmMarker: 55.9, order: 3 },
  { id: "finish", code: "FIN", name: "Arrivee Millau", kmMarker: 80.6, order: 4 }
] as const satisfies ReadonlyArray<z.infer<typeof checkpointSchema>>;

export const scanSubmissionSchema = z.object({
  clientScanId: z.string().min(1),
  raceId: z.string().min(1),
  checkpointId: z.string().min(1),
  bib: z.string().min(1),
  crewId: z.string().min(1),
  deviceId: z.string().min(1),
  scannedAt: z.string().datetime(),
  capturedOffline: z.boolean().default(false)
});

export const withdrawalSubmissionSchema = z.object({
  clientWithdrawId: z.string().min(1),
  raceId: z.string().min(1),
  checkpointId: z.string().min(1),
  bib: z.string().min(1),
  crewId: z.string().min(1),
  deviceId: z.string().min(1),
  reportedAt: z.string().datetime(),
  capturedOffline: z.boolean().default(false),
  note: z.string().trim().max(280).optional().nullable()
});

export const acceptedScanSchema = scanSubmissionSchema.extend({
  serverReceivedAt: z.string().datetime(),
  position: z.number().int().positive()
});

export const duplicateScanSchema = scanSubmissionSchema.extend({
  serverReceivedAt: z.string().datetime(),
  firstAcceptedClientScanId: z.string().min(1),
  reason: z.literal("duplicate_bib_checkpoint")
});

export const recordedWithdrawalSchema = withdrawalSubmissionSchema.extend({
  serverReceivedAt: z.string().datetime(),
  reason: z.literal("runner_withdrawn")
});

export const duplicateWithdrawalSchema = withdrawalSubmissionSchema.extend({
  serverReceivedAt: z.string().datetime(),
  firstRecordedClientWithdrawId: z.string().min(1),
  reason: z.literal("already_withdrawn")
});

export const leaderboardEntrySchema = z.object({
  bib: z.string(),
  checkpointId: z.string(),
  position: z.number().int().positive(),
  scannedAt: z.string().datetime(),
  crewId: z.string(),
  deviceId: z.string()
});

export const checkpointLeaderboardSchema = z.object({
  checkpointId: z.string(),
  totalOfficialScans: z.number().int().nonnegative(),
  topEntries: z.array(leaderboardEntrySchema)
});

export const overallLeaderboardEntrySchema = z.object({
  bib: z.string(),
  name: z.string(),
  category: z.string(),
  rank: z.number().int().positive(),
  checkpointId: z.string(),
  checkpointCode: z.string(),
  checkpointName: z.string(),
  checkpointKmMarker: z.number().nonnegative(),
  checkpointOrder: z.number().int().nonnegative(),
  scannedAt: z.string().datetime(),
  crewId: z.string(),
  deviceId: z.string()
});

export const overallLeaderboardSchema = z.object({
  totalRankedRunners: z.number().int().nonnegative(),
  topEntries: z.array(overallLeaderboardEntrySchema)
});

export const runnerSearchEntrySchema = z.object({
  bib: z.string(),
  name: z.string(),
  rank: z.number().int().positive(),
  checkpointId: z.string(),
  checkpointCode: z.string(),
  checkpointName: z.string(),
  checkpointKmMarker: z.number().nonnegative(),
  checkpointOrder: z.number().int().nonnegative(),
  scannedAt: z.string().datetime(),
  crewId: z.string(),
  deviceId: z.string()
});

export const runnerSearchResponseSchema = z.object({
  items: z.array(runnerSearchEntrySchema)
});

export const runnerPassingSchema = z.object({
  checkpointId: z.string(),
  checkpointCode: z.string(),
  checkpointName: z.string(),
  checkpointKmMarker: z.number().nonnegative(),
  checkpointOrder: z.number().int().nonnegative(),
  scannedAt: z.string().datetime(),
  position: z.number().int().positive(),
  crewId: z.string(),
  deviceId: z.string()
});

export const runnerDetailSchema = z.object({
  bib: z.string(),
  name: z.string(),
  rank: z.number().int().positive(),
  currentCheckpointId: z.string(),
  currentCheckpointCode: z.string(),
  currentCheckpointName: z.string(),
  currentCheckpointKmMarker: z.number().nonnegative(),
  currentCheckpointOrder: z.number().int().nonnegative(),
  lastScannedAt: z.string().datetime(),
  totalPassings: z.number().int().nonnegative(),
  passings: z.array(runnerPassingSchema)
});

export const recentPassingSchema = z.object({
  bib: z.string(),
  name: z.string(),
  checkpointId: z.string(),
  checkpointCode: z.string(),
  checkpointName: z.string(),
  checkpointKmMarker: z.number().nonnegative(),
  scannedAt: z.string().datetime(),
  crewId: z.string(),
  deviceId: z.string(),
  position: z.number().int().positive()
});

export const recentPassingsResponseSchema = z.object({
  items: z.array(recentPassingSchema)
});

export const notificationEventSchema = z.object({
  id: z.string(),
  channel: z.literal("telegram"),
  checkpointId: z.string(),
  bib: z.string(),
  position: z.number().int().positive(),
  createdAt: z.string().datetime(),
  delivered: z.boolean()
});

export const liveRaceSnapshotSchema = z.object({
  updatedAt: z.string().datetime(),
  overallLeaderboard: overallLeaderboardSchema,
  checkpointLeaderboards: z.array(checkpointLeaderboardSchema),
  leaderboards: z.array(checkpointLeaderboardSchema),
  duplicates: z.array(duplicateScanSchema),
  notifications: z.array(notificationEventSchema)
});

export const ingestWithdrawalResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("recorded"),
    withdrawal: recordedWithdrawalSchema
  }),
  z.object({
    status: z.literal("already_withdrawn"),
    withdrawal: duplicateWithdrawalSchema
  })
]);

export type AuthRole = z.infer<typeof authRoleSchema>;
export type ScanSubmission = z.infer<typeof scanSubmissionSchema>;
export type WithdrawalSubmission = z.infer<typeof withdrawalSubmissionSchema>;
export type AcceptedScan = z.infer<typeof acceptedScanSchema>;
export type DuplicateScan = z.infer<typeof duplicateScanSchema>;
export type RecordedWithdrawal = z.infer<typeof recordedWithdrawalSchema>;
export type DuplicateWithdrawal = z.infer<typeof duplicateWithdrawalSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type CheckpointLeaderboard = z.infer<typeof checkpointLeaderboardSchema>;
export type OverallLeaderboardEntry = z.infer<typeof overallLeaderboardEntrySchema>;
export type OverallLeaderboard = z.infer<typeof overallLeaderboardSchema>;
export type RunnerSearchEntry = z.infer<typeof runnerSearchEntrySchema>;
export type RunnerPassing = z.infer<typeof runnerPassingSchema>;
export type RunnerDetail = z.infer<typeof runnerDetailSchema>;
export type RecentPassing = z.infer<typeof recentPassingSchema>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type IngestWithdrawalResponse = z.infer<typeof ingestWithdrawalResponseSchema>;
