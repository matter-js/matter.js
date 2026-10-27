/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteResponse } from "#behavior/system/remote/api/RemoteResponse.js";
import { InternalError } from "@matter/general";
import { WriteResult } from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    EndpointNumber,
    ReceivedStatusResponseError,
    Status,
    StatusResponseError,
} from "@matter/types";

function codeOf(error: Error) {
    const response = RemoteResponse({ kind: "error", id: "1", error });
    if (response.kind !== "error") {
        expect.fail(`expected an error response, got "${response.kind}"`);
    }
    return response.code;
}

function thrownBy(operation: () => void) {
    try {
        operation();
    } catch (error) {
        if (error instanceof Error) {
            return error;
        }
    }
    expect.fail("operation did not throw an Error");
}

describe("RemoteResponse", () => {
    it("sends one code for a status however the error was built", () => {
        const codes = [
            new StatusResponseError("Refused", Status.ConstraintError),
            StatusResponseError.create(Status.ConstraintError),
            new ReceivedStatusResponseError("Refused", Status.ConstraintError),
            ReceivedStatusResponseError.create(Status.ConstraintError),
        ].map(codeOf);

        expect(codes).deep.equal(["constraint-error", "constraint-error", "constraint-error", "constraint-error"]);
    });

    it("sends the status id for a write rejection, whether local or received", () => {
        for (const received of [undefined, true] as const) {
            const error = thrownBy(() =>
                WriteResult.assertSuccess([
                    {
                        kind: "attr-status",
                        path: { endpointId: EndpointNumber(1), clusterId: ClusterId(6), attributeId: AttributeId(0) },
                        status: Status.ConstraintError,
                        received,
                    },
                ]),
            );

            expect(codeOf(error), `received ${received}`).equal("constraint-error");
        }
    });

    it("sends the class id of an error that is not a status", () => {
        expect(codeOf(new InternalError())).equal("internal");
    });

    it("sends the message without the code suffix", () => {
        const response = RemoteResponse({ kind: "error", id: "1", error: StatusResponseError.create(Status.Busy) });

        expect(response).deep.include({ message: "Busy" });
    });
});
