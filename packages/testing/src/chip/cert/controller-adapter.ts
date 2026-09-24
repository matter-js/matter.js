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
     * Bounds how long the controller looks for the commissionee before giving up.
     *
     * For a step whose code names a device that is not there, where the controller's own budget is
     * far longer than the step needs — matter.js waits out the specification's 3-minute minimum
     * commissioning window. A controller that cannot be bounded says so and reports whatever its own
     * policy produces.
     *
     * On matter.js this **also caps PASE establishment**, which otherwise gets 30 seconds of its own:
     * `CommissioningDiscovery.Options` merges the discovery and commissioning option sets and both
     * declare `timeout`. Harmless where no device is expected to answer; a step that sets this on a
     * target that does resolve is shortening its handshake budget too.
     */
    giveUpAfterMs?: number;

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

    /**
     * Marks every path of the subscription urgent, which a step operating the device and then waiting
     * for the event needs: without it the publisher holds queued events until the subscription's
     * maximum interval elapses.
     *
     * Off by default because it is visible on the wire, and a step asserting the subscribe request it
     * sent describes the request it asked for.
     *
     * @see {@link MatterSpecification.v16.Core} § 8.5
     */
    urgent?: boolean;
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
 * A concrete attribute path, spelled out rather than derived from {@link AttributePathSpec}: an
 * optional field added there later would silently become mandatory at every call site.
 */
export interface ClientAttributePath {
    endpoint: number;
    cluster: number;
    attribute: number;
}

/**
 * One endpoint of a node as a controller holds it.
 *
 * This is not what a read answers. A read reports what the node exposes now; this reports what the
 * controller believes, which is the only way to tell whether a controller noticed a bridge adding or
 * removing a device rather than merely being able to see it.
 */
export interface ClientEndpointEntry {
    endpoint: number;
    deviceTypes: number[];
    parts: number[];
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

    /**
     * Whether the read requires a session that permits payloads larger than the IPv6 MTU, which is a
     * session over TCP (Matter Core § 4.15.1).
     *
     * A hard requirement, not a preference: a controller that cannot establish such a session fails
     * the read, or refuses it with {@link UnsupportedByControllerError}, rather than reading over MRP
     * — so a step asking for one cannot pass on a transport it did not use. A broad read is the case
     * for it: the peer answers in a single report where MRP would have made it chunk.
     */
    largeMessage?: boolean;
}

/**
 * The transfer an initiator proposed in the `*Init` message a responder answered.
 *
 * @see {@link MatterSpecification.v16.Core} § 11.22.5.1
 */
export interface BdxTransferProposal {
    /** Protocol version the initiator proposed, from the Transfer Control field's low nibble. */
    version: number;

    /** Driver modes the initiator offered; a responder chooses exactly one of those it set. */
    senderDrive: boolean;
    receiverDrive: boolean;
    asynchronousTransfer: boolean;

    /** Largest block, in bytes, the initiator said it can take. */
    maxBlockSize: number;

    /** Offset into the file the transfer is to start at, absent where the initiator named none. */
    startOffset?: number;

    /** The definite length proposed, absent where the initiator proposed an indefinite transfer. */
    definiteLength?: number;

    /**
     * File designator the initiator named, as the text its bytes carry. For an OTA download it is the
     * path out of the image URI the provider answered `QueryImage` with, `ota/<filename>`.
     */
    fileDesignator: string;

    /** Length of that designator in bytes, which is the message's own File Designator Length field. */
    fileDesignatorLength: number;
}

/**
 * What a responder granted in the `*Accept` message it answered a {@link BdxTransferProposal} with.
 *
 * Read back from the responder's own session rather than decoded from the wire, so a case whose DUT
 * *is* the responder states what the DUT sent rather than what the peer reports having received.
 *
 * @see {@link MatterSpecification.v16.Core} § 11.22.5.2, § 11.22.5.3
 */
export interface BdxTransferAccept {
    /** Protocol version the responder chose, which may not be newer than the proposed one. */
    version: number;

    /** The one driver mode chosen, named as the proposal names them. */
    mode: "senderDrive" | "receiverDrive";

    /** Whether the responder granted asynchronous transfer. */
    asynchronousTransfer: boolean;

    /** Block size granted, which may not exceed the proposed maximum. */
    maxBlockSize: number;

