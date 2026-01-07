/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterDefinition, MatterModel, ValidateModel } from "#index.js";

let matterModel: MatterModel;
let validationResult: ValidateModel.Result | undefined;

function instantiate() {
    if (!matterModel) {
        matterModel = new MatterModel(MatterDefinition);
    }
    return matterModel;
}

function validate() {
    if (!validationResult) {
        validationResult = ValidateModel(instantiate());
    }
    return validationResult;
}

describe("MatterDefinition", () => {
    it("instantiates model", () => {
        expect(() => {
            instantiate();
        }).not.throw();
    });

    it("validates", function () {
        expect(() => {
            validate();
        }).not.throw();
    });

    it("has not increased in errors", () => {
        validate().report();
        expect(validationResult?.errors.length).most(16);
    });

    it("has not decreased in scope", () => {
        expect(validate().elementCount).least(3582);
    });
});
