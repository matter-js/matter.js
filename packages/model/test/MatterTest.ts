/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, CommandModel, FieldModel, Matter, ValidateModel } from "#index.js";

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
        expect(validationResult?.errors.length).most(7);
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

    it("resolves cross-command conformance references", () => {
        const provider = Matter.get(ClusterModel, "WebRtcTransportProvider");
        expect(provider).not.undefined;

        // SolicitOfferResponse.videoStreamId has conformance "SolicitOffer.VideoStreamID"
        const response = provider!.get(CommandModel, "SolicitOfferResponse");
        expect(response).not.undefined;
        const videoStreamId = response!.get(FieldModel, "VideoStreamId");
        expect(videoStreamId).not.undefined;

        // The conformance should reference SolicitOffer.VideoStreamID — verify it parsed and
        // doesn't produce UNRESOLVED_CONFORMANCE_NAME (the validator ran without errors for this field)
        expect(videoStreamId!.conformance.toString()).equal("SolicitOffer.VideoStreamID");

        // Verify the referenced command and field actually exist
        const solicitOffer = provider!.get(CommandModel, "SolicitOffer");
        expect(solicitOffer).not.undefined;
        expect(solicitOffer!.get(FieldModel, "VideoStreamId")).not.undefined;
    });
});
