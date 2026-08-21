/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { MockServerNode } from "../../node/mock-server-node.js";

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

// The GroupKeyManagement Groupcast (GCAST) feature is provisional in Matter 1.6; its implementation is present but
// guarded.  The Groupcast cluster and AccessControl Auxiliary feature are no longer guarded (they ship enabled).
describe("Matter 1.6 provisional Groupcast guards", () => {
    it("rejects the provisional GroupKeyManagement Groupcast feature", async () => {
        const error = await rejectionOf(
            MockServerNode.create(MockServerNode.RootEndpoint.with(GroupKeyManagementServer.with("Groupcast"))),
        );
        expect(messagesOf(error)).contains("Groupcast feature of GroupKeyManagement is provisional");
    });
});
