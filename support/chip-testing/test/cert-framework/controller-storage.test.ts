/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    CONTROLLER_IDENTITIES,
    controllerIdentityStorage,
    resetControllerStorage,
} from "../../src/ControllerTestInstance.js";

describe("controller identity storage", () => {
    it("names a file per identity, which is where a controller's fabrics land", () => {
        expect(CONTROLLER_IDENTITIES.map(identity => controllerIdentityStorage("/tmp/kvs", identity))).deep.equal([
            "/tmp/kvs-alpha",
            "/tmp/kvs-beta",
            "/tmp/kvs-gamma",
        ]);
    });

    it("discards every identity's fabrics, not only the prefix nothing writes to", async () => {
        const dir = await mkdtemp(join(tmpdir(), "matter-controller-storage-test-"));
        const prefix = join(dir, "kvs");

        // What a run leaves behind: one file per identity, and nothing at the prefix itself.
        for (const identity of CONTROLLER_IDENTITIES) {
            await writeFile(controllerIdentityStorage(prefix, identity), "{}");
        }
        const unrelated = join(dir, "kvs-unrelated");
        await writeFile(unrelated, "{}");

        await resetControllerStorage(prefix);

        for (const identity of CONTROLLER_IDENTITIES) {
            expect(existsSync(controllerIdentityStorage(prefix, identity)), identity).equal(false);
        }

        // Only what the identities wrote: a reset by prefix glob would take this too.
        expect(existsSync(unrelated)).equal(true);
    });

    it("succeeds where a run left nothing behind", async () => {
        const dir = await mkdtemp(join(tmpdir(), "matter-controller-storage-test-"));
        await resetControllerStorage(join(dir, "kvs"));
    });
});
