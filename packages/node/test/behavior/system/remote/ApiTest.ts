/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Api } from "#behavior/system/remote/api/Api.js";
import type { RemoteRequest } from "#behavior/system/remote/api/RemoteRequest.js";
import { UserLabelServer } from "#behaviors/user-label";
import { Abort } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { Status, StatusResponseError } from "@matter/types";

async function createNode() {
    return MockServerNode.createOnline({
        type: MockServerNode.RootEndpoint.with(UserLabelServer),
        userLabel: { labelList: [{ label: "room", value: "kitchen" }] },
    });
}

async function execute(node: MockServerNode, request: RemoteRequest) {
    using abort = new Abort();
    return Api.execute("test", node, request, abort.signal);
}

describe("Api", () => {
    describe("add", () => {
        it("appends the requested entry to a list attribute", async () => {
            await using node = await createNode();

            const response = await execute(node, {
                id: "1",
                method: "add",
                target: "userLabel/labelList",
                value: { label: "floor", value: "ground" },
            });

            expect(response).deep.equals({ kind: "ok", id: "1" });
            expect(node.stateOf(UserLabelServer).labelList).deep.equals([
                { label: "room", value: "kitchen" },
                { label: "floor", value: "ground" },
            ]);
        });

        it("rejects an entry that fails validation and leaves the list unchanged", async () => {
            await using node = await createNode();

            const response = await execute(node, {
                id: "1",
                method: "add",
                target: "userLabel/labelList",
                value: { label: "a label longer than sixteen characters", value: "x" },
            });

            if (response.kind !== "error") {
                expect.fail(`Expected an error response, got "${response.kind}"`);
            }
            expect(response.error.message).contains("labelList.entry.label");
            expect(node.stateOf(UserLabelServer).labelList).deep.equals([{ label: "room", value: "kitchen" }]);
        });

        it("rejects a target that is not a list", async () => {
            await using node = await createNode();

            const response = await execute(node, {
                id: "1",
                method: "add",
                target: "userLabel/labelList/0",
                value: { label: "floor", value: "ground" },
            });

            if (response.kind !== "error") {
                expect.fail(`Expected an error response, got "${response.kind}"`);
            }
            expect(StatusResponseError.of(response.error)?.code).equals(Status.InvalidAction);
            expect(node.stateOf(UserLabelServer).labelList).deep.equals([{ label: "room", value: "kitchen" }]);
        });
    });
});
