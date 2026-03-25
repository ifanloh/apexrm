import { openDB } from "idb";
import type { ScanSubmission } from "@arm/contracts";

const DB_NAME = "arm-scanner";
const STORE_NAME = "pending-scans";
const SEEN_STORE_NAME = "seen-scans";

export type QueuedScan = ScanSubmission & {
  queuedAt: string;
};

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, {
        keyPath: "clientScanId"
      });
    }

    if (!database.objectStoreNames.contains(SEEN_STORE_NAME)) {
      database.createObjectStore(SEEN_STORE_NAME, {
        keyPath: "id"
      });
    }
  }
});

export async function queueScan(scan: ScanSubmission) {
  const db = await dbPromise;
  await db.put(STORE_NAME, {
    ...scan,
    queuedAt: new Date().toISOString()
  } satisfies QueuedScan);
}

export async function getQueuedScans(): Promise<QueuedScan[]> {
  const db = await dbPromise;
  return (await db.getAll(STORE_NAME)).sort((left, right) => left.scannedAt.localeCompare(right.scannedAt));
}

export async function removeQueuedScan(clientScanId: string) {
  const db = await dbPromise;
  await db.delete(STORE_NAME, clientScanId);
}

function createSeenId(checkpointId: string, bib: string) {
  return `${checkpointId}:${bib}`;
}

export async function hasLocalDuplicate(checkpointId: string, bib: string) {
  const db = await dbPromise;
  const seenId = createSeenId(checkpointId, bib);
  return Boolean(await db.get(SEEN_STORE_NAME, seenId));
}

export async function markLocalScan(checkpointId: string, bib: string) {
  const db = await dbPromise;
  await db.put(SEEN_STORE_NAME, {
    id: createSeenId(checkpointId, bib),
    checkpointId,
    bib,
    createdAt: new Date().toISOString()
  });
}
