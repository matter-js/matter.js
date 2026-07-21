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
import { PeerShutdownError } from "#peer/PeerCommunicationError.js";
import { PeerLossContext } from "#peer/PeerLossContext.js";
import { SessionClosedError } from "#protocol/errors.js";
import { GroupSession, GroupSessionDecodeError, GroupSessionNoKeyError } from "#session/GroupSession.js";
import {
    BasicSet,
    Bytes,
    causedBy,
    Channel,
    ClosedError,
    Construction,
    Crypto,
    Duration,
    Environment,
    Environmental,
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
import type { Session } from "./Session.js";
import { SessionIntervals } from "./SessionIntervals.js";
import { SessionParameters } from "./SessionParameters.js";
import { UnsecuredSession } from "./UnsecuredSession.js";

const logger = Logger.get("SessionManager");

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
    nodeId: NodeId;
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

/**
 * Metadata about a received group message, emitted via {@link SessionManager.onGroupMessage} for Groupcast testing.
 * Uses {@link Groupcast.GroupcastTestResult} directly so consumers can forward the value without mapping.
 */
export interface GroupMessageEventInfo {
    result: Groupcast.GroupcastTestResult;
    fabric?: Fabric;
    groupId?: GroupId;
    sourceIp?: string;
    destIp?: string;
    endpointId?: EndpointNumber;
    clusterId?: ClusterId;
    elementId?: number;

    /** Whether the ACL granted access for the dispatched command (only set for Success). */
    accessAllowed?: boolean;
}

/**
 * Interfaces {@link SessionManager} with other components.
 */
export interface SessionManagerContext {
    fabrics: FabricManager;
    storage: StorageContext;

    /**
     * Parameter overrides.
     */
    parameters?: SessionParameters.Config;

    /**
     * This is an arbitrary contextual object attached to sessions used for compatibility with legacy APIs.
     *
     * @deprecated
     */
    owner?: unknown;
}

const ID_SPACE_UPPER_BOUND = 0xffff;

/** Storage key for the node-global Group Encrypted Data Message Counter in the session storage context. */
const GROUP_DATA_COUNTER_KEY = "groupDataCounter";

/**
 * Reserve block size for the persisted group data counter; matches CHIP `GROUP_MSG_COUNTER_MIN_INCREMENT`. The counter
 * is persisted this far ahead so an unclean restart never rolls it back.
 * @see {@link MatterSpecification.v16.Core} § 4.6.1.3
 */
const GROUP_DATA_COUNTER_RESERVE = 1000;

/**
 * Thrown when communication terminates due node shutdown.
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
    readonly #context: SessionManagerContext;
    readonly #unsecuredSessions = new Map<NodeId, UnsecuredSession>();
    readonly #sessions = new BasicSet<NodeSession>();
    readonly #groupSessions = new Map<NodeId, BasicSet<GroupSession>>();
    #nextSessionId: number;
    #resumptionRecords = new PeerAddressMap<InternalResumptionRecord>();
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
    #idUpperBound = ID_SPACE_UPPER_BOUND;

    readonly #subscriptionsChanged = Observable<[session: NodeSession, subscription: Subscription]>();
    readonly #retry = Observable<[session: Session, number: number]>();
    readonly #onGroupMessage = Observable<[info: GroupMessageEventInfo]>();

    constructor(context: SessionManagerContext) {
        this.#context = context;
        const {
            fabrics: { crypto },
        } = context;
        this.#sessionParameters = SessionParameters({ ...SessionParameters.defaults, ...context.parameters });
        assertActiveThreshold(this.#sessionParameters.activeThreshold);
        this.#nextSessionId = crypto.randomUint16;
        this.#globalUnencryptedMessageCounter = new MessageCounter(crypto);

        // When fabric is removed, also remove the resumption record
        this.#observers.on(context.fabrics.events.deleting, async fabric => {
            await this.deleteResumptionRecordsForFabric(fabric);
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

            session.closing.on(() => {
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
     * @see {@link MatterSpecification.v16.Core} § 4.6.1.3
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
     * Emits for each received group message (success or failure).  Observers remain inactive until at least one
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

    /**
     * @deprecated
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

        const result = this.#resumptionRecords.delete(address);
        if (result) {
            await this.#storeResumptionRecords();
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
        for (const address of this.#resumptionRecords.keys()) {
            if (address.fabricIndex === fabric.fabricIndex) {
                if (this.#resumptionRecords.delete(address)) {
                    deletedCount++;
                }
            }
        }

        if (deletedCount > 0) {
            await this.#storeResumptionRecords();
        }
        return deletedCount > 0;
    }

    findOldestInactiveSession() {
        this.#construction.assert();

        let oldestSession: NodeSession | undefined = undefined;
        for (const session of this.#sessions) {
            if (!oldestSession || session.timestamp < oldestSession.timestamp) {
                oldestSession = session;
            }
        }
        if (oldestSession === undefined) {
            throw new MatterFlowError("No session found to close and all session ids are taken.");
        }
        return oldestSession;
    }

    async getNextAvailableSessionId() {
        await this.#construction;

        for (let i = 0; i < this.#idUpperBound; i++) {
            const id = this.#nextSessionId;
            this.#nextSessionId = (this.#nextSessionId + 1) & this.#idUpperBound;
            if (this.#nextSessionId === 0) this.#nextSessionId++;

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
        return this.#nextSessionId++;
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
     * Removes all Peer sessions but keeps subscriptions intact because they could be refreshed on restart when the
     * device supports persistent subscriptions.
     */
    handlePeerShutdown(address: PeerAddress, asOf?: Timestamp) {
        return this.#handlePeerLoss({
            address,
            cause: new PeerShutdownError(),
            asOf: asOf ?? Time.nowMs,
            keepSubscriptions: true,
        });
    }

    /**
     * Removes all Peer sessions and closes subscriptions.
     */
    async handlePeerLoss(address: PeerAddress, cause: Error, asOf?: Timestamp) {
        return await this.#handlePeerLoss({ address, asOf: asOf ?? Time.nowMs, cause });
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
     * Obtain a Group session for an incoming packet.
     *
     * The session ID is determined by decrypting the packet with possible keys.
     *
     * Note that the resulting session is non-operational in the sense that attempting outbound communication will
     * result in an error.
     */
    groupSessionFromPacket(packet: DecodedPacket, aad: Bytes) {
        this.#construction.assert();
        let decoded;
        try {
            decoded = GroupSession.decode(this.#context.fabrics, packet, aad);
        } catch (error) {
            // Groupcast testing event on decode failure.  Observable is a no-op unless a listener is attached.  A failed
            // decode is unauthenticated, so per the Groupcast spec we report only the result, never a group id.
            if (causedBy(error, GroupSessionNoKeyError)) {
                this.#onGroupMessage.emit({ result: Groupcast.GroupcastTestResult.NoAvailableKey });
            } else if (causedBy(error, GroupSessionDecodeError)) {
                this.#onGroupMessage.emit({ result: Groupcast.GroupcastTestResult.FailedAuth });
            }
            throw error;
        }

        const { message, key, privacyKey, sessionId, sourceNodeId, keySetId, fabric } = decoded;

        // The group id is only authoritative after decode, since privacy obfuscates it in the wire header.
        const rawGroupId = message.packetHeader.destGroupId;
        if (rawGroupId === undefined) {
            throw new UnexpectedDataError("Group ID is required for GroupSession fromPacket.");
        }
        const groupId = GroupId(rawGroupId);
        GroupId.assertGroupId(groupId);

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

        return { session, message, key };
    }

    /** Report a group message event (used by ExchangeManager for replay and InteractionServer for dispatch). */
    emitGroupMessage(info: GroupMessageEventInfo) {
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
        const record = [...this.#resumptionRecords.values()].find(record =>
            Bytes.areEqual(record.resumptionId, resumptionId),
        );
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
        this.#resumptionRecords.set(fabric.addressOf(resumptionRecord.peerNodeId), record);
        await this.#storeResumptionRecords();
    }

    async #storeResumptionRecords() {
        await this.#construction;
        await this.#context.storage.set(
            "resumptionRecords",
            [...this.#resumptionRecords].map(
                ([
                    address,
                    {
                        sharedSecret,
                        resumptionId,
                        peerNodeId,
                        fabricId,
                        fabricIndex,
                        sessionParameters,
                        caseAuthenticatedTags,
                    },
                ]): ResumptionStorageRecord => ({
                    nodeId: address.nodeId,
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
                }),
            ),
        );
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

        const storedResumptionRecords = await this.#context.storage.get<ResumptionStorageRecord[]>(
            "resumptionRecords",
            [],
        );

        storedResumptionRecords.forEach(
            ({
                nodeId,
                sharedSecret,
                resumptionId,
                fabricId,
                fabricIndex,
                peerNodeId,
                sessionParameters,
                caseAuthenticatedTags,
            }) => {
                const fabric = this.#maybeFabricForId(fabricId, fabricIndex);
                if (!fabric) {
                    logger.warn(
                        `Ignoring resumption record for fabric 0x${toHex(fabricId)} and index ${fabricIndex} because we cannot find a matching fabric`,
                    );
                    return;
                }
                logger.info(
                    "restoring resumption record for node",
                    fabric.addressOf(nodeId).toString(),
                    "and peer node",
                    fabric.addressOf(peerNodeId).toString(),
                    "for fabric id",
                    `0x${toHex(fabric.fabricId)}`,
                    `(0x${toHex(fabric.rootVendorId)}, "${fabric?.label}")`,
                );
                this.#resumptionRecords.set(fabric.addressOf(nodeId), {
                    sharedSecret,
                    resumptionId,
                    fabricId,
                    fabricIndex: fabric.fabricIndex,
                    peerNodeId,
                    // Make sure to initialize default values when restoring an older resumption record
                    sessionParameters: SessionParameters(sessionParameters),
                    caseAuthenticatedTags,
                });
            },
        );
    }

    /**
     * Build the node-global group data message counter. On the first run after upgrading from the legacy per-key
     * model, seed it above every value any per-key counter could already have used so it never rolls back below a
     * value already sent with a surviving key; then clear the legacy entries.
     * @see {@link MatterSpecification.v16.Core} § 4.6.1.3
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
                logger.warn(
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
            .map(session => ({
                name: `${session.via}`,
                nodeId: session.nodeId,
                peerNodeId: session.peerNodeId,
                fabric: session instanceof SecureSession ? session.fabric?.externalInformation : undefined,
                isPeerActive: session.isPeerActive,
                secure: session.isSecure,
                lastInteractionTimestamp: session instanceof SecureSession ? session.timestamp : undefined,
                lastActiveTimestamp: session instanceof SecureSession ? session.activeTimestamp : undefined,
                numberOfActiveSubscriptions: session instanceof SecureSession ? session.subscriptions.size : 0,
            }));
    }

    async close() {
        await this.#construction.close(async () => {
            this.#observers.close();
            await this.closeAllSessions();
        });
    }

    async clear() {
        if (this.#construction.status === Lifecycle.Status.Initializing) {
            await this.#construction;
        }

        await this.closeAllSessions();
        await this.#context.storage.clearAll();
        this.#resumptionRecords.clear();
        this.#groupDataMessageCounter = await this.#createGroupDataMessageCounter();
    }

    async closeAllSessions() {
        if (this.#construction.status === Lifecycle.Status.Initializing) {
            await this.#construction;
        }

        await this.#subscriptionUpdateMutex;

        const context: PeerLossContext = { cause: new ShutdownError("Session closed by node shutdown") };

        const closePromises = this.#sessions.map(async session => {
            await session.closeSubscriptions(true);

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
            logger.warn("Error closing sessions:", error),
        );
    }

    /**
     * Compress range of IDs.  This is intended for testing.
     */
    compressIdRange(upperBound: number) {
        this.#idUpperBound = upperBound;
        this.#nextSessionId = this.#context.fabrics.crypto.randomUint32 % upperBound;
        if (this.#nextSessionId === 0) this.#nextSessionId++;
    }
}

namespace SessionManager {
    export interface Options {
        maxPathsPerInvoke?: number;
    }
}
