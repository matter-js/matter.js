/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { bool, cluster, command, enum8, field, uint32 } from "@matter/main/model";

/** CHIP's `FaultType.ChipFault`, the type whose ids {@link ChipFault} names. */
export const FAULT_TYPE_CHIP = 3;

/**
 * Fault ids of the CHIP faults a cert test arms, which `CHIPFaultInjection.h` pins with static
 * assertions "because the test plan specification and automation code rely on this value".
 */
export const ChipFault = {
    /** Answers a batched invoke with one `InvokeResponseMessage` per command. */
    imInvokeSeparateResponses: 12,

    /** As {@link imInvokeSeparateResponses}, with the responses in reverse request order. */
    imInvokeSeparateResponsesInvertResponseOrder: 13,

    /** Answers only the first command of a batched invoke. */
    imInvokeSkipSecondResponse: 14,
} as const;

/**
 * Input to {@link FaultInjectionCluster.failAtFault}.
 */
class FailAtFaultRequest {
    @field(0, enum8)
    type!: number;

    @field(1, uint32)
    id!: number;

    /**
     * How many further checks of this fault pass before it fires. Every arming command is itself an
     * interaction the device checks its armed faults against, so a value chosen for a step's position
     * in a plan must count the arming commands too (see TC-IDM-1.3's own AGENTS.md section).
     */
    @field(2, uint32)
    numCallsToSkip!: number;

    @field(3, uint32)
    numCallsToFail!: number;

    @field(4, bool)
    takeMutex!: boolean;
}

/**
 * CHIP's own `FaultInjection` cluster, present in an app built with `nlfaultinject` and absent from the
 * Matter specification, so it is declared here rather than in the shipped model.
 *
 * @see {@link https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/fault-injection-cluster.xml}
 */
@cluster(0xfff1fc06, "FaultInjection")
export class FaultInjectionCluster {
    @command(0x00, FailAtFaultRequest)
    failAtFault(_request: FailAtFaultRequest): void {}
}
