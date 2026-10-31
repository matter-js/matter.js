/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DecodedPacket } from "#codec/MessageCodec.js";
import { SupportedTransportsSchema } from "#common/SupportedTransportsBitmap.js";
import { FabricManager } from "#fabric/FabricManager.js";
import type { Subscription } from "#interaction/Subscription.js";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { PeerAddressStore } from "#peer/PeerAddressStore.js";
import { PeerShutdownError } from "#peer/PeerCommunicationError.js";
import { PeerLossContext } from "#peer/PeerLossContext.js";
import { SessionClosedError } from "#protocol/errors.js";
import { GroupMessageRejection, GroupSession, GroupSessionDecodeError } from "#session/GroupSession.js";
import {
    Diagnostic,
    BasicSet,
    Bytes,
    Channel,
    ClosedError,
    Construction,
    Crypto,
    Duration,
    Environment,
    Environmental,
    hex,
    ImplementationError,
    InternalError,
    Lifecycle,
    Logger,
    MatterAggregateError,
    MatterFlowError,
    Millis,
    Mutex,
    Observable,
    ObserverGroup,
    StorageContext,
    StorageManager,
    Time,
    Timestamp,
    toHex,
    Transport,
    UnexpectedDataError,
} from "@matter/general";
import { CaseAuthenticatedTag, ClusterId, EndpointNumber, FabricId, FabricIndex, GroupId, NodeId } from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";
import type { ExposedFabricInformation, Fabric } from "../fabric/Fabric.js";
import { MessageCounter, PersistedMessageCounter } from "../protocol/MessageCounter.js";
import { NodeSession } from "./NodeSession.js";
import { SecureSession } from "./SecureSession.js";
import { Session } from "./Session.js";
import { SessionIntervals } from "./SessionIntervals.js";
import { SessionParameters } from "./SessionParameters.js";
import { UnsecuredSession } from "./UnsecuredSession.js";

/**
 * Reject a locally-configured Session Active Threshold that cannot be encoded: SAT is a uint16 millisecond value on the
 * wire. SII/SAI are uint32 and intentionally not bounded here.
 */
function assertActiveThreshold(activeThreshold: Duration) {
    if (activeThreshold > SessionIntervals.maxActiveThreshold) {
        throw new ImplementationError(
            `Session Active Threshold ${activeThreshold}ms exceeds the maximum of ${SessionIntervals.maxActiveThreshold}ms`,
        );
    }
}

/**
 * Reject a locally-configured MaxPathsPerInvoke that is not a whole count of at least one. The setter installs the
 * value we advertise without normalizing it, and a fractional count encodes truncated while our own limit keeps the
 * remainder.
 */
function assertMaxPathsPerInvoke(maxPathsPerInvoke: number) {
    if (!Number.isInteger(maxPathsPerInvoke) || maxPathsPerInvoke < 1) {
        throw new ImplementationError(
            `Max Paths Per Invoke of ${maxPathsPerInvoke} is not a whole number of at least 1`,
        );
    }
}

/** Resumption record without a fabric reference but relevant lookup data used internally in SessionManager */
interface InternalResumptionRecord {
    sharedSecret: Bytes;
    resumptionId: Bytes;
    fabricId: FabricId;
    fabricIndex: FabricIndex;
    peerNodeId: NodeId;
    sessionParameters: SessionParameters;
    caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];
}

/** Resumption record with Fabric reference. */
export interface ResumptionRecord extends Omit<InternalResumptionRecord, "fabricId" | "fabricIndex"> {
    fabric: Fabric;
}

type ResumptionStorageRecord = {
    sharedSecret: Bytes;
    resumptionId: Bytes;
    fabricId: FabricId;
    fabricIndex: FabricIndex;
    peerNodeId: NodeId;
    sessionParameters: {
        idleInterval: Duration;
        activeInterval: Duration;
        activeThreshold: Duration;
        dataModelRevision: number;
        interactionModelRevision: number;
        specificationVersion: number;
        maxPathsPerInvoke: number;
        supportedTransports?: number;
        maxTcpMessageSize?: number;
    };
    caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];
};

/**
 * Records as stored in one array under {@link LEGACY_RESUMPTION_RECORDS_KEY}; `nodeId` always equals `peerNodeId`.
 * Records written before 0.15.5 have no `fabricIndex`.
 */
type LegacyResumptionStorageRecord = Omit<ResumptionStorageRecord, "fabricIndex"> & {
    nodeId: NodeId;
    fabricIndex?: FabricIndex;
};

export interface ActiveSessionInformation {
    name: string;
    nodeId: NodeId;
    peerNodeId: NodeId;
    fabric?: ExposedFabricInformation;
    isPeerActive: boolean;
    secure: boolean;
    lastInteractionTimestamp?: number;
    lastActiveTimestamp?: number;
    numberOfActiveSubscriptions: number;
}

interface GroupMessageEventBase {
    sourceIp?: string;
}