    /**
     * The definite length granted, absent where the accept carried none.
     *
     * A `ReceiveAccept` carries no Range Control field of its own on the API surface: the flag is
     * derived from this length, so its presence *is* the definite-length bit the peer reads.
     */
    definiteLength?: number;
}

/**
 * The `QueryImage` a requestor sent this provider, as the provider received it (Matter Core
 * § 11.20.6.5).
 *
 * `protocolsSupported` and the optional fields are reported as the requestor set them, because a case
 * asserting on the DUT's answer has to be able to say what the answer was to.
 */
export interface OtaQueryImageRequestRecord {
    vendorId: number;
    productId: number;
    softwareVersion: number;
    protocolsSupported: number[];
    hardwareVersion?: number;
    location?: string;
    requestorCanConsent?: boolean;

    /** `MetadataForProvider` as hex, absent where the requestor sent none. */
    metadataForProvider?: string;
}

/** The `QueryImageResponse` this provider answered with (Matter Core § 11.20.6.6). */
export interface OtaQueryImageResponseRecord {
    /** `QueryStatus`, as the cluster enumerates it: 0 UpdateAvailable, 1 Busy, 2 NotAvailable, 3 DownloadProtocolNotSupported. */
    status: number;
    delayedActionTime?: number;
    imageUri?: string;
    softwareVersion?: number;
    softwareVersionString?: string;

    /** `UpdateToken` as hex, whose byte length is what the plan's 8–32 byte rule is about. */
    updateToken?: string;
    userConsentNeeded?: boolean;

    /** `MetadataForRequestor` as hex, absent where the provider sent none. */
    metadataForRequestor?: string;
}

/** One `QueryImage` a requestor sent this provider, with the answer it got. */
export interface OtaQueryImageExchange {
    request: OtaQueryImageRequestRecord;
    response: OtaQueryImageResponseRecord;
}

/** One `ApplyUpdateRequest` a requestor sent this provider, with the answer it got (§ 11.20.6.9–10). */
export interface OtaApplyUpdateExchange {
    request: {
        /** `UpdateToken` as hex, which the plan compares with the one the `QueryImageResponse` carried. */
        updateToken: string;
        newVersion: number;
    };
    response: {
        /** `Action`: 0 Proceed, 1 AwaitNextAction, 2 Discontinue. */
        action: number;
        delayedActionTime: number;
    };
}

/** One `NotifyUpdateApplied` a requestor sent this provider (§ 11.20.6.11). */
export interface OtaNotifyUpdateAppliedRecord {
    /** `UpdateToken` as hex. */
    updateToken: string;
    softwareVersion: number;
}

/**
 * Every OTA command the controller's provider answered during one served update, in the order it
 * answered them.
 *
 * A provider's own answer is not observable from outside it: the requestor's log says what it
 * received, and nothing says what the fields of the response were. So the cases whose DUT is the
 * provider read them here, and the requestor's log is what corroborates that they reached it.
 */
export interface OtaProviderExchanges {
    queryImage: OtaQueryImageExchange[];
    applyUpdate: OtaApplyUpdateExchange[];
    notifyUpdateApplied: OtaNotifyUpdateAppliedRecord[];
}

/**
 * One OTA image the controller served over BDX, and what its BDX session negotiated and moved.
 *
 * The controller answers a requestor's `ReceiveInit` here, so this is the sender's and responder's
 * own account: what it was asked for, what it granted, and how much it then sent.
 */
export interface OtaBdxTransfer {
    /** Endpoint on the controller that hosts the OTA provider which served the image. */
    providerEndpoint: number;

    /**
     * Operational node id the controller holds on the node's fabric, in the form
     * {@link ControllerAdapter.commission} answers with.
     *
     * A BDX image URI names this node as its authority, and the controller is the only side that can
     * state it: the requestor reads it out of the URI, so checking the URI against it there would be
     * checking the URI against itself. The URI's own rendering of it is the URI's business.
     */
    providerNodeId: CertNodeRef;

    /** Software version of the image staged and announced, one newer than the node reported. */
    softwareVersion: number;

    /** Size of the staged OTA file in bytes, which is the definite length the transfer carries. */
    fileSize: number;

    /** What the node proposed in the `ReceiveInit` that opened the transfer. */
    proposal: BdxTransferProposal;

    /** What the controller granted in the `ReceiveAccept` it answered with. */
    accept: BdxTransferAccept;

