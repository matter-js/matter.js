/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclGrant, coversGrant, grantsEqual } from "#reconcile/acl-coverage.js";
import { ClusterId, EndpointNumber, SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

const { Administer, Operate, View } = AccessControl.AccessControlEntryPrivilege;
const { Case } = AccessControl.AccessControlEntryAuthMode;

function grant(p: number, subjects: AclGrant["subjects"], targets: AclGrant["targets"]): AclGrant {
    return { privilege: p, authMode: Case, subjects, targets };
}

const s1 = SubjectId(1n);
const s2 = SubjectId(2n);

describe("acl-coverage", () => {
    describe("coversGrant", () => {
        it("exact entry covers desired", () => {
            expect(coversGrant([grant(Operate, [s1], null)], grant(Operate, [s1], null))).equals(true);
        });

        it("higher privilege covers lower", () => {
            expect(coversGrant([grant(Administer, [s1], null)], grant(Operate, [s1], null))).equals(true);
        });

        it("lower privilege does not cover higher", () => {
            expect(coversGrant([grant(View, [s1], null)], grant(Operate, [s1], null))).equals(false);
        });

        it("wildcard subjects (null) covers a specific subject", () => {
            expect(coversGrant([grant(Operate, null, null)], grant(Operate, [s1], null))).equals(true);
        });

        it("specific subject does not cover a wildcard desire", () => {
            expect(coversGrant([grant(Operate, [s1], null)], grant(Operate, null, null))).equals(false);
        });

        it("union of two entries covers a multi-subject desire (device split)", () => {
            const entries = [grant(Operate, [s1], null), grant(Operate, [s2], null)];
            expect(coversGrant(entries, grant(Operate, [s1, s2], null))).equals(true);
        });

        it("different authMode does not cover", () => {
            const groupGrant: AclGrant = {
                privilege: Operate,
                authMode: AccessControl.AccessControlEntryAuthMode.Group,
                subjects: [s1],
                targets: null,
            };
            expect(coversGrant([grant(Operate, [s1], null)], groupGrant)).equals(false);
        });

        it("wildcard targets covers a specific target", () => {
            const desired = grant(
                Operate,
                [s1],
                [{ cluster: ClusterId(6), endpoint: EndpointNumber(1), deviceType: null }],
            );
            expect(coversGrant([grant(Operate, [s1], null)], desired)).equals(true);
        });

        it("specific target does not cover a different cluster", () => {
            const entry = grant(Operate, [s1], [{ cluster: ClusterId(6), endpoint: null, deviceType: null }]);
            const desired = grant(Operate, [s1], [{ cluster: ClusterId(8), endpoint: null, deviceType: null }]);
            expect(coversGrant([entry], desired)).equals(false);
        });
    });

    describe("grantsEqual", () => {
        it("equal regardless of subject order", () => {
            expect(grantsEqual(grant(Operate, [s1, s2], null), grant(Operate, [s2, s1], null))).equals(true);
        });

        it("not equal on privilege", () => {
            expect(grantsEqual(grant(Operate, [s1], null), grant(View, [s1], null))).equals(false);
        });
    });
});

describe("acl-coverage edges", () => {
    const base: AclGrant = { privilege: Operate, authMode: Case, subjects: [SubjectId(0x55n)], targets: null };

    it("treats a wildcard field as covering any value, and a set field as covering only its own", () => {
        const wildcard: AclGrant = {
            ...base,
            targets: [{ cluster: null, endpoint: null, deviceType: null }],
        };
        const specific: AclGrant = {
            ...base,
            targets: [{ cluster: ClusterId(6), endpoint: EndpointNumber(1), deviceType: null }],
        };
        expect(coversGrant([wildcard], specific)).equals(true);
        expect(coversGrant([specific], wildcard)).equals(false);

        // One differing field is enough to stop covering, in each position.
        for (const differing of [
            { cluster: ClusterId(8), endpoint: EndpointNumber(1), deviceType: null },
            { cluster: ClusterId(6), endpoint: EndpointNumber(2), deviceType: null },
        ]) {
            expect(coversGrant([{ ...base, targets: [differing] }], specific)).equals(false);
        }
    });

    it("compares subject sets by membership, and tells an empty list from no list", () => {
        const two: AclGrant = { ...base, subjects: [SubjectId(0x55n), SubjectId(0x56n)] };
        const reordered: AclGrant = { ...base, subjects: [SubjectId(0x56n), SubjectId(0x55n)] };
        expect(grantsEqual(two, reordered)).equals(true);
        expect(grantsEqual(two, base)).equals(false);
        expect(grantsEqual({ ...base, subjects: null }, base)).equals(false);
        expect(grantsEqual({ ...base, subjects: null }, { ...base, subjects: null })).equals(true);
    });
});
