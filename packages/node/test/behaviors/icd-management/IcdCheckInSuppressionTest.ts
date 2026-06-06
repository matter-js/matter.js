/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseAuthenticatedTag, NodeId, SubjectId } from "@matter/types";
import { isMonitoredSubjectCovered } from "../../../src/behaviors/icd-management/IcdCheckInSuppression.js";

describe("isMonitoredSubjectCovered", () => {
    it("is covered when a subscription subject node id matches", () => {
        const subjects = [{ id: NodeId(0x1234n), catSubjects: [] }];
        expect(isMonitoredSubjectCovered(SubjectId(0x1234n), subjects)).equals(true);
    });

    it("is covered when a subscription CAT matches the monitored CAT", () => {
        const monitored = NodeId.fromCaseAuthenticatedTag(CaseAuthenticatedTag(0xabcd0001));
        const subjects = [
            { id: NodeId(0x9n), catSubjects: [NodeId.fromCaseAuthenticatedTag(CaseAuthenticatedTag(0xabcd0002))] },
        ];
        expect(isMonitoredSubjectCovered(monitored, subjects)).equals(true);
    });

    it("is not covered when nothing matches", () => {
        const subjects = [{ id: NodeId(0x9n), catSubjects: [] }];
        expect(isMonitoredSubjectCovered(SubjectId(0x1234n), subjects)).equals(false);
    });

    it("is not covered with no subscriptions", () => {
        expect(isMonitoredSubjectCovered(SubjectId(0x1234n), [])).equals(false);
    });
});
