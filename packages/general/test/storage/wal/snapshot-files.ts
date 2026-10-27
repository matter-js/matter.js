/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Directory } from "#fs/Directory.js";
import { readGzipText } from "#storage/wal/WalFiles.js";
import { WalSnapshot } from "#storage/wal/WalSnapshot.js";

/**
 * Read a snapshot file as it is on disk, without the fallback and file changes of `WalSnapshotStore.restore()`.
 *
 * @param basename `"snapshot"` for the current snapshot, `"snapshot.prev"` for the backup
 */
export async function readSnapshot(dir: Directory, basename: "snapshot" | "snapshot.prev") {
    const gzFile = dir.file(`${basename}.json.gz`);
    const jsonFile = dir.file(`${basename}.json`);
    const gzExists = await gzFile.exists();
    const jsonExists = await jsonFile.exists();
    if (gzExists && jsonExists) {
        expect.fail(`Both formats of ${basename} exist in ${dir.path}`);
    }
    if (gzExists) {
        return WalSnapshot.parse(await readGzipText(gzFile), gzFile.path);
    }
    if (jsonExists) {
        return WalSnapshot.parse(await jsonFile.readAllText(), jsonFile.path);
    }
}
