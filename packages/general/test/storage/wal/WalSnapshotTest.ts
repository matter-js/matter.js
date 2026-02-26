/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { WalSnapshot } from "#storage/wal/WalSnapshot.js";

describe("WalSnapshot", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    it("returns undefined when no snapshot exists", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir);
        const result = await snapshot.load();
        expect(result).equal(undefined);
    });

    it("writes and loads a snapshot", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir);

        const commitId = { segment: 1, offset: 5 };
        const data = {
            "ctx.sub": { key1: "value1", key2: 42 },
            other: { flag: true },
        };

        await snapshot.run(commitId, data);

        const loaded = await snapshot.load();
        expect(loaded).not.equal(undefined);
        expect(loaded!.commitId).deep.equal(commitId);
        expect(loaded!.data["ctx.sub"].key1).equal("value1");
        expect(loaded!.data["ctx.sub"].key2).equal(42);
        expect(loaded!.data["other"].flag).equal(true);
    });

    it("roundtrips special storage types through snapshot", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir);

        const commitId = { segment: 3, offset: 7 };
        const data = {
            "ctx.special": {
                bigint: BigInt("123456789012345678"),
                buffer: new Uint8Array([1, 2, 3]).buffer,
                nested: { a: [1, "two", true] },
            },
        };

        await snapshot.run(commitId, data as any);

        const loaded = await snapshot.load();
        expect(loaded).not.equal(undefined);
        expect(loaded!.commitId).deep.equal(commitId);
        expect(loaded!.data["ctx.special"].bigint).equal(BigInt("123456789012345678"));
        expect(loaded!.data["ctx.special"].nested).deep.equal({ a: [1, "two", true] });
    });

    it("overwrites previous snapshot atomically", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir);

        await snapshot.run({ segment: 1, offset: 0 }, { a: { x: 1 } });
        await snapshot.run({ segment: 2, offset: 3 }, { b: { y: 2 } });

        const loaded = await snapshot.load();
        expect(loaded!.commitId).deep.equal({ segment: 2, offset: 3 });
        expect(loaded!.data["b"].y).equal(2);
        // Old data should be gone
        expect(loaded!.data["a"]).equal(undefined);
    });
});
