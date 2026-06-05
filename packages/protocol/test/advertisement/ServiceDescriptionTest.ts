/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { Seconds } from "@matter/general";
import { IcdManagement } from "@matter/types/clusters/icd-management";

describe("ServiceDescription", () => {
    it("carries ICD operating mode and session intervals on operational descriptions", () => {
        const fabric = {} as never; // the operational factory only needs a fabric reference
        const desc = ServiceDescription.Operational({
            fabric,
            icd: IcdManagement.OperatingMode.Lit,
            idleInterval: Seconds(30),
            activeInterval: Seconds(3),
            activeThreshold: Seconds(5),
        });
        expect(desc.kind).equals("operational");
        expect(desc.icd).equals(IcdManagement.OperatingMode.Lit);
        expect(desc.idleInterval).equals(Seconds(30));
        expect(desc.activeInterval).equals(Seconds(3));
        expect(desc.activeThreshold).equals(Seconds(5));
    });

    it("keeps icd: Sit (value 0) defined, not dropped as falsy", () => {
        const fabric = {} as never;
        const desc = ServiceDescription.Operational({ fabric, icd: IcdManagement.OperatingMode.Sit });
        expect(desc.icd).equals(IcdManagement.OperatingMode.Sit);
        expect(desc.icd).not.undefined;
    });
});
