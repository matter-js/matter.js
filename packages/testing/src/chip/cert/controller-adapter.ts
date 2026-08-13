/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogSource } from "./cert-context.js";
import type { LogFollower } from "./log-follower.js";

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
 * `subject.commissioning` directly for a device's original setup code.
 *
 * Either `manualPairingCode` or both `passcode`/`discriminator` must be present. An enhanced
 * commissioning window (`CertNodeApi.openCommissioningWindow({enhanced: true})`) generates a fresh
 * random discriminator/passcode pair that only the returned `manualPairingCode` carries — a step
 * commissioning through that window has no other way to obtain them.
 */
export interface CommissioningTarget {
    passcode?: number;
    discriminator?: number;
    qrPairingCode?: string;
    manualPairingCode?: string;
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
 * One attribute of a {@link CertNodeApi.writeAttributes} request.
 */
export interface AttributeWriteEntry {
    /**
     * Omitting `endpoint` writes the attribute on every endpoint that has the cluster (TC-IDM-3.1
     * step 2).
     */
    path: AttributePathSpec;

    value: unknown;

    /**
     * Writes only if the cluster still holds this data version (TC-IDM-3.1 step 15). Matter Core
     * § 8.9.2.8.1 forbids a data version on a wildcard path, so this requires a concrete `endpoint`.
     */
    dataVersion?: number;
}

/**
 * One attribute of a {@link CertNodeApi.readAttributes} response.
 */
export interface AttributeReadEntry {
    endpoint: number;
    cluster: number;
    attribute: number;
    value: unknown;
    /** The cluster's data version, which a version-conditional write sends back (TC-IDM-3.1 step 15). */
    version?: number;
}

/**
 * The device's per-path answer to one attribute of a write request.
 */
export interface AttributeWriteStatus {
    endpoint: number;
    cluster: number;
    attribute: number;
    /** Matter Core § 8.10 interaction status; `0` is success. */
    status: number;
}

export interface ReadAttributeOptions {
    /**
     * Whether the read is fabric-filtered (Matter Core § 8.9.2's `FabricFiltered` flag; default
     * true, the interaction-model default). Set false to read across all fabrics — a
     * fabric-scoped attribute like OperationalCredentials.fabrics otherwise returns only the
     * reading controller's own entry, useless for a multi-controller TC that must see fabrics it
     * didn't itself create.
     */
    fabricFiltered?: boolean;
}

/**
 * Controller-side view of a single commissioned node.
 */
export interface CertNodeApi {
    invoke(cluster: string | number, command: string, args?: object, endpoint?: number): Promise<unknown>;
    readAttribute(path: AttributePathSpec, options?: ReadAttributeOptions): Promise<unknown>;

    /**
     * Reads several attribute paths in one request.
     *
     * A step needing the data versions of two clusters (TC-IDM-3.1 step 15) must obtain them from a
     * single `ReadRequest`, which is what the plan's procedure describes; issuing one read per cluster
     * would exercise a different interaction.
     */
    readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions): Promise<AttributeReadEntry[]>;
    writeAttribute(path: AttributePathSpec, value: unknown): Promise<void>;

    /**
     * Writes several attributes in one request, optionally through wildcard paths or conditional on a
     * data version.
     *
     * Unlike {@link writeAttribute}, a rejected path is reported rather than thrown, so the step
     * decides which statuses it expected.
     *
     * A wildcard path yields a status only for the attributes actually written: Matter Core § 8.9.2.8
     * has the device skip an endpoint that lacks the cluster, an attribute it does not have, and one
     * it may not write, silently. A path missing from the result was therefore not written — it is not
     * a protocol failure, and a step that needs to know an attribute changed reads it back.
     *
     * An adapter whose controller cannot express a multi-path, wildcard or version-conditional write
     * throws {@link NotImplementedError}; a step that needs it then declares the flavors it runs on.
     */
    writeAttributes(entries: AttributeWriteEntry[]): Promise<AttributeWriteStatus[]>;
    subscribe(path: AttributePathSpec, opts: SubscribeOptions): Promise<unknown>;
    openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }>;
    decommission(): Promise<void>;
    /**
     * The operational mDNS instance name (`<compressed-fabric-id>-<node-id>._matter._tcp.local`) this node
     * advertises on the fabric it was commissioned onto — the same value matter.js's own advertiser computes
     * via `getOperationalDeviceQname` (`@matter/protocol`). A network check (see
     * `support/chip-testing/src/cert/mdns-check.ts`) uses this to attribute an operational SRV record to this
     * specific node rather than to whatever else is advertising `_matter._tcp` on the network.
     */
    operationalMdnsInstanceName(): Promise<string>;
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
    log: LogFollower;
}

/**
 * Builds a {@link ControllerAdapter} for the given id (e.g. "dut", "th_cr2").
 */
export type ControllerAdapterFactory = (id: string) => ControllerAdapter;

let activeFactory: ControllerAdapterFactory | undefined;

/**
 * Registers the {@link ControllerAdapterFactory} cert-test wiring uses to construct controllers.
 *
 * `packages/testing` cannot construct a real controller itself (that needs matter.js, which this
 * package must stay free of — see the repo's dependency invariant); `support/chip-testing/src/cert`
 * registers its `InProcessControllerAdapter` here at load time instead. There is exactly one slot:
 * re-registration throws, since a silent overwrite would swap controller implementations under any
 * cert test already declared.
 */
export function registerControllerAdapterFactory(factory: ControllerAdapterFactory): void {
    if (activeFactory) {
        throw new Error("A ControllerAdapter factory is already registered; only one is supported per process");
    }
    activeFactory = factory;
}

/**
 * Constructs a {@link ControllerAdapter} via the factory registered with
 * {@link registerControllerAdapterFactory}.
 */
export function createControllerAdapter(id: string): ControllerAdapter {
    if (!activeFactory) {
        throw new Error(
            "No ControllerAdapter factory registered; a consumer (e.g. support/chip-testing/src/cert/index.ts) " +
                "must call registerControllerAdapterFactory() before running a cert test",
        );
    }
    return activeFactory(id);
}