    /** Bytes the controller's BDX sender moved, counted by the sending flow itself. */
    transferredBytes: number;

    /**
     * Whether the node asked to apply what it downloaded and this provider allowed it, which is the
     * end of the OTA exchange as far as the node is concerned.
     *
     * A transfer can complete without it — a node may decide the image is not for it after all — so
     * this is reported rather than being a condition of serving.
     */
    applyAcknowledged: boolean;

    /**
     * The OTA commands the controller's own provider answered while serving this image.
     *
     * A copy taken when this resolved, covering this served update alone: the record is opened afresh
     * for each call, and an answer the provider gives afterwards cannot reach a case still holding
     * this one.
     */
    exchanges: OtaProviderExchanges;
}

/**
 * An answer the controller's OTA provider gives in place of the one it would compute.
 *
 * A plan step may be about a status the provider reaches only in a state the harness cannot arrange —
 * `Busy` while consent is outstanding, an `ApplyUpdateResponse` deferring the apply. The provider is
 * the DUT here, and a vendor's provider is likewise free to answer these; what the case proves is that
 * the cluster server states them the way the specification requires, and that the requestor acts on
 * them. An absent field leaves the provider's own answer standing.
 */
export interface OtaScriptedQueryAnswer {
    /** `QueryStatus` to answer with, in place of the provider's own (§ 11.20.6.6). */
    status?: number;

    /** `DelayedActionTime` in seconds, which a `Busy` answer carries. */
    delayedActionTime?: number;

    /** `UserConsentNeeded` to set on the answer the provider computed. */
    userConsentNeeded?: boolean;
}

/**
 * An `ApplyUpdateResponse` the provider is to give (§ 11.20.6.10).
 *
 * Two actions are meaningful. `AwaitNextAction` (1) the provider has no path of its own to, so it is
 * stated directly and its side effects are suppressed — the requestor's next attempt needs the image
 * it already downloaded. `Discontinue` (2) it does have a path to, so the controller withdraws the
 * update's consent and lets the provider refuse for itself, which keeps the state it is left in
 * agreeing with the answer the requestor received. Anything else leaves the provider's own answer.
 */
export interface OtaScriptedApplyAnswer {
    /** `Action`: 1 AwaitNextAction, 2 Discontinue. */
    action?: number;

    /** `DelayedActionTime` in seconds, which only a stated `AwaitNextAction` carries. */
    delayedActionTime?: number;
}

/**
 * Answers the controller's provider gives to the next commands it receives, in order.
 *
 * One entry per command; once a list is spent the provider answers for itself again, which is how a
 * case scripts the first answer and lets the real one follow.
 */
export interface OtaProviderScript {
    queryImage?: OtaScriptedQueryAnswer[];
    applyUpdate?: OtaScriptedApplyAnswer[];
}

/** Options for {@link CertNodeApi.announceOtaProvider}. */
export interface AnnounceOtaProviderOptions {
    /** How long to wait for the node's own `QueryImage` once it has been announced to. */
    timeoutMs?: number;

    /**
     * Whether the node is expected to query the announced provider. Absent, it is.
     *
     * Only the controller's own provider can be waited for, so this has no effect at all where
     * {@link provider} names another node: that node answers the query, and nothing of the exchange
     * passes through this controller. A node that never queries rejects rather than leaving the step
     * to assert over an empty record.
     */
    expectQuery?: boolean;

    /**
     * Another commissioned node to name as the provider, rather than the controller itself.
     *
     * This is the administrator's role: the controller tells a requestor where to update from, and the
     * two nodes deal with each other afterwards. The provider's endpoint is resolved from what the
     * controller holds for that node.
     */
    provider?: CertNodeRef;

    /**
     * `AnnouncementReason` to send: 0 SimpleAnnouncement, 1 UpdateAvailable, 2 UrgentUpdateAvailable.
     *
     * Absent, `UpdateAvailable`, which asks the requestor to query now. A simple announcement leaves it
     * free to wait out its own query interval, so a case waiting on the query has to say it means that.
     */
    announcementReason?: number;
}

/** The `AnnounceOTAProvider` a controller sent, as the fields it put on the wire (§ 11.20.7.6). */
export interface OtaAnnouncementRecord {
    /** `ProviderNodeID`, in the form {@link ControllerAdapter.commission} answers with. */
    providerNodeId: CertNodeRef;

