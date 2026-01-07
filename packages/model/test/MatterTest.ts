/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter, ValidateModel } from "#index.js";

let validationResult: ValidateModel.Result | undefined;

function validate() {
    if (!validationResult) {
        validationResult = ValidateModel(Matter);
    }
    return validationResult;
}

describe("MatterDefinition", () => {
    it("validates", function () {
        validate();
    });

    it("has not increased in errors", () => {
        validate().report();
        expect(validationResult?.errors.length).most(2);
    });

    it("has not decreased in scope", () => {
        expect(validate().elementCount).least(3582);
    });
});
