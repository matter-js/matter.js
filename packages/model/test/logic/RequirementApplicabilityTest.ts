/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "#aspects/index.js";
import { requirementApplicability } from "#logic/RequirementApplicability.js";
import { RequirementModel } from "#models/index.js";

describe("requirementApplicability", () => {
    function applicabilityOf(conformance: string, trueNames: string[], knownNames = ["Sit", "Lit", "Cooler"]) {
        return requirementApplicability(
            new RequirementModel({ name: "IcdManagement", element: "serverCluster", conformance }),
            new Set(trueNames),
            new Set(knownNames),
        );
    }

    it("makes a mandatory requirement mandatory", () => {
        expect(applicabilityOf("M", [])).equals(Conformance.Applicability.Mandatory);
    });

    it("makes a disallowed requirement inapplicable", () => {
        expect(applicabilityOf("X", [])).equals(Conformance.Applicability.None);
    });

    it("applies a satisfied name", () => {
        expect(applicabilityOf("Sit | Lit", ["Sit"])).equals(Conformance.Applicability.Mandatory);
    });

    it("does not apply an unsatisfied name", () => {
        expect(applicabilityOf("Sit | Lit", [])).equals(Conformance.Applicability.None);
    });

    it("leaves a name it cannot judge conditional", () => {
        expect(applicabilityOf("Ethernet", [], ["Sit"])).equals(Conformance.Applicability.Conditional);
    });

    it("leaves desc conditional", () => {
        expect(applicabilityOf("desc", [])).equals(Conformance.Applicability.Conditional);
    });

    it("keeps an optional fallback optional", () => {
        expect(applicabilityOf("Cooler, O", [])).equals(Conformance.Applicability.Optional);
    });
});