    /** `VendorID`, which is the announcing controller's own `BasicInformation` value. */
    vendorId: number;

    /** `AnnouncementReason`: 0 SimpleAnnouncement, 1 UpdateAvailable, 2 UrgentUpdateAvailable. */
    announcementReason: number;

    /** `Endpoint` on the provider node that carries the OTA provider cluster. */
    endpoint: number;
}

/** What {@link CertNodeApi.announceOtaProvider} sent, and what the announced provider then answered. */
export interface OtaAnnouncement {
    announcement: OtaAnnouncementRecord;

    /**
     * What the controller's own provider answered afterwards, empty where another node was announced:
     * the requestor deals with that node directly, and nothing of the exchange passes through here.
     */
    exchanges: OtaProviderExchanges;
}

/** Options for {@link CertNodeApi.serveOtaUpdate}. */
export interface ServeOtaUpdateOptions {
    /**
     * How long the whole exchange may take — the announcement, the node's `QueryImage`, and the BDX
     * transfer that follows. Expiry rejects; there is no partial result, because a transfer that did
     * not happen is the failure a BDX case exists to catch.
     */
    timeoutMs?: number;

    /**
     * Whether the node is expected to ask to apply what it downloaded, which is the last thing it
     * needs from the provider.
     *
     * Where it will not ask, waiting for it only delays the caller: chip's `ota-requestor-app` treats
     * the download as the end of the update unless started with `--autoApplyImage`, and chip's own
     * certification material starts it without that flag for the download cases (`Test_TC_SU_3_3`).
     * Absent, the node is expected to ask.
     */
    expectApply?: boolean;

    /**
     * How long to wait for the node's `ApplyUpdateRequest` once the transfer is complete.
     *
     * The request follows the last block immediately, so the default covers the two rather than a
     * node that decided against applying. A case whose provider defers the apply names the delay it
     * asked for plus room for the exchange that follows.
     */
    applyTimeoutMs?: number;
}

/**
 * One live session a controller holds with a node.
 *
 * Held state, like {@link ClientEndpointEntry}: the controller's own view of a session it
 * established, which is the only side that can say whether the session *permits* a large payload —
 * a peer can only be observed carrying one.
 *
 * A controller may hold several sessions with one node at once, one per transport, so every claim
 * here is about the session {@link id} names. A case that reasoned about "the session" instead would
 * be answered by whichever session happened to be newest: a check for a severed session's absence
 * would pass on a sibling that was never severed, and a check for a large-payload session would fail
 * on a sibling that never claimed to be one.
 */
export interface CertSessionInfo {
    /**
     * The controller's own id for this session, unique among the sessions it holds with this node.
     *
     * This is the handle every other session operation takes: a step captures it once and names it
     * afterwards, rather than re-deriving which session it meant.
     */
    id: number;

    /** Transport beneath the session, as the controller's own channel reports it. */
    transport: "tcp" | "udp" | "ble";

    /**
     * Whether the session permits payloads larger than the IPv6 MTU — the property a case asserting
     * "the session allows large payloads" is about.
     */
    largePayload: boolean;

    /**
     * The session channel's payload ceiling, in bytes.
     *
     * A frame's own header counts against it, so the largest message a channel accepts is this less
     * that header — four bytes for TCP.
     */
    maxPayloadSize: number;
}

/**
 * What the controller's ICD Check-In client accepted from one node, in arrival order.
 *
 * A Check-In the client drops leaves no entry, so a step asserting a refusal checks that none arrived beside the
 * controller's own log.
 */
export type CertIcdEvent =
    | { kind: "checkIn"; counter: number }
    | {
          kind: "keyRefresh";

          /** The key the client re-registered with. */
          key: Uint8Array;

          /** The `ICDCounter` the node answered the re-registration with, the new key's starting value. */
          counterStart: number;
      };

/** What {@link CertIcdClientApi.register} sent, and what the node answered. */
export interface CertIcdRegistration {
    key: Uint8Array;

    /** The controller's own node id, which it sends as both `CheckInNodeID` and `MonitoredSubject`. */
    nodeId: bigint;

    icdCounter: number;
}

/**
 * The controller as the ICD Check-In client of one node.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.22
 * @see {@link MatterSpecification.v16.Core} § 9.15.1, § 9.16
 */
