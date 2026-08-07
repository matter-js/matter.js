/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Logger, StorageManager, StorageService, SupportedStorageTypes } from "@matter/general";

const logger = Logger.get("LegacyStorageMigration");

/** A pre-0.16 `credentials` entry (fabric config or CA key material); relocated verbatim, never decoded. */
type LegacyCredentialRecord = Record<string, SupportedStorageTypes>;

async function stepOneNeeded(mgr: StorageManager): Promise<boolean> {
    const credentials = mgr.createContext("credentials");
    if (!(await credentials.has("fabric"))) {
        return false;
    }
    const fabrics = await mgr.createContext("fabrics").get<LegacyCredentialRecord[]>("fabrics", []);
    return fabrics.length === 0;
}

async function stepTwoNeeded(mgr: StorageManager): Promise<boolean> {
    const nodes = mgr.createContext("nodes");
    const commissioned = await nodes.get<SupportedStorageTypes[]>("commissionedNodes", []);
    if (commissioned.length === 0) {
        return false;
    }
    // Current-format storage keys each peer under its own subcontext of "nodes".
    return (await nodes.contexts()).length === 0;
}

/**
 * True when a pre-0.16 controller storage still needs migrating to the current layout.
 * See docs/MIGRATION_CONTROLLER_018.md.
 */
export async function legacyMigrationNeeded(env: Environment, id: string): Promise<boolean> {
    const mgr = await env.get(StorageService).open(id);
    try {
        return (await stepOneNeeded(mgr)) || (await stepTwoNeeded(mgr));
    } finally {
        await closeStorage(mgr, id);
    }
}

/**
 * Step 1: relayout fabric + certificate authority data from the legacy `credentials` context into the
 * `fabrics`/`certificates` contexts the current controller reads. Must run before the controller ServerNode is
 * constructed. Idempotent.
 */
export async function migrateLegacyControllerCredentials(env: Environment, id: string): Promise<void> {
    const mgr = await env.get(StorageService).open(id);
    try {
        if (!(await stepOneNeeded(mgr))) {
            logger.debug(`No legacy controller credentials to migrate for store ${id}`);
            return;
        }

        const credentials = mgr.createContext("credentials");
        const fabricStore = mgr.createContext("fabrics");
        const certificates = mgr.createContext("certificates");

        let fabric: LegacyCredentialRecord | undefined;
        for (const key of await credentials.keys()) {
            if (key === "fabric") {
                fabric = await credentials.get<LegacyCredentialRecord>("fabric");
            } else if (!(await certificates.has(key))) {
                await certificates.set(key, await credentials.get<SupportedStorageTypes>(key));
            }
        }

        // Certificate authority keys must land in `certificates` before `fabrics.fabrics` is written: a crash
        // between the two would otherwise strand the CA under the old layout while the guard reports "migrated".
        if (fabric !== undefined) {
            await fabricStore.set("fabrics", [fabric]);
        }
        logger.info(`Migrated legacy controller credentials for store ${id}`);
    } finally {
        await closeStorage(mgr, id);
    }
}

async function closeStorage(mgr: StorageManager, id: string): Promise<void> {
    try {
        await mgr.close();
    } catch (closeError) {
        logger.warn(`Error closing storage for store ${id}:`, closeError);
    }
}
