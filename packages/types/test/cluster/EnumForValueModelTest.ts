/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalCredentials } from "#clusters/operational-credentials.js";

describe("EnumForValueModel runtime shape", () => {
    it("exposes forward name→value mapping like a TS numeric enum", () => {
        expect(OperationalCredentials.NodeOperationalCertStatus.Ok).equal(0);
        expect(OperationalCredentials.NodeOperationalCertStatus.LabelConflict).equal(10);
        expect(OperationalCredentials.NodeOperationalCertStatus.InvalidFabricIndex).equal(11);
    });

    it("exposes reverse value→name mapping like a TS numeric enum", () => {
        expect(OperationalCredentials.NodeOperationalCertStatus[0]).equal("Ok");
        expect(OperationalCredentials.NodeOperationalCertStatus[10]).equal("LabelConflict");
        expect(OperationalCredentials.NodeOperationalCertStatus[11]).equal("InvalidFabricIndex");
    });

    it("returns undefined for unknown values", () => {
        expect(OperationalCredentials.NodeOperationalCertStatus[999]).equal(undefined);
    });
});