export interface CertIcdClientApi {
    /**
     * Sends `RegisterClient` with this controller as Check-In target and monitored subject, and resolves with what it
     * sent (the key, and its own node id as `CheckInNodeID` and `MonitoredSubject`) and the `ICDCounter` the node
     * answered.
     */
    register(options?: { allowMultiAdmin?: boolean }): Promise<CertIcdRegistration>;

    /**
     * Sends `UnregisterClient` with the controller's node id as `CheckInNodeID` and its current key as
     * `VerificationKey`. Rejects without sending anything when the controller holds no registration with the node.
     */
    unregister(): Promise<void>;

    /**
     * Sends `StayActiveRequest` asking the node to stay active for `durationMs`, and resolves with the
     * `PromisedActiveDuration` in milliseconds the node answered.
     */
    stayActive(durationMs: number): Promise<number>;

    /**
     * Ends the controller's own subscription to the node and keeps it from subscribing again. An ICD sends Check-In
     * messages only to a registered client without an active subscription, so a step waiting for one has to drop it
     * first; and a controller auto-registers with a LIT node only while subscribed.
     */
    stopSubscription(): Promise<void>;

    /** Everything recorded since the controller first handed out this client for the node. */
    events(): CertIcdEvent[];

    /**
     * Resolves with the first event of `kind` at index `from` or later in {@link events}, and that index, and rejects
     * once `timeoutMs` passes without one.
     */
    waitFor<K extends CertIcdEvent["kind"]>(
        kind: K,
        from: number,
        timeoutMs: number,
    ): Promise<{ event: Extract<CertIcdEvent, { kind: K }>; index: number }>;
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
     *
     * A concrete path the device answers with a status **rejects**, matching {@link readAttribute}; a
     * wildcard path's statuses are per-item results of the expansion and are dropped.
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

    /**
     * The endpoints the controller holds for this node, from its own state rather than from a read.
     *
     * See {@link ClientEndpointEntry} for why the distinction matters. A controller that keeps no
     * device list of its own refuses with {@link UnsupportedByControllerError}.
     */
    clientEndpoints(): Promise<ClientEndpointEntry[]>;

    /**
     * The value the controller holds for `path`, from its own state rather than from a read, and
     * `undefined` where it holds none.
     *
     * As {@link clientEndpoints}, and refused the same way.
     */
    clientAttribute(path: ClientAttributePath): Promise<unknown>;

    /**
     * Every live session the controller holds with this node, in no particular order, and empty when
     * it holds none.
     *
     * As {@link clientEndpoints}, and refused the same way — a controller that does not expose its own
     * session state throws {@link UnsupportedByControllerError}. A session the controller can no longer
     * describe (its channel already detached) is omitted rather than reported half-known.
     */
    sessions(): Promise<CertSessionInfo[]>;

    /**
     * The controller as this node's ICD Check-In client. The same object is returned for the node every time, so
     * what it recorded survives from one step to the next, until the node is commissioned anew.
     *
     * A controller that cannot act as a Check-In client throws {@link UnsupportedByControllerError}.
     */
    icdClient(): CertIcdClientApi;

    /**
     * Drop the transport connection beneath the session {@link CertSessionInfo.id} names, without
     * closing the session first, so the peer sees the connection go rather than a `CloseSession`.
     *
     * This is what "the TH closes the TCP connection" asks for: a session close would tell the peer
     * to forget the session, which is the case's own expected *outcome* and so cannot be its stimulus.
     *
     * Naming the session is what makes the operation unambiguous when the controller holds more than
     * one. A controller that cannot reach into its own sessions at all refuses with
     * {@link UnsupportedByControllerError}; being handed an id it does not hold, or one whose transport
     * has no connection to sever, is a *state* error and fails rather than refusing — a step that
     * reached either has already established something untrue about the session it captured.
     *
     * The session names the target; the *connection* is what goes. Where a transport shares one
     * connection between sessions, every session on it drops — so a case needing one session to
     * survive the sever must not assume this touches only the one it named.
     */
    severTransportConnection(sessionId: number): Promise<void>;

