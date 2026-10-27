/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResultStatus } from "#action/response/ResultStatus.js";
import { ReceivedStatusResponse, ReceivedStatusResponseError, Status, StatusResponse } from "@matter/types";

describe("ResultStatus", () => {
    describe("errorOf", () => {
        it("produces a received error for a status decoded from the peer", () => {
            const error = ResultStatus.errorOf({ status: Status.Failure, clusterStatus: 2, received: true });

            expect(error).instanceOf(ReceivedStatusResponse.FailureError);
            expect(error).instanceOf(StatusResponse.FailureError);
            expect(error.code).equal(Status.Failure);
            expect(error.clusterCode).equal(2);
        });

        it("uses the caller's message", () => {
            const error = ResultStatus.errorOf({ status: Status.Busy, received: true }, "read failed");

            expect(error).instanceOf(ReceivedStatusResponseError);
            expect(error.message).equal("read failed (code 156)");
        });

        it("produces a local error for a status without origin mark", () => {
            const error = ResultStatus.errorOf({ status: Status.NoCommandResponse });

            expect(error).instanceOf(StatusResponse.NoCommandResponseError);
            expect(error).not.instanceOf(ReceivedStatusResponseError);
        });
    });
});
