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
  { id: "cp-start", code: "START", name: "Start Line", kmMarker: 0, order: 0 },
  { id: "cp-10", code: "CP1", name: "Checkpoint 1", kmMarker: 10, order: 1 },
  { id: "cp-21", code: "CP2", name: "Checkpoint 2", kmMarker: 21, order: 2 },
  { id: "cp-30", code: "CP3", name: "Checkpoint 3", kmMarker: 30, order: 3 },
  { id: "finish", code: "FIN", name: "Finish", kmMarker: 42, order: 4 }
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

export const acceptedScanSchema = scanSubmissionSchema.extend({
  serverReceivedAt: z.string().datetime(),
  position: z.number().int().positive()
});

export const duplicateScanSchema = scanSubmissionSchema.extend({
  serverReceivedAt: z.string().datetime(),
  firstAcceptedClientScanId: z.string().min(1),
  reason: z.literal("duplicate_bib_checkpoint")
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

export const authProfileSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  role: authRoleSchema,
  crewCode: z.string().nullable(),
  displayName: z.string().nullable()
});

export const ingestScanResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("accepted"),
    officialScan: acceptedScanSchema,
    leaderboard: checkpointLeaderboardSchema,
    notification: notificationEventSchema.nullable()
  }),
  z.object({
    status: z.literal("duplicate"),
    duplicate: duplicateScanSchema,
    leaderboard: checkpointLeaderboardSchema
  })
]);

export type Checkpoint = z.infer<typeof checkpointSchema>;
export type ScanSubmission = z.infer<typeof scanSubmissionSchema>;
export type AcceptedScan = z.infer<typeof acceptedScanSchema>;
export type DuplicateScan = z.infer<typeof duplicateScanSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type CheckpointLeaderboard = z.infer<typeof checkpointLeaderboardSchema>;
export type OverallLeaderboardEntry = z.infer<typeof overallLeaderboardEntrySchema>;
export type OverallLeaderboard = z.infer<typeof overallLeaderboardSchema>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type LiveRaceSnapshot = z.infer<typeof liveRaceSnapshotSchema>;
export type AuthRole = z.infer<typeof authRoleSchema>;
export type AuthProfile = z.infer<typeof authProfileSchema>;
export type IngestScanResponse = z.infer<typeof ingestScanResponseSchema>;

export function formatCheckpointLabel(checkpoint: Pick<Checkpoint, "code" | "kmMarker">) {
  return `${checkpoint.code} - KM ${checkpoint.kmMarker}`;
}
