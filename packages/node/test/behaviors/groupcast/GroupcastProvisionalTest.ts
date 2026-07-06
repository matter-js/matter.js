/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControlServer } from "#behaviors/access-control";
import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { GroupcastServer } from "#behaviors/groupcast";
import { MockServerNode } from "@matter/node/testing";

/** Collects the messages of an error and all of its (possibly aggregated) causes. */
function messagesOf(error: unknown): string {
    const parts = new Array<string>();
    const walk = (e: unknown) => {
        if (!e || typeof e !== "object") {
            return;
        }
        if ("message" in e) {
            parts.push(String(e.message));
        }
        if ("errors" in e && Array.isArray(e.errors)) {
            e.errors.forEach(walk);
        }
        if ("cause" in e) {
            walk(e.cause);
        }
    };
    walk(error);
    return parts.join(" | ");
}

async function rejectionOf(promise: Promise<unknown>) {
    return promise.then(
        () => undefined,
        error => error,
    );
}

// Matter 1.6 ships Groupcast and its AccessControl/GroupKeyManagement extensions as provisional.  The implementations
// are present but guarded; these tests pin the guards until the features leave provisional state.
describe("Matter 1.6 provisional Groupcast guards", () => {
    it("rejects the Groupcast cluster", async () => {
        const error = await rejectionOf(MockServerNode.create(MockServerNode.RootEndpoint.with(GroupcastServer)));
        expect(messagesOf(error)).contains("Groupcast cluster is provisional");
    });

    it("rejects the AccessControl Auxiliary feature", async () => {
        const error = await rejectionOf(
            MockServerNode.create(MockServerNode.RootEndpoint.with(AccessControlServer.with("Extension", "Auxiliary"))),
        );
        expect(messagesOf(error)).contains("Auxiliary feature of AccessControl is provisional");
    });

    it("rejects a defined GroupKeyManagement GroupcastAdoption attribute", async () => {
        const error = await rejectionOf(
            MockServerNode.create(MockServerNode.RootEndpoint.with(GroupKeyManagementServer.with("Groupcast")), {
                groupKeyManagement: { groupcastAdoption: [] },
            }),
        );
        expect(messagesOf(error)).contains("Groupcast feature of GroupKeyManagement is provisional");
    });
});
