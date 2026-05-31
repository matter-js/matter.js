/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpandedStatus } from "#common/ExpandedStatus.js";
import { PathError } from "#common/PathError.js";
import { DataModelPath } from "@matter/model";
import { Status, StatusResponseError } from "@matter/types";

describe("PathError", () => {
    const path = new DataModelPath(1, "endpoint").at("onOff", "cluster").at("state").at("onOff");

    it("is a StatusResponseError carrying the expanded status code", () => {
        const error = new PathError({
            path,
            status: new ExpandedStatus({ status: Status.UnsupportedAttribute }),
        });

        expect(error).instanceOf(StatusResponseError);
        expect(error.code).equal(Status.UnsupportedAttribute);
    });

    it("exposes the path and status id", () => {
        const error = new PathError({
            path,
            status: new ExpandedStatus({ status: Status.UnsupportedAttribute }),
        });

        expect(error.path).equal(path);
        expect(error.id).equal("unsupported-attribute");
    });

    it("derives a human-readable message from the status id", () => {
        const error = new PathError({
            path,
            status: new ExpandedStatus({ status: Status.UnsupportedAttribute }),
        });

        expect(error.message).equal("Unsupported attribute");
    });

    it("honors an explicit message", () => {
        const error = new PathError({
            path,
            status: new ExpandedStatus({ status: Status.Failure }),
            message: "custom message",
        });

        expect(error.message).equal("custom message");
    });
});
