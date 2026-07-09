/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subject } from "#action/server/Subject.js";
import { subjectMatches } from "#interaction/subjectMatches.js";
import { SessionManager } from "#session/SessionManager.js";
import { FabricIndex, NodeId, SubjectId } from "@matter/types";

/** A subscription's subject as exposed by NodeSession.subjectFor(). */
export interface SubscriptionSubject {
    id: NodeId;
    catSubjects?: NodeId[];
}

/**
 * True when any subscription subject matches `monitoredSubject` (node id or CAT version compare). When covered, the ICD
 * suppresses the Check-In for that registration.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.16.5.3.2
 */
export function isMonitoredSubjectCovered(monitoredSubject: SubjectId, subjects: SubscriptionSubject[]): boolean {
    for (const subject of subjects) {
        if (subjectMatches(monitoredSubject, subject.id)) {
            return true;
        }
        for (const cat of subject.catSubjects ?? []) {
            if (subjectMatches(monitoredSubject, cat)) {
                return true;
            }
        }
    }
    return false;
}

/** Collect the subjects of all active subscriptions on a fabric. */
export function activeSubscriptionSubjects(sessions: SessionManager, fabricIndex: FabricIndex): SubscriptionSubject[] {
    const subjects = new Array<SubscriptionSubject>();
    for (const session of sessions.sessionsForFabricIndex(fabricIndex)) {
        // A closing session's subscriptions drain asynchronously; don't let it suppress a Check-In the client needs.
        if (session.isClosing || session.subscriptions.size === 0) {
            continue;
        }
        const subject = session.subjectFor();
        if (!Subject.isNode(subject)) {
            continue;
        }
        subjects.push({ id: subject.id, catSubjects: subject.catSubjects });
    }
    return subjects;
}