/** A received group message that a key of {@link fabric} authenticated. */
export interface GroupMessageAuthenticatedInfo extends GroupMessageEventBase {
    kind: "authenticated";

    /** FailedAuth here means GroupKeyMap or the key set changed between decode and dispatch. */
    result: Groupcast.GroupcastTestResult;
    fabric: Fabric;
    groupId?: GroupId;
    endpointId?: EndpointNumber;
    clusterId?: ClusterId;
    elementId?: number;

    /** Whether the ACL granted access for the dispatched command (only set for Success). */
    accessAllowed?: boolean;
}

/** A received group message for which no candidate key passed, see {@link GroupMessageRejection}. */
export interface GroupMessageUnauthenticatedInfo extends GroupMessageEventBase, GroupMessageRejection {
    kind: "unauthenticated";
}

/**
 * Metadata about a received group message, emitted via {@link SessionManager.onGroupMessage} for Groupcast testing.
 * An unauthenticated message names no fabric to report on; {@link GroupMessageRejection.resultFor} gives its result.
 */
export type GroupMessageEventInfo = GroupMessageAuthenticatedInfo | GroupMessageUnauthenticatedInfo;

/**
 * Interfaces {@link SessionManager} with other components.
 */
export interface SessionManagerContext {
    fabrics: FabricManager;
    storage: StorageContext;

    /**
     * Where this manager's log messages come from, so a destination can attribute the ones it emits from a timer or
     * transport callback, which carries no call stack of its own.
     */
    origin?: Diagnostic.Origin;

    /**
     * Parameter overrides.
     */
    parameters?: SessionParameters.Config;

    /**
     * This is an arbitrary contextual object attached to sessions used for compatibility with legacy APIs.
     *
     * @deprecated Scheduled for removal in 0.19 with the legacy controller API.
     */
    owner?: unknown;
}

const ID_SPACE_UPPER_BOUND = 0xffff;

/**
 * Sessions retained per peer.  A new CASE does not close the peer's previous sessions, so a peer that reconnects
 * repeatedly accumulates them.  Per peer rather than global so one noisy peer cannot evict another's.
 */
const MAX_SESSIONS_PER_PEER = 5;

/** Sub-context of the session storage context that holds one resumption record per peer. */
const RESUMPTION_RECORDS_CONTEXT = "resumption";

/** Key of the single array that held all resumption records before they were stored per peer. */
const LEGACY_RESUMPTION_RECORDS_KEY = "resumptionRecords";

/** Storage key for the node-global Group Encrypted Data Message Counter in the session storage context. */
const GROUP_DATA_COUNTER_KEY = "groupDataCounter";

/**
 * Reserve block size for the persisted group data counter; matches CHIP `GROUP_MSG_COUNTER_MIN_INCREMENT`. The counter
 * is persisted this far ahead so an unclean restart never rolls it back.
 * @see {@link MatterSpecification.v161.Core} § 4.6.1.3
 */
const GROUP_DATA_COUNTER_RESERVE = 1000;

