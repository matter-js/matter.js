/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationServer } from "#behaviors/basic-information";
import { MockSite } from "@matter/node/testing";

describe("BasicInformationServer stored nodeLabel", () => {
    const id = "labeled";

    it("starts with a stored node label over 32 bytes and stores it shortened", async () => {
        const site = new MockSite();
        await using _site = site;

        const original = await site.addNode(undefined, { id, commissioning: { enabled: false } });
        await original.close();

        const storage = site.storageFor(id);
        const key = Object.keys(storage).find(key => key.endsWith(".basicInformation"));
        expect(key).not.undefined;

        // 11 × "日" is 33 bytes in UTF-8 but only 11 UTF-16 code units
        storage[key!] = { ...storage[key!], nodeLabel: "日".repeat(11) };

        const restarted = await site.addNode(undefined, { id, commissioning: { enabled: false } });

        expect(restarted.stateOf(BasicInformationServer).nodeLabel).equals("日".repeat(10));

        await restarted.setStateOf(BasicInformationServer, { location: "DE" });
        expect(site.storageFor(id)[key!]).deep.include({ nodeLabel: "日".repeat(10) });
    });
});
