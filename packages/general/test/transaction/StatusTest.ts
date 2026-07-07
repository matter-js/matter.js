/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status } from "#transaction/Status.js";
import type { Transaction } from "#transaction/Transaction.js";
import { TransactionFlowError } from "#transaction/errors.js";

function txWith(status: Status) {
    return { status } as unknown as Transaction;
}

describe("Transaction Status", () => {
    it("formats a status in angle brackets", () => {
        expect(Status.formatStatus(Status.Exclusive)).equal("<exclusive>");
    });

    describe("assert", () => {
        it("permits an acceptable current status", () => {
            expect(() =>
                Status.assert(txWith(Status.Shared), [Status.Shared, Status.Waiting], Status.Exclusive),
            ).not.throws();
        });

        it("throws for an unacceptable current status", () => {
            expect(() => Status.assert(txWith(Status.ReadOnly), [Status.Exclusive], Status.CommittingPhaseOne)).throws(
                TransactionFlowError,
                "Cannot transition transaction from <read only> to <committing phase one>",
            );
        });
    });
});
