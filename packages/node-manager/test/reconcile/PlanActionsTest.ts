/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { planActions } from "#reconcile/planActions.js";
import { ManagedItem, itemMapKey } from "@matter/node";

function item(
    kind: string,
    key: string,
    state: ManagedItem["status"]["state"],
    mode: ManagedItem["mode"] = "converge",
): ManagedItem {
    return { kind, key, intent: {}, mode, status: { state, updateTimestamp: 0 } };
}

const recoverableAll = () => true;
const recoverableNone = () => false;

describe("planActions", () => {
    it("maps pending → apply and deletePending → remove", () => {
        const result = planActions([item("acl", "1", "pending"), item("acl", "2", "deletePending")], {
            verify: false,
            recoverable: recoverableAll,
        });
        expect(result.map(r => r.action)).deep.equals(["apply", "remove"]);
    });

    it("retries recoverable commitFailed and drops unrecoverable", () => {
        const recoverable = (i: ManagedItem) => i.key === "ok";
        const result = planActions([item("acl", "ok", "commitFailed"), item("acl", "bad", "commitFailed")], {
            verify: false,
            recoverable,
        });
        expect(result.map(r => r.action)).deep.equals(["retry", "drop"]);
    });

    it("skips committed items on a cheap pass", () => {
        const result = planActions(
            [item("acl", "1", "committed", "converge"), item("nodeLabel", "0", "committed", "maintain")],
            { verify: false, recoverable: recoverableAll },
        );
        expect(result.map(r => r.action)).deep.equals(["skip", "skip"]);
    });

    it("repends committed+maintain items that drifted on a verify pass", () => {
        const drifted = item("nodeLabel", "0", "committed", "maintain");
        const stable = item("nodeLabel", "1", "committed", "maintain");
        const converged = item("acl", "1", "committed", "converge");
        const result = planActions([drifted, stable, converged], {
            verify: true,
            verifyResult: { driftedKeys: new Set([itemMapKey("nodeLabel", "0")]) },
            recoverable: recoverableNone,
        });
        expect(result.map(r => r.action)).deep.equals(["repend", "skip", "skip"]);
    });

    it("repends a committed+converge item that drifted on a verify pass", () => {
        const drifted = item("acl", "1", "committed", "converge");
        const stable = item("acl", "2", "committed", "converge");
        const result = planActions([drifted, stable], {
            verify: true,
            verifyResult: { driftedKeys: new Set([itemMapKey("acl", "1")]) },
            recoverable: recoverableNone,
        });
        expect(result.map(r => r.action)).deep.equals(["repend", "skip"]);
    });
});