/** Thrown into a session closed because its peer exceeded {@link MAX_SESSIONS_PER_PEER}. */
export class SessionEvictedError extends ClosedError {
    constructor(message = "Session evicted; peer holds too many sessions", options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * Thrown when communication terminates due to node shutdown.
 */
export class ShutdownError extends ClosedError {
    constructor(message = "Local node shutdown", options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * Manages Matter sessions associated with peer connections.
 */
export class SessionManager {
    readonly #logger: Logger;
    readonly #context: SessionManagerContext;
    readonly #unsecuredSessions = new Map<NodeId, UnsecuredSession>();
    readonly #sessions = new BasicSet<NodeSession>();
    readonly #groupSessions = new Map<NodeId, BasicSet<GroupSession>>();
    #nextSessionId: number;
    readonly #resumptionRecords = new PeerAddressMap<InternalResumptionRecord>();
    readonly #resumptionRecordsById = new Map<string, InternalResumptionRecord>();
    readonly #resumptionStore: PeerAddressStore<ResumptionStorageRecord>;
    readonly #globalUnencryptedMessageCounter;
    #groupDataMessageCounter!: PersistedMessageCounter;
    #sessionParameters: SessionParameters;

    /**
     * Additive MRP retransmission margin for our own (sender-side) network.  Derived from the
     * configured "own" network profile; defaults to 0 (treated as a low-latency local network).
     */
    localAdditionalMrpDelay: Duration = Millis(0);

    /**
     * Fixed sender-side MRP backoff pad added after the exponential backoff (so it is not amplified).
     * Used to mirror an ICD server's fast-polling-interval grace; defaults to 0.
     */
    localFixedMrpBackoff: Duration = Millis(0);
    readonly #construction: Construction<SessionManager>;
    readonly #observers = new ObserverGroup();
    readonly #subscriptionUpdateMutex = new Mutex(this);
    readonly #sessionEvictionMutex = new Mutex(this);
    #idUpperBound = ID_SPACE_UPPER_BOUND;

    readonly #subscriptionsChanged = Observable<[session: NodeSession, subscription: Subscription]>();
    readonly #retry = Observable<[session: Session, number: number]>();
    readonly #onGroupMessage = Observable<[info: GroupMessageEventInfo]>();

    constructor(context: SessionManagerContext) {
        this.#context = context;
        this.#logger = Logger.get("SessionManager", context.origin);
        this.#resumptionStore = new PeerAddressStore(context.storage.createContext(RESUMPTION_RECORDS_CONTEXT));
        const {
            fabrics: { crypto },
        } = context;
        if (context.parameters?.maxPathsPerInvoke !== undefined) {
            assertMaxPathsPerInvoke(context.parameters.maxPathsPerInvoke);
        }
        if (context.parameters?.maxTcpMessageSize !== undefined) {
            SessionParameters.assertMaxTcpMessageSize(context.parameters.maxTcpMessageSize);
        }
        this.#sessionParameters = SessionParameters({ ...SessionParameters.defaults, ...context.parameters });
        assertActiveThreshold(this.#sessionParameters.activeThreshold);
        this.#nextSessionId = (crypto.randomUint16 % ID_SPACE_UPPER_BOUND) + 1;
        this.#globalUnencryptedMessageCounter = new MessageCounter(crypto);

        // When fabric is removed, also remove the resumption record
        this.#observers.on(context.fabrics.events.deleting, async fabric => {
            await this.deleteResumptionRecordsForFabric(fabric);
        });

        this.#sessions.added.on(session => {
            // We are the responder, so nothing else reclaims these: an initiator's sessions are swept by the peer
            // loss its own traffic reports
            if (!session.isInitiator) {
                this.#sessionEvictionMutex.run(() => this.#evictExcessSessionsFor(session));
            }
        });

        // Add subscription monitors to new node sessions
        this.#sessions.added.on(session => {
            const subscriptionsChanged = (subscription: Subscription) => {
                if (session.isClosing) {
                    return;
                }

                this.#subscriptionsChanged.emit(session, subscription);
            };

            session.subscriptions.added.on(subscriptionsChanged);
            session.subscriptions.deleted.on(subscriptionsChanged);

            session.closing.once(() => {
                session.subscriptions.added.off(subscriptionsChanged);
                session.subscriptions.deleted.off(subscriptionsChanged);
            });
        });

