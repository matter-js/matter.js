/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PicsValues } from "../pics/values.js";
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
 * A `qrPairingCode`, a `manualPairingCode`, or both `passcode`/`discriminator` must be present; an
 * adapter reads them in that order, so passing a whole `subject.commissioning` pairs through its
 * onboarding payload where the subject publishes one and through its setup code otherwise (a
 * subject that cannot render a payload reports it as an empty string).
 *
 * An enhanced commissioning window (`CertNodeApi.openCommissioningWindow({enhanced: true})`)
 * generates a fresh random discriminator/passcode pair that only the returned pairing codes carry —
 * a step commissioning through that window has no other way to obtain them.
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
 * An event path, wildcarded by omitting a field the same way {@link AttributePathSpec} is.
 */
export interface EventPathSpec {
    endpoint?: number;
    cluster?: number;
    event?: number;
}

/**
 * One event of a {@link CertNodeApi.readEvents} response or of a {@link CertNodeApi.subscribeEvents}
 * report.
 */
export interface EventReadEntry {
    endpoint: number;
    cluster: number;
    event: number;
    /** The publisher's own event number (Matter Core § 8.10.3), which orders a node's events. */
    eventNumber: bigint;
    value: unknown;
}

export interface ReadEventOptions {
    /** As {@link ReadAttributeOptions.fabricFiltered}. */
    fabricFiltered?: boolean;

    /**
     * Reports only events at or above this event number (Matter Core § 8.9.2.4's `EventFilters`).
     * Omitted, the request carries no filter at all, which is what the plan documents as the field's
     * optional case.
     */
    minEventNumber?: bigint;
}

export interface SubscribeEventOptions extends ReadEventOptions {
    minIntervalFloorSeconds: number;
    maxIntervalCeilingSeconds: number;
    onUpdate?: (event: EventReadEntry) => void;
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

/**
 * Asks for an interaction to be sent as a timed one (Matter Core § 8.7): the controller precedes it
 * with a `TimedRequest` carrying `timedInteractionTimeoutMs`, waits for the device's status response,
 * and must then deliver the interaction itself inside that window or the device rejects it.
 *
 * Omitted, the controller sends the interaction untimed unless the command or attribute requires
 * timed interaction on its own.
 *
 * The field is a `uint16` on the wire (§ 10.6.11's `TimedRequestMessage`). A value outside that range,
 * or a fractional one, is refused by every adapter before it issues anything.
 */
export interface TimedInteractionOptions {
    timedInteractionTimeoutMs?: number;
}

/**
 * One command of a {@link CertNodeApi.invokeBatch} request.
 */
export interface BatchCommandSpec {
    cluster: string | number;
    command: string;
    args?: object;
    /** Default 0, as {@link CertNodeApi.invoke}'s own endpoint argument. */
    endpoint?: number;
}

/**
 * The device's answer to one command of a {@link CertNodeApi.invokeBatch} request.
 */
export interface BatchCommandResult {
    /**
     * Position of the answered command in the request (Matter Core § 8.9.3's `CommandRef`, which the
     * device echoes). A device answering out of order — or not at all — is still attributable.
     */
    index: number;

    /** Interaction status; `0` is success. Absent when the device answered with a response payload. */
    status?: number;

    /** Cluster-specific status accompanying `status`, when the device sent one. */
    clusterStatus?: number;

    /** Response payload, for a command that has one. */
    data?: unknown;
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
    invoke(
        cluster: string | number,
        command: string,
        args?: object,
        endpoint?: number,
        options?: TimedInteractionOptions,
    ): Promise<unknown>;

    /**
     * Invokes several commands in one request (Matter Core § 8.2.5's batch commands), each carrying its
     * own `CommandRef` so the device's answers stay attributable.
     *
     * Results come back in **arrival** order, each naming the request position it answers, because that
     * order is itself evidence: TC-IDM-1.3 has the device answer a two-command batch in reverse, and in
     * separate response messages, and a step proving it needs to see what arrived when.
     *
     * A command the device never answers yields `Status.NoCommandResponse` (0xcc) rather than being
     * omitted, so a step distinguishes "answered with a failure" from "not answered at all". Unlike
     * {@link invoke}, a failure status is reported rather than thrown — the whole point of the batch is
     * that its commands fail independently.
     *
     * A controller with no batch-invoke support throws {@link UnsupportedByControllerError} (see
     * {@link CertNodeApi}'s own doc for the general contract).
     */
    invokeBatch(commands: BatchCommandSpec[], options?: TimedInteractionOptions): Promise<BatchCommandResult[]>;

    readAttribute(path: AttributePathSpec, options?: ReadAttributeOptions): Promise<unknown>;

    /**
     * Reads several attribute paths in one request.
     *
     * A step needing the data versions of two clusters (TC-IDM-3.1 step 15) must obtain them from a
     * single `ReadRequest`, which is what the plan's procedure describes; issuing one read per cluster
     * would exercise a different interaction.
     */
    readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions): Promise<AttributeReadEntry[]>;
    writeAttribute(path: AttributePathSpec, value: unknown, options?: TimedInteractionOptions): Promise<void>;

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

    /**
     * Reads every event `paths` selects in one request (Matter Core § 8.4).
     *
     * A concrete path the device answers with a status **rejects**, matching {@link readAttribute}: the
     * step asked for that event and got none. A wildcard path's statuses are per-item results of the
     * expansion instead, so those are dropped and whatever data arrived is returned.
     *
     * A node with no records for a selected path answers with neither data nor a status, so an empty
     * result is a successful read, not a failure.
     */
    readEvents(paths: EventPathSpec[], options?: ReadEventOptions): Promise<EventReadEntry[]>;

    /**
     * Subscribes to every event `paths` selects (Matter Core § 8.5), resolving with the priming
     * report's events; later reports reach `opts.onUpdate`.
     *
     * Rejects on a concrete path's status for the same reason {@link subscribe} does.
     */
    subscribeEvents(paths: EventPathSpec[], opts: SubscribeEventOptions): Promise<EventReadEntry[]>;
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
const controllerPics = new Map<ControllerImplementation, PicsValues>();

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
    pics?: PicsValues,
): void {
    if (factories.has(implementation)) {
        throw new Error(
            `A ControllerAdapter factory is already registered for "${implementation}"; only one is supported ` +
                "per implementation per process",
        );
    }
    factories.set(implementation, factory);
    if (pics !== undefined) {
        controllerPics.set(implementation, pics);
    }
}

/**
 * The PICS entries `implementation` declares about itself, which overlay the device's own PICS for the
 * run (see `cert-dsl.ts`'s test-level gate).
 *
 * A cert test's DUT is the controller, so a capability like batched invoke is the controller's to
 * declare — but the PICS file a run loads describes the device. Rather than maintain a whole PICS file
 * per controller, an adapter states only what differs, beside the code that implements or refuses it.
 */
export function controllerPicsOverridesFor(implementation: ControllerImplementation): PicsValues {
    return controllerPics.get(implementation) ?? {};
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
    controllerPics.delete(implementation);
}
