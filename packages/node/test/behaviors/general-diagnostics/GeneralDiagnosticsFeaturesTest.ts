/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
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
    it("constructs with a feature selection of its own", async () => {
        // State getters must not name this behavior's type; a type naming unselected features is absent
        const node = await MockServerNode.create(ServerNode.RootEndpoint.with(GeneralDiagnosticsServer.with()), {
            basicInformation: { maxPathsPerInvoke: 1 },
        });
        await node.start();

        expect(node.stateOf(GeneralDiagnosticsServer.with()).totalOperationalHours).equals(0);

        await node.close();
    });

    it("rejects a node that accepts several paths per invoke without DataModelTest", async () => {
        const node = await MockServerNode.create(ServerNode.RootEndpoint.with(GeneralDiagnosticsServer.with()), {});

        let message = "no throw";
        try {
            await node.start();
        } catch (error) {
            message = (error as Error).message;
            for (let cause = error as Error; cause instanceof Error; cause = cause.cause as Error) {
                message = cause.message;
            }
        }
        await node.close();

        expect(message).match(/DataModelTest feature is mandatory with a maxPathsPerInvoke of 10/);
    });

    it("accepts a node that accepts one path per invoke without DataModelTest", async () => {
        const node = await MockServerNode.create(ServerNode.RootEndpoint.with(GeneralDiagnosticsServer.with()), {
            basicInformation: { maxPathsPerInvoke: 1 },
        });
        await node.start();
        await node.close();
    });

    it("advises disabling DataModelTest when only one path per invoke is accepted", async () => {
        expect(await countAdvisories(1)).equals(1);
    });

    it("stays silent when more than one path per invoke is accepted", async () => {
        expect(await countAdvisories()).equals(0);
        expect(await countAdvisories(3)).equals(0);
    });
});