    /**
     * Stages an OTA image applicable to this node, announces the controller to it as an OTA provider,
     * and resolves once the node has pulled the image over BDX.
     *
     * This is what puts the controller in the BDX **sender and responder** role the BDX plans give
     * their DUT: the node opens the transfer with a `ReceiveInit` and the controller answers it. The
     * image is derived from what the controller already holds about the node — its vendor, product
     * and software version — so it is applicable by construction rather than by a constant a test
     * would have to keep in step with the subject.
     *
     * Resolves only for a transfer that completed. A node that never asked, one answered
     * `NotAvailable`, and one whose transfer stalled all reject, so a case cannot pass on an OTA
     * flow that never moved a byte.
     *
     * A controller with no OTA provider of its own refuses with {@link UnsupportedByControllerError}
     * (see {@link CertNodeApi}'s own doc for the general contract).
     */
    serveOtaUpdate(options?: ServeOtaUpdateOptions): Promise<OtaBdxTransfer>;

    /**
     * Invokes `AnnounceOTAProvider` on this node, naming the controller's own OTA provider, and
     * reports what that provider then answered.
     *
     * Unlike {@link serveOtaUpdate} this stages nothing, which is what makes it the way to observe a
     * provider with no image to offer: the node queries, and the provider answers `NotAvailable` out
     * of its own catalog rather than out of a state the case arranged.
     */
    announceOtaProvider(options?: AnnounceOtaProviderOptions): Promise<OtaAnnouncement>;

    /**
     * Has the controller's own OTA provider answer the next commands as `script` says.
     *
     * Replaces whatever a previous call installed, and an empty script clears it. The answers the
     * provider then gave are reported the same way its own are, so a step asserts on what went on the
     * wire rather than on what it asked for.
     */
    scriptOtaProvider(script: OtaProviderScript): Promise<void>;

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
 * request chip-tool has no single command for.
 *
 * Raise this before the operation has any observable effect (a commission, a write, a recorded
 * check). The step runner enforces that: a refusal reaching it before the step recorded anything is
 * a `skipped` step, counted as a coverage gap in the run summary; a refusal arriving after the step
 * recorded evidence fails and aborts the run, because the step did act and no later step can rest on
 * a device state the bundle cannot describe.
 *
 * A controller that cannot do something at all should say so in its own PICS
 * (see {@link controllerPicsOverridesFor}), which gates the step before it runs and keeps the rest of
 * the run's coverage.
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

    /**
     * What the controller itself reads out of a QR onboarding payload, so a step asserts on the
     * controller's own parse rather than on one the step performed for it. Rejects a payload the
     * controller would refuse to commission from.
     */
    parseQrPayload(code: string): Promise<OnboardingPayloadFields>;

    /**
     * {@link parseQrPayload} for the digits of a manual pairing code. Separate because the two code
     * forms carry different fields: a manual code has only the 4-bit discriminator, states no
     * discovery capabilities, and names a vendor and product only in its 21-digit form.
     *
     * How much a controller validates while reading is its own: matter.js's codec applies § 5.1's
     * rules and refuses a code it would not commission from, where chip-tool's `parse-setup-payload`
     * reports the fields of any code its parser can decode. Assert a refusal through
     * {@link commission}, which both controllers judge, rather than through this.
     */
    parseManualPairingCode(code: string): Promise<ManualPairingCodeFields>;

    node(ref: CertNodeRef): CertNodeApi;

    /**
     * Addresses a group rather than a node, for a case whose subject is the groupcast itself
     * (TC-SC-5.3 step 5). The fabric's group key set and the group's membership are established by
     * ordinary unicast commands first; this only decides how the command that follows is addressed.
     */
    group(groupId: number): CertGroupApi;

    /**
     * Present only where the adapter was built with {@link ControllerAdapterOptions.webRtcRequestor}
     * and the controller can host the cluster.
     */
    webRtcRequestor?: WebRtcRequestorApi;

    /**
     * Device attestation as this controller judges it.
     *
     * Present only where the adapter was built with {@link ControllerAdapterOptions.attestation}.
     */
    attestation?: AttestationApi;

    log: LogFollower;
}

/**
 * Controller-side view of a group, which is a destination rather than a node: a groupcast is
 * unacknowledged and carries no response, so there is nothing to read back and no status to await.
 * What a step proves about one is proved from the sender's log and from the receiver's later state.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.15.3
 */
