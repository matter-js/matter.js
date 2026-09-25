/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PersistedFileDesignator } from "#bdx/PersistedFileDesignator.js";
import { Bytes, MemoryBlobStorageDriver } from "@matter/general";

function streamOf(text: string) {
    return new ReadableStream<Bytes>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

describe("PersistedFileDesignator", () => {
    let driver: MemoryBlobStorageDriver;

    beforeEach(() => {
        driver = new MemoryBlobStorageDriver();
        driver.initialize();
    });

    function designator() {
        return new PersistedFileDesignator("ota-1-2", driver);
    }

    it("reads back what was written", async () => {
        const file = designator();
        await file.writeFromStream(streamOf("first"));

        expect(await (await file.openBlob()).text()).equal("first");
    });

    // A designator outlives the blob it names: an OTA requestor keeps one for the life of the node
    // and downloads through it again and again, so a Blob opened for one download must not answer for
    // the next
    it("answers a second write rather than the blob it opened for the first", async () => {
        const file = designator();
        await file.writeFromStream(streamOf("first"));
        expect(await (await file.openBlob()).text()).equal("first");

        await file.writeFromStream(streamOf("second"));

        expect(await (await file.openBlob()).text()).equal("second");
    });

    it("answers a write that follows a delete", async () => {
        const file = designator();
        await file.writeFromStream(streamOf("first"));
        await file.openBlob();

        await file.delete();
        expect(await file.exists()).equal(false);

        await file.writeFromStream(streamOf("second"));
        expect(await (await file.openBlob()).text()).equal("second");
    });

    // Without the cache being cleared this resolved with the deleted content instead
    it("refuses to open a blob it deleted", async () => {
        const file = designator();
        await file.writeFromStream(streamOf("first"));
        await file.openBlob();
        await file.delete();

        await expect(file.openBlob()).rejectedWith(/must point to an existing blob/);
    });
});
