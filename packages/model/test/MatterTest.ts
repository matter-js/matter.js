/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, CommandModel, Matter, ValidateModel } from "#index.js";

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
        expect(validationResult?.errors.length).most(11);
    });

    it("has not decreased in scope", () => {
        expect(validate().elementCount).least(3582);
    });

    it("exposes largeMessage quality on commands", () => {
        const tlsCert = Matter.get(ClusterModel, "TlsCertificateManagement");
        expect(tlsCert).not.undefined;

        const provision = tlsCert!.get(CommandModel, "ProvisionRootCertificate");
        expect(provision).not.undefined;
        expect(provision!.quality.largeMessage).equal(true);

        // Verify a non-large command does not have the flag
        const onOff = Matter.get(ClusterModel, "OnOff");
        expect(onOff).not.undefined;
        const toggle = onOff!.get(CommandModel, "Toggle");
        expect(toggle).not.undefined;
        expect(toggle!.quality.largeMessage).equal(undefined);
    });
});