export interface CertGroupApi {
    /**
     * Installs the key material the sender needs, which is the other half of the key set a step writes
     * to the device: a groupcast is encrypted with the group key, so a controller that only told the
     * device about the key cannot send one (Matter Core § 4.16.2).
     *
     * The plan has the controller *generate* this key, so a case provisions itself here with the same
     * key set it writes to the device.
     */
    defineKeySet(keySet: GroupKeySetSpec): Promise<void>;

    /**
     * No endpoint: a group command's path names only the cluster and command, and the endpoints it
     * reaches are the ones the group's own membership names (Matter Core § 8.2.5.1).
     */
    invoke(cluster: string | number, command: string, args?: object): Promise<void>;
}

/**
 * The fields of a `GroupKeySetStruct` a cert test provisions on both sides.
 *
 * @see {@link MatterSpecification.v16.Core} § 11.2.4.1
 */
export interface GroupKeySetSpec {
    groupKeySetId: number;
    groupKeySecurityPolicy: number;
    /** The 16-byte epoch key, as the caller's own byte type renders it. */
    epochKey0: AllowSharedBufferSource;
    epochStartTime0: bigint;
}

/**
 * An onboarding payload's fixed fields, as {@link ControllerAdapter.parseQrPayload} reports them.
 *
 * @see {@link MatterSpecification.v16.Core} § 5.1.3.1
 */
export interface OnboardingPayloadFields {
    version: number;

    /** Absent where the payload states nothing, which § 2.5.2 / § 2.5.3 write as 0. */
    vendorId?: number;
    productId?: number;

    /** 0 standard, 1 user intent, 2 custom (§ 5.1.3.1 Table 59). */
    flowType: number;

    /** § 5.1.3.1 Table 60's bitmask, as it appears on the wire. */
    discoveryCapabilities: number;

    /** The full 12-bit form; a QR payload never carries the manual code's 4-bit one. */
    discriminator: number;

    passcode: number;
}

/**
 * A manual pairing code's fields, as {@link ControllerAdapter.parseManualPairingCode} reports them.
 *
 * @see {@link MatterSpecification.v16.Core} § 5.1.4.1
 */
export interface ManualPairingCodeFields {
    /** § 5.1.4.1 Table 62's 4-bit form, the 4 most significant bits of the device's discriminator. */
    shortDiscriminator: number;

    passcode: number;

    /** Present only in the 21-digit form, which sets `VID_PID_PRESENT`. */
    vendorId?: number;
    productId?: number;
}

/**
 * How a controller reaches its peers. `"tcp"` asks for a TCP-backed session, which a large-payload
 * interaction requires; omitted, a controller keeps the transport every other TC's evidence and
 * timing were written against.
 */
export type ControllerTransport = "tcp";

/** What a test asks of the controller before it starts. */
export interface ControllerAdapterOptions {
    transport?: ControllerTransport;

    /**
     * Hosts a WebRTC transport requestor cluster on the controller, which a case whose peer initiates
     * signaling needs: a provider answers a solicited offer by invoking `Offer` back on the
     * controller, and a controller with no requestor cluster has nowhere for that command to land.
     *
     * Off by default. The cluster accepts signaling only for sessions the case registered through
     * {@link WebRtcRequestorApi.upsertSession}, so a controller that hosts it still refuses everything
     * until a case says otherwise.
     *
     * @see {@link MatterSpecification.v16.Device} § 16.8
     */
    webRtcRequestor?: boolean;

    /**
     * Judges device attestation against a trust store and whatever revocation information the case
     * installs, rather than accepting what a test device presents.
     *
     * Off by default, because a cert device presents test certificates that a commissioner holding a
     * production trust policy has to refuse. With it on, the controller trusts the chip test roots and
     * nothing else, so an attestation a case expects to be refused is refused for the reason the case
     * is about.
     *
     * @see {@link MatterSpecification.v16.Core} § 6.2.3.1
     */
    attestation?: boolean;
}

/** What a case can tell a controller about the certificates it will be shown. */
export interface AttestationApi {
    /**
     * Gives the controller revocation information, as a revocation set in the format the CHIP SDK's
     * revocation-set tool writes.
     *
     * A commissioner normally reads revocation from the DCL. A certification run is against a PKI the
     * DCL does not publish, so the set has to come from the case.
     *
     * @see {@link MatterSpecification.v16.Core} § 6.2.6.2
     */
    installRevocations(revocationSet: string): Promise<void>;
}

