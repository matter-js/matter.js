/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogSource } from "./cert-context.js";

export type { LogSource };

/**
 * Opaque reference to a node commissioned through a {@link ControllerAdapter}.
 *
 * Adapters mint and interpret their own refs; a step never constructs or parses one, it only passes
 * back what {@link ControllerAdapter.commission} returned.
 */
export type CertNodeRef = string;

/**
 * Commissioning parameters a {@link ControllerAdapter} needs to pair a node.
 *
 * Structurally compatible with {@link Subject.CommissioningParameters} so a step can pass
 * `subject.commissioning` directly.
 */
export interface CommissioningTarget {
    passcode: number;
    discriminator: number;
    qrPairingCode?: string;
}

/**
 * An attribute (or, for {@link CertNodeApi.readAttribute}, wildcard attribute path).
 *
 * An absent field is a wildcard for that path segment. `readAttribute` supports wildcards
 * (TC-IDM-2.1); other operations require a concrete path.
 */
export interface AttributePathSpec {
    endpoint?: number;
    cluster?: number;
    attribute?: number;
}

export interface SubscribeOptions {
    minIntervalFloorSeconds: number;
    maxIntervalCeilingSeconds: number;
    onUpdate?: (value: unknown) => void;
}

/**
 * Controller-side view of a single commissioned node.
 */
export interface CertNodeApi {
    invoke(cluster: string | number, command: string, args?: object, endpoint?: number): Promise<unknown>;
    readAttribute(path: AttributePathSpec): Promise<unknown>;
    writeAttribute(path: AttributePathSpec, value: unknown): Promise<void>;
    subscribe(path: AttributePathSpec, opts: SubscribeOptions): Promise<unknown>;
    openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }>;
    removeFabric(fabricIndex: number): Promise<unknown>;
    readFabrics(): Promise<unknown[]>;
    decommission(): Promise<void>;
}

/**
 * A controller identity participating in a cert test (e.g. "dut", "th_cr2").
 *
 * Pure interface: no matter.js type ever crosses this boundary, only plain string/number addressing
 * and plain data. Implementations wrap a real controller stack (see
 * `support/chip-testing/src/cert/InProcessControllerAdapter.ts`) but this package must stay free of
 * that dependency.
 */
export interface ControllerAdapter {
    id: string;
    start(): Promise<void>;
    close(): Promise<void>;
    commission(target: CommissioningTarget): Promise<CertNodeRef>;
    node(ref: CertNodeRef): CertNodeApi;
    log: LogSource;
}
