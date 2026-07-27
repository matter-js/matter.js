/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";
import { LogDestination, Logger, LogLevel } from "@matter/general";
import { MockServerNode } from "../../node/mock-server-node.js";

async function countAdvisories(maxPathsPerInvoke?: number) {
    const captured = new Array<string>();
    Logger.destinations.capture = LogDestination({
        level: LogLevel.INFO,
        write: text => captured.push(text),
    });

    try {
        const node = await MockServerNode.create(ServerNode.RootEndpoint, {
            basicInformation: maxPathsPerInvoke === undefined ? {} : { maxPathsPerInvoke },
        });
        await node.start();
        await node.close();
    } finally {
        delete Logger.destinations.capture;
    }

    return captured.filter(line => line.includes("DataModelTest feature is enabled")).length;
}

describe("GeneralDiagnosticsServer features", () => {
    it("advises disabling DataModelTest when only one path per invoke is accepted", async () => {
        expect(await countAdvisories(1)).equals(1);
    });

    it("stays silent when more than one path per invoke is accepted", async () => {
        expect(await countAdvisories()).equals(0);
        expect(await countAdvisories(3)).equals(0);
    });
});
