import { openDB } from "idb";
import type { ScanSubmission, WithdrawalSubmission } from "@arm/contracts";

const DB_NAME = "arm-scanner";
const STORE_NAME = "pending-scans";
const WITHDRAWAL_STORE_NAME = "pending-withdrawals";
const SEEN_STORE_NAME = "seen-scans";
const SEEN_WITHDRAWALS_STORE_NAME = "seen-withdrawals";

export type QueuedScan = ScanSubmission & {
  queuedAt: string;
};

export type QueuedWithdrawal = WithdrawalSubmission & {
  queuedAt: string;
};

const dbPromise = openDB(DB_NAME, 2, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, {
        keyPath: "clientScanId"
      });
    }

    if (!database.objectStoreNames.contains(WITHDRAWAL_STORE_NAME)) {
      database.createObjectStore(WITHDRAWAL_STORE_NAME, {
        keyPath: "clientWithdrawId"
      });
    }

    if (!database.objectStoreNames.contains(SEEN_STORE_NAME)) {
      database.createObjectStore(SEEN_STORE_NAME, {
        keyPath: "id"
      });
    }

    if (!database.objectStoreNames.contains(SEEN_WITHDRAWALS_STORE_NAME)) {
      database.createObjectStore(SEEN_WITHDRAWALS_STORE_NAME, {
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

export async function queueWithdrawal(withdrawal: WithdrawalSubmission) {
  const db = await dbPromise;
  await db.put(WITHDRAWAL_STORE_NAME, {
    ...withdrawal,
    queuedAt: new Date().toISOString()
  } satisfies QueuedWithdrawal);
}

export async function getQueuedWithdrawals(): Promise<QueuedWithdrawal[]> {
  const db = await dbPromise;
  return (await db.getAll(WITHDRAWAL_STORE_NAME)).sort((left, right) => left.reportedAt.localeCompare(right.reportedAt));
}

export async function removeQueuedScan(clientScanId: string) {
  const db = await dbPromise;
  await db.delete(STORE_NAME, clientScanId);
}

export async function removeQueuedWithdrawal(clientWithdrawId: string) {
  const db = await dbPromise;
  await db.delete(WITHDRAWAL_STORE_NAME, clientWithdrawId);
}

function createSeenId(checkpointId: string, bib: string) {
  return `${checkpointId}:${bib.trim().toUpperCase()}`;
}

export async function hasLocalDuplicate(checkpointId: string, bib: string) {
  const db = await dbPromise;
  const seenId = createSeenId(checkpointId, bib);
  return Boolean(await db.get(SEEN_STORE_NAME, seenId));
}

export async function markLocalScan(checkpointId: string, bib: string) {
  const db = await dbPromise;
  const normalizedBib = bib.trim().toUpperCase();
  await db.put(SEEN_STORE_NAME, {
    id: createSeenId(checkpointId, normalizedBib),
    checkpointId,
    bib: normalizedBib,
    createdAt: new Date().toISOString()
  });
}

function createWithdrawalSeenId(raceId: string, bib: string) {
  return `${raceId}:${bib.trim().toUpperCase()}`;
}

export async function hasLocalWithdrawalDuplicate(raceId: string, bib: string) {
  const db = await dbPromise;
  const seenId = createWithdrawalSeenId(raceId, bib);
  return Boolean(await db.get(SEEN_WITHDRAWALS_STORE_NAME, seenId));
}

export async function markLocalWithdrawal(raceId: string, bib: string) {
  const db = await dbPromise;
  const normalizedBib = bib.trim().toUpperCase();
  await db.put(SEEN_WITHDRAWALS_STORE_NAME, {
    id: createWithdrawalSeenId(raceId, normalizedBib),
    raceId,
    bib: normalizedBib,
    createdAt: new Date().toISOString()
  });
}
