/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogSource } from "./cert-context.js";
import { resolveControllerImplementation } from "./device-config.js";
import type { ControllerImplementation } from "./device-config.js";
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

    /**
     * Ask for commissioning to give up after a single operational handshake attempt, so a step that means to prove the
     * device refused a commissioner is not answered by a retry that succeeded instead.
     *
     * Only a step asserting a refusal should set this: shortening the budget also removes the recovery a healthy
     * commissioning legitimately needs (a second candidate address, a device that answers the first handshake with
     * `NoSharedTrustRoots`), so a step that expects to succeed must leave it alone.
     *
     * Advisory. An adapter whose commissioner already stops after one attempt has nothing to do.
     */
    singleHandshakeAttempt?: boolean;
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
 *
 * A method whose controller cannot express the requested operation throws
 * {@link UnsupportedByControllerError} rather than performing part of the interaction and returning
 * a partial result; a step that needs the capability declares the flavors/controllers it runs on
 * instead.
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
     * throws {@link UnsupportedByControllerError} (see {@link CertNodeApi}'s own doc for the general
     * contract).
     */
    writeAttributes(entries: AttributeWriteEntry[]): Promise<AttributeWriteStatus[]>;
    /**
     * Subscribes to `path`, resolving with the priming value (concrete path) or the priming entries
     * (wildcard path); later reports reach `opts.onUpdate`.
     *
     * A concrete path the device answers with a status **rejects**: the step asked to be notified about
     * that attribute and never will be, so resolving would only defer the failure until the step's own
     * report budget ran out. A wildcard path is different — the subscription exists, and a per-path
     * status is one item of its expansion rather than the subscription failing — so those statuses are
     * reported through the entries and do not reject.
     *
     * Every adapter must agree on this: a step that fails under one controller and passes under another
     * is supposed to mean an interop finding, so a difference between adapters manufactures that signal
     * out of nothing.
     */
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
 * Thrown by a {@link ControllerAdapter} (or a {@link CertNodeApi} it returns) whose underlying
 * controller cannot express the requested operation — e.g. a {@link CertNodeApi.writeAttributes}
 * request chip-tool has no single command for. The step runner records such a step `skipped`
 * rather than failing the run; every other thrown value still fails and aborts it.
 *
 * Raise this before the operation has any observable effect (a commission, a write, a recorded
 * check). Raising it after a step already recorded evidence discards that evidence under a
 * `skipped` verdict instead of a `fail`.
 */
export class UnsupportedByControllerError extends Error {
    constructor(
        readonly operation: string,
        readonly controller: string,
        detail?: string,
    ) {
        super(
            `not implementable on controller "${controller}": ${operation}` +
                (detail === undefined ? "" : ` — ${detail}`),
        );
    }
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

const factories = new Map<ControllerImplementation, ControllerAdapterFactory>();

/**
 * Registers the {@link ControllerAdapterFactory} cert-test wiring uses to construct controllers for
 * `implementation`.
 *
 * `packages/testing` cannot construct a real controller itself (that needs matter.js, which this
 * package must stay free of — see the repo's dependency invariant); `support/chip-testing/src/cert`
 * registers its adapters here at load time instead, one factory per implementation. Re-registering
 * the *same* implementation throws, since a silent overwrite would swap the controller stack under a
 * cert test already declared; registering a *different* implementation is normal — a process can
 * offer several, and {@link resolveControllerImplementation} picks between them per run.
 */
export function registerControllerAdapterFactory(
    implementation: ControllerImplementation,
    factory: ControllerAdapterFactory,
): void {
    if (factories.has(implementation)) {
        throw new Error(
            `A ControllerAdapter factory is already registered for "${implementation}"; only one is supported ` +
                "per implementation per process",
        );
    }
    factories.set(implementation, factory);
}

/**
 * Constructs a {@link ControllerAdapter} for `role`, via the factory registered for the run's
 * {@link resolveControllerImplementation | selected implementation}.
 */
export function createControllerAdapter(role: string): ControllerAdapter {
    const implementation = resolveControllerImplementation();
    const factory = factories.get(implementation);
    if (!factory) {
        throw new Error(
            `No ControllerAdapter factory registered for "${implementation}"; a consumer (e.g. ` +
                "support/chip-testing/src/cert/index.ts) must call registerControllerAdapterFactory() for it " +
                "before running a cert test",
        );
    }
    return factory(role);
}

/**
 * Removes `implementation`'s registered factory, so a test can register a throwaway one for an
 * implementation no production code has claimed yet without leaving it stuck for the rest of the
 * process (registration has no other way to be undone).
 */
export function resetControllerAdapterFactoryForTesting(implementation: ControllerImplementation): void {
    factories.delete(implementation);
}