/**
 * A WebRTC session as the requestor cluster tracks it. A session's id is minted by the provider, so a
 * case learns it from the provider's own `SolicitOffer`/`ProvideOffer` response and registers it here
 * before the provider signals against it.
 *
 * @see {@link MatterSpecification.v16.Cluster} § 11.4.5.5
 */
export interface WebRtcSessionSpec {
    id: number;

    /** The provider, as {@link ControllerAdapter.commission} named it. */
    peer: CertNodeRef;

    /** The endpoint of the provider cluster the session was solicited from. */
    peerEndpointId: number;

    streamUsage: number;
    videoStreamId?: number | null;
    audioStreamId?: number | null;

    /** Defaults to false, which is what a session carrying no metadata stream states. */
    metadataEnabled?: boolean;
}

/** A session the requestor cluster tracks, as it holds it. */
export interface WebRtcSessionRecord {
    id: number;
    videoStreamId: number | null;
    audioStreamId: number | null;
}

/**
 * An ICE candidate as the provider stated it, per RFC 8839's candidate-attribute.
 *
 * @see {@link MatterSpecification.v16.Cluster} § 11.4.5.4
 */
export interface WebRtcIceCandidate {
    candidate: string;
    sdpMid: string | null;
    sdpmLineIndex: number | null;
}

/** One signaling command the provider addressed at the controller's requestor cluster. */
export interface WebRtcSignalRecord {
    kind: "offer" | "answer" | "iceCandidates" | "end";

    /** The session id the provider named, which for a refusal is an id the controller does not track. */
    sessionId: number;

    /**
     * `"refused"` where the controller answered `NotFound` because it tracks no such session for this
     * peer and fabric. A case proving that refusal reads the id off this record rather than off the
     * peer's own log, which states the status without the id.
     *
     * Signaling refused before it reaches the cluster — a command whose fields break their own
     * constraints — is not recorded at all, so a case about one reads the controller's log instead.
     */
    outcome: "accepted" | "refused";

    /** Monotonic, for ordering records against each other rather than against wall-clock time. */
    at: number;

    /** The session description an accepted `offer` or `answer` carried, which a case feeds to its own peer connection. */
    sdp?: string;

    /** What an accepted `iceCandidates` carried. */
    candidates?: readonly WebRtcIceCandidate[];
}

/**
 * The controller's requestor-side view of WebRTC signaling, present when the adapter was built with
 * {@link ControllerAdapterOptions.webRtcRequestor}.
 */
export interface WebRtcRequestorApi {
    /** Endpoint the requestor cluster lives on, which a solicitation states as its originating endpoint. */
    readonly endpoint: number;

    /**
     * Registers a session the case has established with a provider, so the provider's later signaling
     * for that id is accepted. Re-registering an id replaces the entry.
     */
    upsertSession(session: WebRtcSessionSpec): Promise<void>;

    /** Stops tracking a session. No-op where the id is unknown. */
    removeSession(id: number): Promise<void>;

    /** The sessions the cluster tracks, which is what a refusal was judged against. */
    sessions(): Promise<readonly WebRtcSessionRecord[]>;

    /** Every signaling command the provider addressed here since {@link ControllerAdapter.start}, in arrival order. */
    signals(): readonly WebRtcSignalRecord[];

    /**
     * Resolves with the first signal matching `predicate`, or `undefined` where none arrives within
     * `timeoutMs`. Signals already recorded are matched too, so a case that registers a session and
     * then waits does not race the provider.
     */
    nextSignal(
        predicate: (signal: WebRtcSignalRecord) => boolean,
        timeoutMs: number,
    ): Promise<WebRtcSignalRecord | undefined>;
}

/**
 * Builds a {@link ControllerAdapter} for the given id (e.g. "dut", "th_cr2").
 */
export type ControllerAdapterFactory = (id: string, options?: ControllerAdapterOptions) => ControllerAdapter;

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
export function createControllerAdapter(role: string, options?: ControllerAdapterOptions): ControllerAdapter {
    const implementation = resolveControllerImplementation();
    const factory = factories.get(implementation);
    if (!factory) {
        throw new Error(
            `No ControllerAdapter factory registered for "${implementation}"; a consumer (e.g. ` +
                "support/chip-testing/src/cert/index.ts) must call registerControllerAdapterFactory() for it " +
                "before running a cert test",
        );
    }
    return factory(role, options);
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
