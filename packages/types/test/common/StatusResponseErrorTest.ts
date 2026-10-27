/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ReceivedStatusResponse,
    ReceivedStatusResponseError,
    StatusResponse,
    StatusResponseError,
    UnknownStatusResponseError,
} from "#common/StatusResponseError.js";
import { Status } from "#globals/Status.js";

describe("StatusResponseError", () => {
    describe("local family", () => {
        it("creates the local specialization, which is not received", () => {
            const error = StatusResponseError.create(Status.NotFound, undefined, 3);

            expect(error).instanceOf(StatusResponse.NotFoundError);
            expect(error).instanceOf(StatusResponseError);
            expect(error).not.instanceOf(ReceivedStatusResponseError);
            expect(error.received).false;
            expect(error.code).equal(Status.NotFound);
            expect(error.clusterCode).equal(3);
            expect(error.message).equal("Not found (code 139; cluster code 3)");
            expect(error.id).equal("not-found");
        });

        it("returns an UnknownStatusResponseError for a code without specialization", () => {
            const error = StatusResponseError.create(0x7777 as Status);

            expect(error).instanceOf(UnknownStatusResponseError);
            expect(error).not.instanceOf(ReceivedStatusResponseError);
            expect(error.code).equal(0x7777);
            expect(error.message).equal("Unknown status response (code 30583)");
        });
    });

    describe("id", () => {
        for (const [code, id] of [
            [Status.NotFound, "not-found"],
            [Status.ConstraintError, "constraint-error"],
            [0x7777 as Status, "unknown-30583"],
        ] as const) {
            it(`gives status ${code} the id "${id}" however the error is built`, () => {
                const errors = [
                    new StatusResponseError("Refused", code),
                    StatusResponseError.create(code),
                    new ReceivedStatusResponseError("Refused", code),
                    ReceivedStatusResponseError.create(code),
                ];

                expect(errors.map(error => error.id)).deep.equal([id, id, id, id]);
            });
        }

        it("derives the id of a status from its name", () => {
            expect(StatusResponseError.idOf(Status.DynamicConstraintError)).equal("dynamic-constraint-error");
            expect(StatusResponseError.idOf(0x7777 as Status)).equal("unknown-30583");
        });

        it("keeps the class id of a subclass with an identity of its own", () => {
            class CustomError extends StatusResponseError {}

            expect(new CustomError("Refused", Status.NotFound).id).equal("custom");
        });
    });

    describe("received family", () => {
        it("creates the received specialization, which is also the local one", () => {
            const error = ReceivedStatusResponseError.create(Status.NotFound, undefined, 3);

            expect(error).instanceOf(ReceivedStatusResponse.NotFoundError);
            expect(error).instanceOf(StatusResponse.NotFoundError);
            expect(error).instanceOf(ReceivedStatusResponseError);
            expect(error).instanceOf(StatusResponseError);
            expect(error.received).true;
            expect(error.code).equal(Status.NotFound);
            expect(error.clusterCode).equal(3);
            expect(error.message).equal("Not found (code 139; cluster code 3)");
        });

        it("names a received class apart from the local one", () => {
            expect(ReceivedStatusResponse.ConstraintErrorError.name).equal("ReceivedConstraintError");
            expect(StatusResponse.ConstraintErrorError.name).equal("ConstraintError");
            expect(ReceivedStatusResponseError.create(0x7777 as Status).constructor.name).equal(
                "ReceivedUnknownStatusResponseError",
            );
        });

        it("returns a received UnknownStatusResponseError for a code without specialization", () => {
            const error = ReceivedStatusResponseError.create(0x7777 as Status, undefined, 2);

            expect(error).instanceOf(UnknownStatusResponseError);
            expect(error).instanceOf(ReceivedStatusResponseError);
            expect(error.code).equal(0x7777);
            expect(error.message).equal("Unknown status response (code 30583; cluster code 2)");
            expect(error.id).equal(StatusResponseError.create(0x7777 as Status).id);
        });

        it("marks a directly constructed ReceivedStatusResponseError as received", () => {
            const error = new ReceivedStatusResponseError("Refused", Status.Busy);

            expect(error).instanceOf(ReceivedStatusResponseError);
            expect(error.received).true;
        });

        it("works with the StatusResponseError helpers", () => {
            const received = ReceivedStatusResponseError.create(Status.Busy);
            const wrapped = new Error("outer", { cause: received });

            expect(StatusResponseError.is(wrapped, Status.Busy)).true;
            expect(ReceivedStatusResponseError.is(wrapped, Status.Busy)).true;
            expect(StatusResponseError.of(wrapped)).equal(received);
            expect(ReceivedStatusResponseError.of(wrapped)).equal(received);
            expect(() => StatusResponseError.accept(received)).not.throws();
            expect(() => ReceivedStatusResponseError.accept(received)).not.throws();
        });

        it("does not accept a local status as received", () => {
            const local = StatusResponseError.create(Status.Busy);

            expect(local.received).false;
            expect(ReceivedStatusResponseError.of(local)).undefined;
            expect(ReceivedStatusResponseError.is(local)).false;
            expect(() => ReceivedStatusResponseError.accept(local)).throws(StatusResponse.BusyError);
            expect(new StatusResponseError("Refused", Status.Busy)).not.instanceOf(ReceivedStatusResponseError);
        });

        it("does not accept a value that is not a StatusResponseError as received", () => {
            for (const value of [new Error("Refused"), { received: true }, undefined, "received"]) {
                expect(value).not.instanceOf(ReceivedStatusResponseError);
            }
        });

        it("keeps the prototype check for a subclass of ReceivedStatusResponseError", () => {
            class SubclassError extends ReceivedStatusResponseError {}

            expect(new SubclassError("Refused", Status.Busy)).instanceOf(SubclassError);
            expect(ReceivedStatusResponseError.create(Status.Busy)).not.instanceOf(SubclassError);
        });
    });
});
