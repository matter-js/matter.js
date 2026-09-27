/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { dispositionOf, RequirementDisposition } from "#endpoints/requirement-disposition.js";
import { Conformance } from "#model";

function disposition(conformance: string | undefined, clusterMandates: boolean, deviceRevision?: number) {
    return dispositionOf(new Conformance(conformance), { clusterMandates, deviceRevision });
}

describe("requirement disposition", () => {
    it("distinguishes stating nothing from stating optional", () => {
        // The difference eight device types turned on: a row that states only a constraint says nothing about
        // whether the element is required, and reading it as "optional" drops a mandatory attribute
        expect(disposition(undefined, true)).equals(RequirementDisposition.Unstated);
        expect(disposition("O", true)).equals(RequirementDisposition.Relax);
    });

    it("relaxes only what the cluster requires", () => {
        expect(disposition("O", true)).equals(RequirementDisposition.Relax);
        expect(disposition("O", false)).equals(RequirementDisposition.Permit);
    });

    it("mandates what the requirement mandates", () => {
        expect(disposition("M", false)).equals(RequirementDisposition.Mandate);
        expect(disposition("M", true)).equals(RequirementDisposition.Mandate);
    });

    it("treats a provisional element as neither required nor relaxed", () => {
        expect(disposition("P", true)).equals(RequirementDisposition.Provisional);
        expect(disposition("P, M", true)).equals(RequirementDisposition.Provisional);
    });

    it("does not relax on a conformance it cannot evaluate", () => {
        // Only a plain "O" says the element is optional here. A named condition, a choice or an expression states a
        // rule nobody checked at generation time, and relaxing on it is the ambiguity this resolver exists to remove
        for (const conformance of ["SomeCondition", "O.a", "O.a+", "[MACCNT]", "desc", "LT"]) {
            expect(disposition(conformance, true), conformance).equals(RequirementDisposition.Gated);
            expect(disposition(conformance, false), conformance).equals(RequirementDisposition.Permit);
        }
    });

    it("relaxes on a plain optional", () => {
        expect(disposition("O", true)).equals(RequirementDisposition.Relax);
    });

    it("forbids what the requirement disallows", () => {
        expect(disposition("X", true)).equals(RequirementDisposition.Disallow);
    });

    describe("revision gate", () => {
        it("mandates once the device type reaches the revision", () => {
            expect(disposition("Rev >= v2", false, 2)).equals(RequirementDisposition.Mandate);
            expect(disposition("Rev >= v2", false, 3)).equals(RequirementDisposition.Mandate);
        });

        it("does not mandate below the revision", () => {
            expect(disposition("Rev >= v2", false, 1)).equals(RequirementDisposition.Permit);
            expect(disposition("Rev >= v2", true, 1)).equals(RequirementDisposition.Gated);
        });

        it("resolves the gate when it leads an otherwise list", () => {
            expect(disposition("Rev >= v2, O", false, 2)).equals(RequirementDisposition.Mandate);
            expect(disposition("Rev >= v2, O", false, 1)).equals(RequirementDisposition.Permit);
        });

        it("steps aside for the terms behind it when the gate is not met", () => {
            // "Rev >= v2, O" below its gate states plain optional, so a cluster-mandatory element is relaxed.
            // Asked as one expression it is neither mandatory nor optional nor provisional, so the whole-conformance
            // questions cannot answer this.
            expect(disposition("Rev >= v2, O", true, 1)).equals(RequirementDisposition.Relax);
            expect(disposition("Rev >= v2, M", true, 1)).equals(RequirementDisposition.Mandate);
            expect(disposition("Rev >= v2, P", true, 1)).equals(RequirementDisposition.Provisional);
        });

        it("stays gated when every term is an unmet gate", () => {
            expect(disposition("Rev >= v2", true, 1)).equals(RequirementDisposition.Gated);
        });

        it("stays gated when the term behind it is one we cannot evaluate", () => {
            expect(disposition("Rev >= v2, [MACCNT]", true, 1)).equals(RequirementDisposition.Gated);
        });

        it("does not mandate when the revision is unknown", () => {
            expect(disposition("Rev >= v2", false)).equals(RequirementDisposition.Permit);
        });

        it("never relaxes, which a gate read as plain non-mandatory would", () => {
            for (const revision of [undefined, 1, 2]) {
                expect(disposition("Rev >= v2", true, revision)).not.equals(RequirementDisposition.Relax);
            }
        });
    });
});