        this.#construction = Construction(this, () => this.#initialize());
    }

    static [Environmental.create](env: Environment) {
        const instance = new SessionManager({
            storage: env.get(StorageManager).createContext("sessions"),
            fabrics: env.get(FabricManager),
            origin: env.logOrigin,
        });
        env.set(SessionManager, instance);
        return instance;
    }

    get construction() {
        return this.#construction;
    }

    get context() {
        return this.#context;
    }

    get crypto() {
        return this.#context.fabrics.crypto;
    }

    /**
     * The single node-global Group Encrypted Data Message Counter shared by all group sessions.
     * @see {@link MatterSpecification.v161.Core} § 4.6.1.3
     */
    get groupDataMessageCounter() {
        this.#construction.assert();
        return this.#groupDataMessageCounter;
    }

    /**
     * Active secure sessions.
     */
    get sessions() {
        return this.#sessions;
    }

    /**
     * Active unsecured sessions.
     */
    get unsecuredSessions() {
        return this.#unsecuredSessions;
    }

    /**
     * Our session parameters.  These are the parameters we provide during session negotiation.  The peer may specify
     * different parameters.
     */
    get sessionParameters(): SessionParameters {
        const { supportedTransports, maxTcpMessageSize } = this.#sessionParameters;
        const tcpSupported = supportedTransports.tcpClient || supportedTransports.tcpServer;
        return {
            ...this.#sessionParameters,
            // The MAX_TCP_MESSAGE_SIZE field SHALL only be present if the SUPPORTED_TRANSPORTS field
            // indicates that TCP is supported.
            maxTcpMessageSize: tcpSupported ? maxTcpMessageSize : undefined,
        };
    }

    /**
     * Change session parameters.
     *
     * Parameters values you omit in {@link parameters} will retain their current values.  This only affects new
     * sessions.
     */
    set sessionParameters(parameters: Partial<SessionParameters>) {
        if (parameters.activeThreshold !== undefined) {
            assertActiveThreshold(parameters.activeThreshold);
        }
        if (parameters.maxPathsPerInvoke !== undefined) {
            assertMaxPathsPerInvoke(parameters.maxPathsPerInvoke);
        }
        if (parameters.maxTcpMessageSize !== undefined) {
            SessionParameters.assertMaxTcpMessageSize(parameters.maxTcpMessageSize);
        }
        for (const [key, value] of Object.entries(parameters)) {
            if (value !== undefined) {
                (this.#sessionParameters as Record<string, unknown>)[key] = value;
            }
        }
    }

    /**
     * Emits when there is a change to the subscription set.
     */
    get subscriptionsChanged() {
        return this.#subscriptionsChanged;
    }

    /**
     * Emits when resubmission is necessary due to timeout or network error.
     */
    get retry() {
        return this.#retry;
    }

    /**
     * Emits for a received group message whose keys are tried: when no candidate key passes, when the message is a
     * replay, and when the Interaction Model processes a group invoke request.  A datagram the codec refuses and a
     * message with the R or A flag emit nothing.  Any other message, such as a group write or a message for an
     * unsupported protocol, emits only MessageReplay for a replayed copy.  Observers remain inactive until at least one
     * listener attaches, so fabrics not under test incur no emission overhead.
     */
    get onGroupMessage() {
        return this.#onGroupMessage;
    }

    /**
     * Convenience function for accessing a fabric by address.
     */
    fabricFor(address: FabricIndex | PeerAddress) {
        return this.#context.fabrics.for(address);
    }

    /** The fabric of {@link fabricIndex}, or undefined while it does not exist or is being removed. */
    maybeFabricFor(fabricIndex: FabricIndex) {
        return this.#context.fabrics.maybeFor(fabricIndex);
    }

    /**
     * @deprecated Scheduled for removal in 0.19 with the legacy controller API.
     */
    get owner() {
        return this.#context.owner;
    }

    createUnsecuredSession(options: {
        channel: Channel<Bytes>;
        initiatorNodeId?: NodeId;
        sessionParameters?: SessionParameters.Config;
        isInitiator?: boolean;
    }) {
        this.#construction.assert();

        const { channel, initiatorNodeId, sessionParameters, isInitiator } = options;
        if (initiatorNodeId !== undefined) {
            if (this.#unsecuredSessions.has(initiatorNodeId)) {
                throw new MatterFlowError(`UnsecuredSession with NodeId ${initiatorNodeId} already exists`);
            }
        }

        let tries = 0;
        while (true) {
            const session = new UnsecuredSession({
                crypto: this.#context.fabrics.crypto,
                manager: this,
                channel,
                messageCounter: this.#globalUnencryptedMessageCounter,
                initiatorNodeId,
                sessionParameters,
                isInitiator: isInitiator ?? false,
            });

            const ephemeralNodeId = session.nodeId;
            if (this.#unsecuredSessions.has(ephemeralNodeId)) {
                if (++tries > 4) {
                    throw new InternalError("Unable to allocate unique ephemeral node ID; entropy source is broken");
                }

                continue;
            }

            this.#unsecuredSessions.set(ephemeralNodeId, session);
            session.activate();
            return session;
        }
    }

    async createSecureSession(config: Omit<NodeSession.CreateConfig, "crypto"> & { crypto?: Crypto }) {
        return await NodeSession.create({
            crypto: this.crypto,
            ...config,
            manager: this,
        });
    }

    /**
     * Deletes a resumption record for a given address.  Returns true if the record was deleted, false if it did not
     * exist.
     */
    async deleteResumptionRecord(address: PeerAddress) {
        await this.#construction;

        const result = this.#forgetResumptionRecord(address);
        if (result) {
            await this.#resumptionStore.delete(address);
        }
        return result;
    }

    /**
     * Deletes all resumption records for a given fabric.  Returns true if any records were deleted, false if none
     * existed.
     */
    async deleteResumptionRecordsForFabric(fabric: Fabric) {
        await this.#construction;

        let deletedCount = 0;
        for (const address of [...this.#resumptionRecords.keys()]) {
            if (address.fabricIndex === fabric.fabricIndex && this.#forgetResumptionRecord(address)) {
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            await this.#resumptionStore.deleteFabric(fabric.fabricIndex);
        }
        return deletedCount > 0;
    }

    /** The session with the least recent traffic among those {@link filter} accepts, if any. */
    #leastRecentlyUsedSession(filter: (session: NodeSession) => boolean) {
        let oldest: NodeSession | undefined;
        for (const session of this.#sessions) {
            if (filter(session) && (oldest === undefined || session.timestamp < oldest.timestamp)) {
                oldest = session;
            }
        }
        return oldest;
    }

    findOldestInactiveSession() {
        this.#construction.assert();

        const oldest = this.#leastRecentlyUsedSession(() => true);
        if (oldest === undefined) {
            throw new MatterFlowError("No session found to close and all session ids are taken.");
        }
        return oldest;
    }

    /**
     * Allocates a local ID for a new secure unicast session, PASE or CASE.  The ID is never 0 because 0 identifies the
     * unsecured session.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.4.1.3.4
     * @see {@link MatterSpecification.v161.Core} § 4.13.2.4
     */
    async getNextAvailableSessionId() {
        await this.#construction;

        for (let i = 0; i < this.#idUpperBound; i++) {
            const id = this.#takeSessionId();
            if (this.getSession(id) === undefined) {
                return id;
            }
        }

        // All session ids are taken, search for the oldest unused session, and close it and re-use its ID
        const oldestSession = this.findOldestInactiveSession();

        await oldestSession.initiateClose(async () => {
            await oldestSession.closeSubscriptions(true);
        });
        this.#nextSessionId = oldestSession.id;
        return this.#takeSessionId();
    }

    /** Returns the next candidate ID and advances the cursor, cycling through 1..{@link #idUpperBound}. */
    #takeSessionId() {
        const id = this.#nextSessionId;
        this.#nextSessionId = (id % this.#idUpperBound) + 1;
        return id;
    }

    getSession(sessionId: number) {
        this.#construction.assert();

        return this.#sessions.get("id", sessionId);
    }

    getPaseSession() {
        this.#construction.assert();

        return [...this.#sessions].find(session => NodeSession.is(session) && session.isPase && !session.isClosing);
    }

    forFabric(fabric: Fabric) {
        this.#construction.assert();

        return [...this.#sessions].filter(
            session =>
                NodeSession.is(session) && session.isSecure && session.fabric?.fabricIndex === fabric.fabricIndex,
        );
    }

    sessionFor(peer: PeerAddress) {
        const session = this.maybeSessionFor(peer);
        if (session) {
            return session;
        }

        throw new SessionClosedError(`Not currently connected to ${PeerAddress(peer)}`);
    }

    maybeSessionFor(address: PeerAddress) {
        this.#construction.assert();

        // Prefer the most recently active session (i.e. the one we last heard from the peer on).  Older ones may not
        // work with broken peers (e.g. CHIP test harness).
        let found: NodeSession | undefined;
        for (const session of this.#sessions) {
            if (!session.peerIs(address) || session.isClosing || session.isPeerLost) {
                continue;
            }

            if (!found || found.activeTimestamp < session.activeTimestamp) {
                found = session;
            }
        }

        return found;
    }

    sessionsFor(address: PeerAddress) {
        address = PeerAddress(address);
        return this.#sessions.filter(session => session.peerAddress === address && !session.isClosing);
    }

    sessionsForFabricIndex(fabricIndex: FabricIndex) {
        return this.#sessions.filter(session => session.fabric?.fabricIndex === fabricIndex);
    }

    /**
     * Removes all Peer sessions without first closing the subscriptions the peer holds on them; those end when the
     * sessions close.  Our own subscriptions to the peer belong to the peer, not to a session, so a peer that persists
     * subscriptions can refresh them after its restart.
     *
     * @param asOf sessions created at or after this instant are kept; on the clock of {@link Time.nowUs} like
     * {@link Session.createdAt}, not a wall-clock time.  Defaults to now.
     */
    handlePeerShutdown(address: PeerAddress, asOf?: Timestamp) {
        return this.#handlePeerLoss({
            address,
            cause: new PeerShutdownError(),
            asOf: asOf ?? Time.nowUs,
            keepSubscriptions: true,
        });
    }

    /**
     * Removes all Peer sessions and closes subscriptions.
     */
    async handlePeerLoss(address: PeerAddress, context: PeerLossContext) {
        return await this.#handlePeerLoss({ ...context, address, asOf: context.asOf ?? Time.nowUs });
    }

    /**
     * Close the peer's least recently active sessions once it exceeds {@link MAX_SESSIONS_PER_PEER}.
     *
     * Only sessions the peer established are eligible: ones we initiated are ours to manage, and the peer loss our
     * own traffic reports already sweeps them.  {@link added} is excluded so a burst of new sessions cannot evict the
     * one that prompted the check.
     */
    async #evictExcessSessionsFor(added: NodeSession) {
        if (added.isPase || added.isClosing) {
            return;
        }

        const address = added.peerAddress;
        const claimsSlot = (session: NodeSession) =>
            session !== added && !session.isInitiator && session.peerIs(address);

        // A session already closing still occupies a slot until it completes, so it counts here but is not evicted
        // again -- otherwise one that parks in deferredClose drops out of the count and the cap stops capping
        let excess = this.#sessions.filter(claimsSlot).length + 1 - MAX_SESSIONS_PER_PEER;

        while (excess-- > 0) {
            const session = this.#leastRecentlyUsedSession(s => claimsSlot(s) && !s.isClosing);
            if (session === undefined) {
                return;
            }

            this.#logger.info(
                session.via,
                `Closing least recently used session; ${PeerAddress(address)} exceeds ${MAX_SESSIONS_PER_PEER} sessions`,
            );

            // Force close rather than the graceful path: that sends CloseSession over MRP, and the eviction target is
            // typically the peer we can no longer reach, so it would hold this mutex for a full retransmission window
            await session.initiateForceClose({ cause: new SessionEvictedError() });
        }
    }

    async #handlePeerLoss(
        context: {
            address: PeerAddress;
        } & PeerLossContext,
    ) {
        await this.#construction;

        const { address, asOf } = context;
        for (const session of this.#sessions) {
            if (!session.peerIs(address)) {
                continue;
            }

            if (asOf !== undefined && session.createdAt >= asOf) {
                continue;
            }

            await session.handlePeerLoss(context);
        }
    }

    getUnsecuredSession(sourceNodeId?: NodeId) {
        this.#construction.assert();

        if (sourceNodeId === undefined) {
            return this.#unsecuredSessions.get(NodeId.UNSPECIFIED_NODE_ID);
        }
        return this.#unsecuredSessions.get(sourceNodeId);
    }

    /**
     * Obtain an outbound group session for a specific group.
     *
     * Returns the session for the current group epoch key.  The source is this node and the peer is the group.
     */
    async groupSessionForAddress(address: PeerAddress, transports: Transport.Provider) {
        this.#construction.assert();
        const groupId = GroupId.fromNodeId(address.nodeId);
        GroupId.assertGroupId(groupId);

        const fabric = this.fabricFor(address);
        const { key, keySetId, sessionId } = fabric.groups.currentKeyForGroup(groupId);
        if (sessionId === undefined || key === undefined) {
            throw new UnexpectedDataError(
                `No group session data found for group ${groupId} in fabric ${fabric.fabricId}.`,
            );
        }

        // Outbound sessions register under their group node id (see registerGroupSession), so look up the same bucket
        // and match by key: a session id can be shared by multiple keys, so reuse must verify the operational key.
        const session = this.#groupSessions
            .get(address.nodeId)
            ?.find(s => s.matches(fabric.fabricIndex, sessionId, key));
        if (session) {
            return session;
        }

        return await GroupSession.create({
            transports,
            manager: this,
            id: sessionId,
            fabric,
            keySetId,
            operationalGroupKey: key,
            groupNodeId: address.nodeId,
            messageCounter: this.#groupDataMessageCounter,
        });
    }

    /**
     * Obtain a Group session for an incoming packet, with the decoded message and the facts decode established.
     *
     * The session ID is determined by decrypting the packet with possible keys.  Returns `undefined` when no candidate
     * key passes; the message is then reported via {@link onGroupMessage} and must be dropped.  Also returns
     * `undefined`, without a report, for a group data message with the R or A flag.
     *
     * Note that the resulting session is non-operational in the sense that attempting outbound communication will
     * result in an error.
     */
    groupSessionFromPacket(packet: DecodedPacket, aad: Bytes, sourceIp?: string) {
        this.#construction.assert();
        let decoded;
        try {
            decoded = GroupSession.decodeWithCandidateKeys(this.#context.fabrics, packet, aad);
        } catch (error) {
            GroupSessionDecodeError.accept(error);
            const { candidateFabrics, group } = error;
            this.#logger.debug(
                `Dropping group message for session ${Session.idStrOf(packet)} from ${sourceIp ?? "unknown address"}:`,
                error.message,
                Diagnostic.dict({ candidateFabrics: candidateFabrics.size }),
            );
            this.#onGroupMessage.emit({ kind: "unauthenticated", candidateFabrics, group, sourceIp });
            return undefined;
        }

        const { message, key, privacyKey, sessionId, sourceNodeId, groupId, keySetId, fabric } = decoded;

        // Spec 4.12.5.2 step 1: drop a group data message with the R or A flag; the codec refuses control messages.
        // As CHIP does for the R flag, this runs before counter processing, though spec 4.7.2 orders the counter first
        const { requiresAck, ackedMessageId } = message.payloadHeader;
        if (requiresAck || ackedMessageId !== undefined) {
            this.#logger.debug(
                `Dropping group message ${hex.fixed(message.packetHeader.messageId, 8)} for session ${Session.idStrOf(packet)} with the ${requiresAck ? "R" : "A"} flag`,
            );
            return undefined;
        }

        let session = this.#groupSessions.get(sourceNodeId)?.find(s => s.matches(fabric.fabricIndex, sessionId, key));
        if (session === undefined) {
            session = new GroupSession({
                manager: this,
                id: sessionId,
                fabric,
                keySetId,
                operationalGroupKey: key,
                operationalPrivacyKey: privacyKey,
                peerNodeId: sourceNodeId,
                multicastAddress: fabric.groups.multicastAddressFor(groupId),
                messageCounter: this.#groupDataMessageCounter,
            });
        }

        return { session, message, key, sourceNodeId, groupId };
    }

    /** Report an authenticated group message (used by ExchangeManager for replay and InteractionServer for dispatch). */
    emitGroupMessage(info: GroupMessageAuthenticatedInfo) {
        this.#onGroupMessage.emit(info);
    }

    registerGroupSession(session: GroupSession) {
        const sourceNodeId = session.peerNodeId;
        const peerSessions = this.#groupSessions.get(sourceNodeId) ?? new BasicSet();
        peerSessions.add(session);
        this.#groupSessions.set(sourceNodeId, peerSessions);
    }

    removeGroupSession(session: GroupSession) {
        const sourceNodeId = session.peerNodeId;
        const peerSessions = this.#groupSessions.get(sourceNodeId);
        if (peerSessions) {
            peerSessions.delete(session);
            if (peerSessions.size === 0) {
                this.#groupSessions.delete(sourceNodeId);
            }
        }
    }

    #asExposedResumptionRecord(record: InternalResumptionRecord): ResumptionRecord {
        return { ...record, fabric: this.#fabricForId(record.fabricId, record.fabricIndex) };
    }

    findResumptionRecordById(resumptionId: Bytes) {
        this.#construction.assert();
        const record = this.#resumptionRecordsById.get(Bytes.toHex(resumptionId));
        if (record !== undefined) {
            return this.#asExposedResumptionRecord(record);
        }
    }

    findResumptionRecordByAddress(address: PeerAddress) {
        this.#construction.assert();
        const record = this.#resumptionRecords.get(address);
        if (record !== undefined) {
            return this.#asExposedResumptionRecord(record);
        }
    }

    async saveResumptionRecord(resumptionRecord: ResumptionRecord) {
        await this.#construction;
        const { fabric, ...rest } = resumptionRecord;

        const record = {
            ...rest,
            fabricId: fabric.fabricId,
            fabricIndex: fabric.fabricIndex,
        };
        const address = fabric.addressOf(resumptionRecord.peerNodeId);
        this.#rememberResumptionRecord(address, record);
        await this.#resumptionStore.set(address, storageRecordOf(record));
    }

    #rememberResumptionRecord(address: PeerAddress, record: InternalResumptionRecord) {
        this.#forgetResumptionRecord(address);
        this.#resumptionRecords.set(address, record);
        this.#resumptionRecordsById.set(Bytes.toHex(record.resumptionId), record);
    }

    #forgetAllResumptionRecords() {
        this.#resumptionRecords.clear();
        this.#resumptionRecordsById.clear();
    }

    #forgetResumptionRecord(address: PeerAddress) {
        const record = this.#resumptionRecords.get(address);
        if (record === undefined) {
            return false;
        }
        this.#resumptionRecords.delete(address);
        this.#resumptionRecordsById.delete(Bytes.toHex(record.resumptionId));
        return true;
    }

    #maybeFabricForId(fabricId: FabricId, fabricIndex?: FabricIndex) {
        return this.#context.fabrics.find(
            fabric =>
                fabric.fabricId === fabricId &&
                // Backward compatibility logic: fabricIndex was added later (0.15.5), so it might be undefined in older records
                (fabricIndex === undefined || fabric.fabricIndex === fabricIndex),
        );
    }

    #fabricForId(fabricId: FabricId, fabricIndex?: FabricIndex) {
        const fabric = this.#maybeFabricForId(fabricId, fabricIndex);
        if (fabric === undefined) {
            throw new InternalError(`Fabric not found for ID=${fabricId}, index=${fabricIndex}`);
        }
        return fabric;
    }

    async #initialize() {
        await this.#context.fabrics.construction;

        this.#groupDataMessageCounter = await this.#createGroupDataMessageCounter();

        await this.#migrateLegacyResumptionRecords();

        const storedResumptionRecords = await this.#resumptionStore.load((address, { fabricId, fabricIndex }) => {
            if (this.#maybeFabricForId(fabricId, fabricIndex)?.fabricIndex === address.fabricIndex) {
                return true;
            }
            this.#logger.info(
                `Deleting resumption record for ${address} because it does not match a fabric (fabric 0x${toHex(fabricId)} with index ${fabricIndex})`,
            );
            return false;
        });

        for (const [address, { sessionParameters, ...record }] of storedResumptionRecords) {
            this.#logger.debug("Restoring resumption record for", address.toString());
            this.#rememberResumptionRecord(address, {
                ...record,
                // Make sure to initialize default values when restoring an older resumption record
                sessionParameters: SessionParameters(sessionParameters),
            });
        }
        if (storedResumptionRecords.size) {
            this.#logger.info(`Restored ${storedResumptionRecords.size} resumption records`);
        }
    }

    /**
     * Move the records of the single legacy array to one key per peer.  The array is authoritative when present because
     * only a version without per-peer storage writes it.  It is deleted last, so a start interrupted before that moves
     * it again.  Records of fabrics that no longer exist are dropped.
     */
    async #migrateLegacyResumptionRecords() {
        const storage = this.#context.storage;
        if (!(await storage.has(LEGACY_RESUMPTION_RECORDS_KEY))) {
            return;
        }

        const legacyRecords = await storage.get<LegacyResumptionStorageRecord[]>(LEGACY_RESUMPTION_RECORDS_KEY, []);
        const records = new Array<[PeerAddress, ResumptionStorageRecord]>();
        for (const { nodeId, ...record } of legacyRecords) {
            const fabric = this.#maybeFabricForId(record.fabricId, record.fabricIndex);
            if (fabric === undefined) {
                this.#logger.info(
                    `Dropping resumption record for fabric 0x${toHex(record.fabricId)} and index ${record.fabricIndex} because we cannot find a matching fabric`,
                );
                continue;
            }
            records.push([fabric.addressOf(nodeId), { ...record, fabricIndex: fabric.fabricIndex }]);
        }

        await this.#resumptionStore.replaceAll(records);
        await storage.delete(LEGACY_RESUMPTION_RECORDS_KEY);

        this.#logger.info(`Moved ${records.length} resumption records to per-peer storage`);
    }

    /**
     * Build the node-global group data message counter. On the first run after upgrading from the legacy per-key
     * model, seed it above every value any per-key counter could already have used so it never rolls back below a
     * value already sent with a surviving key; then clear the legacy entries.
     * @see {@link MatterSpecification.v161.Core} § 4.6.1.3
     */
    async #createGroupDataMessageCounter() {
        const storage = this.#context.storage;

        const migrating = !(await storage.has(GROUP_DATA_COUNTER_KEY));
        const seed = migrating ? await this.#context.fabrics.legacyGroupDataCounterMax() : undefined;

        const counter = await PersistedMessageCounter.create(this.crypto, storage, GROUP_DATA_COUNTER_KEY, {
            reserve: GROUP_DATA_COUNTER_RESERVE,
            seed,
            // Presence of the callback lets the counter roll over to 0 (matching CHIP) rather than throwing. The node
            // cannot rotate group epoch keys itself (the Administrator does, §4.17.3.3); for now we only warn near
            // exhaustion (spec §4.6.4).
            // TODO Expose this "group epoch keys must be rotated" signal to external logic instead of only logging, so
            //  the controller key-management layer can act on it.
            aboutToRolloverCallback: async () => {
                this.#logger.warn(
                    "Group data message counter is approaching rollover; group epoch keys should be rotated to avoid message counter reuse.",
                );
            },
        });

        if (migrating) {
            await this.#context.fabrics.clearLegacyGroupDataCounters();
        }

        return counter;
    }

    getActiveSessionInformation(): ActiveSessionInformation[] {
        this.#construction.assert();
        return [...this.#sessions]
            .filter(session => session.isSecure && !session.isPase)
            .map(session => {
                const activity = session instanceof SecureSession ? session.wallClockActivity : undefined;
                return {
                    name: `${session.via}`,
                    nodeId: session.nodeId,
                    peerNodeId: session.peerNodeId,
                    fabric: session instanceof SecureSession ? session.fabric?.externalInformation : undefined,
                    isPeerActive: session.isPeerActive,
                    secure: session.isSecure,
                    lastInteractionTimestamp: activity?.lastInteractionTimestamp,
                    lastActiveTimestamp: activity?.lastActiveTimestamp,
                    numberOfActiveSubscriptions: session instanceof SecureSession ? session.subscriptions.size : 0,
                };
            });
    }

    async close() {
        await this.#construction.close(async () => {
            this.#observers.close();
            try {
                await this.closeAllSessions();
            } finally {
                await this.#groupDataMessageCounter?.close();
            }
        });
    }

    async clear() {
        if (this.#construction.status === Lifecycle.Status.Initializing) {
            await this.#construction;
        }

        await this.closeAllSessions();
        await this.#resumptionStore.clear();
        await this.#context.storage.clearAll();
        this.#forgetAllResumptionRecords();
        await this.#groupDataMessageCounter?.close();
        this.#groupDataMessageCounter = await this.#createGroupDataMessageCounter();
    }

    async closeAllSessions() {
        if (this.#construction.status === Lifecycle.Status.Initializing) {
            await this.#construction;
        }

        await this.#subscriptionUpdateMutex;
        await this.#sessionEvictionMutex;

        const context: PeerLossContext = { cause: new ShutdownError("Session closed by node shutdown") };

        const closePromises = this.#sessions.map(async session => {
            await session.closeSubscriptionsForShutdown();

            // TODO - some CHIP tests (CASERecovery for one) expect us to exit without closing the session and will fail
            // if we end gracefully.  Not clear why this behavior would be desirable as it leads to a timeout when the
            // node attempts contact even if we've already restarted
            await session.initiateForceClose(context);

            this.#sessions.delete(session);
        });

        for (const session of this.#unsecuredSessions.values()) {
            closePromises.push(session.initiateForceClose(context));
        }

        for (const sessions of this.#groupSessions.values()) {
            for (const session of sessions) {
                closePromises.push(session.initiateForceClose(context));
            }
        }
        await MatterAggregateError.allSettled(closePromises, "Error closing sessions").catch(error =>
            this.#logger.warn("Error closing sessions:", error),
        );
    }

    /**
     * Compress range of IDs.  This is intended for testing.
     */
    compressIdRange(upperBound: number) {
        this.#idUpperBound = upperBound;
        this.#nextSessionId = (this.#context.fabrics.crypto.randomUint32 % upperBound) + 1;
    }
}

function storageRecordOf({
    sharedSecret,
    resumptionId,
    peerNodeId,
    fabricId,
    fabricIndex,
    sessionParameters,
    caseAuthenticatedTags,
}: InternalResumptionRecord): ResumptionStorageRecord {
    return {
        sharedSecret,
        resumptionId,
        fabricId,
        fabricIndex,
        peerNodeId,
        sessionParameters: {
            ...sessionParameters,
            supportedTransports: sessionParameters.supportedTransports
                ? SupportedTransportsSchema.encode(sessionParameters.supportedTransports)
                : undefined,
        },
        caseAuthenticatedTags,
    };
}
