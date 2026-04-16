/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvUInt64 } from "#tlv/TlvNumber.js";
import { TlvWrapper } from "#tlv/TlvWrapper.js";
import { hex } from "@matter/general";
import { GroupId } from "./GroupId.js";
import { NodeId } from "./NodeId.js";

/**
 * The meaning of a "Subject" is primarily that of describing the source for an action, using a given
 * authentication method provided by the Secure Channel architecture.
 *
 * @see {@link MatterSpecification.v10.Core} § 6.6.2.1
 */
export type SubjectId = NodeId | GroupId;

export function SubjectId(v: bigint | number): SubjectId {
    return BigInt(v) as SubjectId;
}

export namespace SubjectId {
    export function strOf(nodeId: SubjectId) {
        return hex.fixed(nodeId, 16);
    }
}

/** Tlv schema for a Subject Id */
export const TlvSubjectId = new TlvWrapper<SubjectId, number | bigint>(
    TlvUInt64,
    subjectId => subjectId,
    value => SubjectId(BigInt(value)),
);
