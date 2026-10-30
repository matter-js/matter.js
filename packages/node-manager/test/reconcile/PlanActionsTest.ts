/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DriftDisposition, planActions } from "#reconcile/planActions.js";
import { ManagedItem, itemMapKey } from "@matter/node";

function item(
    kind: string,
    key: string,
    state: ManagedItem["status"]["state"],
    mode: ManagedItem["mode"] = "converge",
): ManagedItem {
    return {
        kind,
        key,
        intent: {},
        mode,
        status: { state, updateTimestamp: 0 },
        outstanding: state === "deletePending" ? "remove" : "apply",
        generation: 1,
    };
}

const recoverableAll = () => true;
const recoverableNone = () => false;

describe("planActions", () => {
    it("maps pending → apply and deletePending → remove", () => {
        const result = planActions([item("acl", "1", "pending"), item("acl", "2", "deletePending")], {
            recoverable: recoverableAll,
        });
        expect(result.map(r => r.action)).deep.equals(["apply", "remove"]);
    });

    it("retries a recoverable failure and gives up on an unrecoverable one", () => {
        const recoverable = (i: ManagedItem) => i.key === "ok";
        const result = planActions([item("acl", "ok", "commitFailed"), item("acl", "bad", "commitFailed")], {
            recoverable,
        });
        expect(result.map(r => r.action)).deep.equals(["retry", "abandon"]);
    });

    it("skips committed items on a cheap pass", () => {
        const result = planActions(
            [item("acl", "1", "committed", "converge"), item("nodeLabel", "0", "committed", "maintain")],
            { recoverable: recoverableAll },
        );
        expect(result.map(r => r.action)).deep.equals(["skip", "skip"]);
    });

    it("re-applies committed+maintain items that drifted on a verify pass", () => {
        const drifted = item("nodeLabel", "0", "committed", "maintain");
        const stable = item("nodeLabel", "1", "committed", "maintain");
        const converged = item("acl", "1", "committed", "converge");
        const result = planActions([drifted, stable, converged], {
            verify: {
                result: { verified: new Set(), unread: new Map(), drifted: new Set([itemMapKey("nodeLabel", "0")]) },
                disposition: "reapply",
                canReapply: () => true,
            },
            recoverable: recoverableNone,
        });
        expect(result.map(r => r.action)).deep.equals(["apply", "skip", "skip"]);
    });

    it("re-applies a committed+converge item that drifted, on a reapply pass", () => {
        const drifted = item("acl", "1", "committed", "converge");
        const stable = item("acl", "2", "committed", "converge");
        const result = planActions([drifted, stable], {
            verify: {
                result: { verified: new Set(), unread: new Map(), drifted: new Set([itemMapKey("acl", "1")]) },
                disposition: "reapply",
                canReapply: () => true,
            },
            recoverable: recoverableNone,
        });
        expect(result.map(r => r.action)).deep.equals(["apply", "skip"]);
    });
});

describe("planActions drift table", () => {
    function plan(
        mode: ManagedItem["mode"],
        where: "drifted" | "verified" | "neither" | "noResult",
        disposition: DriftDisposition,
        budget: boolean,
    ) {
        const it = item("acl", "1", "committed", mode);
        const k = itemMapKey("acl", "1");
        const result = {
            verified: new Set(where === "verified" ? [k] : []),
            drifted: new Set(where === "drifted" ? [k] : []),
            unread: new Map(),
        };
        return planActions([it], {
            verify: where === "noResult" ? undefined : { result, disposition, canReapply: () => budget },
            recoverable: recoverableNone,
        })[0];
    }

    it("skips an item not in either set, or without a verify result", () => {
        expect(plan("maintain", "neither", "reapply", true).action).equals("skip");
        expect(plan("maintain", "noResult", "reapply", true).action).equals("skip");
    });

    it("skips a verified item", () => {
        expect(plan("maintain", "verified", "record", false).action).equals("skip");
    });

    it("re-applies a drifted maintain item while budget is left", () => {
        expect(plan("maintain", "drifted", "record", true)).deep.include({ action: "apply" });
    });

    it("holds a drifted maintain item once the budget is spent", () => {
        const planned = plan("maintain", "drifted", "reapply", false);
        expect(planned.action).equals("drifted");
        expect(planned.drift).equals("held");
    });

    it("re-applies a drifted converge item on a reapply pass while budget is left", () => {
        const planned = plan("converge", "drifted", "reapply", true);
        expect(planned.action).equals("apply");
        expect(planned.drift).undefined;
    });

    it("holds a drifted converge item on a reapply pass once the budget is spent", () => {
        const planned = plan("converge", "drifted", "reapply", false);
        expect(planned.action).equals("drifted");
        expect(planned.drift).equals("held");
    });

    it("records a drifted converge item on a record pass", () => {
        const planned = plan("converge", "drifted", "record", true);
        expect(planned.action).equals("drifted");
        expect(planned.drift).equals("recorded");
    });

    it("holds a drifted converge item on a record pass once the budget is spent", () => {
        const planned = plan("converge", "drifted", "record", false);
        expect(planned.action).equals("drifted");
        expect(planned.drift).equals("held");
    });
});

describe("planActions after a failure", () => {
    it("tries the operation that failed, not the other one", () => {
        // The reported state is the JFDS `CommitFailure` for both, so planning from it alone would re-apply
        // an item a caller asked to remove — putting back on the device what the run is undoing.
        const failedApply = item("k", "1", "commitFailed");
        const failedRemoval = { ...item("k", "2", "commitFailed"), outstanding: "remove" as const };

        const planned = planActions([failedApply, failedRemoval], {
            recoverable: recoverableAll,
        });
        expect(planned.map(p => p.action)).deep.equals(["retry", "remove"]);
    });

    it("gives up on either one the same way", () => {
        const failedRemoval = { ...item("k", "2", "commitFailed"), outstanding: "remove" as const };
        const planned = planActions([failedRemoval], {
            recoverable: recoverableNone,
        });
        expect(planned[0].action).equals("abandon");
    });
});
