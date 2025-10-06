/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedPacket } from "#codec/MessageCodec.js";
import { SupportedTransportsSchema } from "#common/SupportedTransportsBitmap.js";
import { FabricManager } from "#fabric/FabricManager.js";
import {
    BasicSet,
    Bytes,
    Construction,
    Duration,
    Environment,
    Environmental,
    Lifecycle,
    Logger,
    MatterAggregateError,
    MatterFlowError,
    Mutex,
    Observable,
    ObserverGroup,
    StorageContext,
    StorageManager,
    toHex,
} from "#general";
import { Subscription } from "#interaction/Subscription.js";
import { Specification } from "#model";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { GroupSession } from "#session/GroupSession.js";
import { CaseAuthenticatedTag, DEFAULT_MAX_PATHS_PER_INVOKE, FabricId, FabricIndex, GroupId, NodeId } from "#types";
import { UnexpectedDataError } from "@matter/general";
import { Fabric } from "../fabric/Fabric.js";
import { MessageCounter } from "../protocol/MessageCounter.js";
import { InsecureSession } from "./InsecureSession.js";
import { NodeSession } from "./NodeSession.js";
import { SecureSession } from "./SecureSession.js";
import {
    FALLBACK_DATAMODEL_REVISION,
    FALLBACK_INTERACTIONMODEL_REVISION,
    FALLBACK_MAX_PATHS_PER_INVOKE,
    FALLBACK_MAX_TCP_MESSAGE_SIZE,
    FALLBACK_SPECIFICATION_VERSION,
    Session,
    SessionParameterOptions,
    SessionParameters,
} from "./Session.js";
import { SessionIntervals } from "./SessionIntervals.js";

const logger = Logger.get("SessionManager");

const DEFAULT_SESSION_PARAMETERS = {
    ...SessionIntervals.defaults,
    dataModelRevision: Specification.DATA_MODEL_REVISION,
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    specificationVersion: Specification.SPECIFICATION_VERSION,
    maxPathsPerInvoke: DEFAULT_MAX_PATHS_PER_INVOKE,
    supportedTransports: {},
    maxTcpMessageSize: FALLBACK_MAX_TCP_MESSAGE_SIZE,
};

export interface ResumptionRecord {
    sharedSecret: Bytes;
    resumptionId: Bytes;
    fabric: Fabric;
    peerNodeId: NodeId;
    sessionParameters: SessionParameters;
    caseAuthenticatedTags?: CaseAuthenticatedTag[];
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
    caseAuthenticatedTags?: CaseAuthenticatedTag[];
};

/**
 * Interfaces {@link SessionManager} with other components.
 */
export interface SessionManagerContext {
    fabrics: FabricManager;
    storage: StorageContext;

    /**
     * Parameter overrides.
     */
    parameters?: Partial<SessionParameters>;

    /**
     * This is an arbitrary contextual object attached to sessions used for compatibility with legacy APIs.
     *
     * @deprecated
     */
    owner?: unknown;
}

const ID_SPACE_UPPER_BOUND = 0xffff;

/**
 * Manages Matter sessions associated with peer connections.
 */
export class SessionManager {
    readonly #context: SessionManagerContext;
    readonly #insecureSessions = new Map<NodeId, InsecureSession>();
    readonly #sessions = new BasicSet<NodeSession>();
    readonly #groupSessions = new Map<NodeId, BasicSet<GroupSession>>();
    #nextSessionId: number;
    #resumptionRecords = new PeerAddressMap<ResumptionRecord>();
    readonly #globalUnencryptedMessageCounter;
    readonly #subscriptionsChanged = Observable<[session: NodeSession, subscription: Subscription]>();
    #sessionParameters: SessionParameters;
    readonly #retry = Observable<[session: Session, number: number]>();
    readonly #construction: Construction<SessionManager>;
    readonly #observers = new ObserverGroup();
    readonly #subscriptionUpdateMutex = new Mutex(this);
    #idUpperBound = ID_SPACE_UPPER_BOUND;

    constructor(context: SessionManagerContext) {
        this.#context = context;
        const {
            fabrics: { crypto },
        } = context;
        this.#sessionParameters = { ...DEFAULT_SESSION_PARAMETERS, ...context.parameters };
        this.#nextSessionId = crypto.randomUint16;
        this.#globalUnencryptedMessageCounter = new MessageCounter(crypto);

        // When fabric is removed, also remove the resumption record
        this.#observers.on(context.fabrics.events.deleted, async fabric => {
            await this.deleteResumptionRecordsForFabric(fabric);
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
     * Active secure sessions.
     */
    get sessions() {
        return this.#sessions;
    }

    /**
     * Active insecure sessions.
     */
    get insecureSessions() {
        return this.#insecureSessions;
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
        this.#sessionParameters = {
            ...this.#sessionParameters,
            ...parameters,
        };
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

    createInsecureSession(options: {
        initiatorNodeId?: NodeId;
        sessionParameters?: SessionParameterOptions;
        isInitiator?: boolean;
    }) {
        this.#construction.assert();

        const { initiatorNodeId, sessionParameters, isInitiator } = options;
        if (initiatorNodeId !== undefined) {
            if (this.#insecureSessions.has(initiatorNodeId)) {
                throw new MatterFlowError(`UnsecureSession with NodeId ${initiatorNodeId} already exists.`);
            }
        }
        while (true) {
            const session = new InsecureSession({
                crypto: this.#context.fabrics.crypto,
                manager: this,
                messageCounter: this.#globalUnencryptedMessageCounter,
                initiatorNodeId,
                sessionParameters,
                isInitiator: isInitiator ?? false,
            });

            const ephemeralNodeId = session.nodeId;
            if (this.#insecureSessions.has(ephemeralNodeId)) continue;

            this.#insecureSessions.set(ephemeralNodeId, session);
            return session;
        }
    }

    async createSecureSession(args: {
        sessionId: number;
        fabric: Fabric | undefined;
        peerNodeId: NodeId;
        peerSessionId: number;
        sharedSecret: Bytes;
        salt: Bytes;
        isInitiator: boolean;
        isResumption: boolean;
        peerSessionParameters?: SessionParameterOptions;
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
    }) {
        await this.construction;

        const {
            sessionId,
            fabric,
            peerNodeId,
            peerSessionId,
            sharedSecret,
            salt,
            isInitiator,
            isResumption,
            peerSessionParameters,
            caseAuthenticatedTags,
        } = args;
        const session = await NodeSession.create({
            crypto: this.crypto,
            manager: this,
            id: sessionId,
            fabric,
            peerNodeId,
            peerSessionId,
            sharedSecret,
            salt,
            isInitiator,
            isResumption,
            peerSessionParameters: peerSessionParameters,
            caseAuthenticatedTags,
        });

        const subscriptionsChanged = (subscription: Subscription) => {
            if (session.isClosing) {
                return;
            }

            this.#subscriptionsChanged.emit(session, subscription);
        };

        session.subscriptions.added.on(subscriptionsChanged);
        session.subscriptions.deleted.on(subscriptionsChanged);

        this.#sessions.add(session);

        return session;
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
            if (!oldestSession || session.activeTimestamp < oldestSession.activeTimestamp) {
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
        await oldestSession.end(true, false);
        this.#nextSessionId = oldestSession.id;
        return this.#nextSessionId++;
    }

    getSession(sessionId: number) {
        this.#construction.assert();

        return this.#sessions.get("id", sessionId);
    }

    getPaseSession() {
        this.#construction.assert();

        return [...this.#sessions].find(
            session => NodeSession.is(session) && session.isPase && !session.closingAfterExchangeFinished,
        ) as NodeSession;
    }

    forFabric(fabric: Fabric) {
        this.#construction.assert();

        return [...this.#sessions].filter(
            session =>
                NodeSession.is(session) && session.isSecure && session.fabric?.fabricIndex === fabric.fabricIndex,
        );
    }

    getSessionForNode(address: PeerAddress) {
        this.#construction.assert();

        //TODO: It can have multiple sessions for one node ...
        return [...this.#sessions].find(session => {
            if (!session.isSecure) return false;
            return session.peerIs(address);
        });
    }

    async removeAllSessionsForNode(address: PeerAddress, sendClose = false, closeBeforeCreatedTimestamp?: number) {
        await this.#construction;

        for (const session of this.#sessions) {
            if (!session.isSecure) continue;
            if (closeBeforeCreatedTimestamp !== undefined && session.createdAt >= closeBeforeCreatedTimestamp) continue;
            const secureSession = session;
            if (secureSession.peerIs(address)) {
                await secureSession.destroy(sendClose, false);
                this.#sessions.delete(session);
            }
        }
    }

    getUnsecureSession(sourceNodeId?: NodeId) {
        this.#construction.assert();

        if (sourceNodeId === undefined) {
            return this.#insecureSessions.get(NodeId.UNSPECIFIED_NODE_ID);
        }
        return this.#insecureSessions.get(sourceNodeId);
    }

    /**
     * Creates or Returns a Group Session for a Group Peer Address.
     * This is used for sending group messages because it returns the session for the current
     * Group Epoch key. The Source Node Id is the own Node.
     */
    groupSessionForAddress(address: PeerAddress) {
        const groupId = GroupId.fromNodeId(address.nodeId);
        GroupId.assertGroupId(groupId);

        const fabric = this.fabricFor(address);
        const { key, keySetId, sessionId } = fabric.groups.currentKeyForGroup(groupId);
        if (sessionId === undefined || key === undefined) {
            throw new UnexpectedDataError(
                `No group session data found for group ${groupId} in fabric ${fabric.fabricId}.`,
            );
        }

        let session = this.#groupSessions.get(fabric.nodeId)?.get("id", sessionId);
        if (session === undefined) {
            session = new GroupSession({
                manager: this,
                id: sessionId,
                fabric,
                keySetId,
                operationalGroupKey: key,
                peerNodeId: address.nodeId, // The peer node ID is the group node ID
            });
        }
        return session;
    }

    /**
     * Creates or Returns the Group session based on an incoming packet.
     * The Session ID is determined by trying to decrypt te packet with possible keys.
     */
    groupSessionFromPacket(packet: DecodedPacket, aad: Bytes) {
        const groupId = packet.header.destGroupId;
        if (groupId === undefined) {
            throw new UnexpectedDataError("Group ID is required for GroupSession fromPacket.");
        }
        GroupId.assertGroupId(GroupId(groupId));

        const { message, key, sessionId, sourceNodeId, keySetId, fabric } = GroupSession.decode(
            this.#context.fabrics,
            packet,
            aad,
        );

        let session = this.#groupSessions.get(sourceNodeId)?.get("id", sessionId);
        if (session === undefined) {
            session = new GroupSession({
                manager: this,
                id: sessionId,
                fabric,
                keySetId,
                operationalGroupKey: key,
                peerNodeId: sourceNodeId,
            });
        }

        return { session, message, key };
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

    findResumptionRecordById(resumptionId: Bytes) {
        this.#construction.assert();
        return [...this.#resumptionRecords.values()].find(record => Bytes.areEqual(record.resumptionId, resumptionId));
    }

    findResumptionRecordByAddress(address: PeerAddress) {
        this.#construction.assert();
        return this.#resumptionRecords.get(address);
    }

    async saveResumptionRecord(resumptionRecord: ResumptionRecord) {
        await this.#construction;
        this.#resumptionRecords.set(resumptionRecord.fabric.addressOf(resumptionRecord.peerNodeId), resumptionRecord);
        await this.#storeResumptionRecords();
    }

    async #storeResumptionRecords() {
        await this.#construction;
        await this.#context.storage.set(
            "resumptionRecords",
            [...this.#resumptionRecords].map(
                ([
                    address,
                    { sharedSecret, resumptionId, peerNodeId, fabric, sessionParameters, caseAuthenticatedTags },
                ]): ResumptionStorageRecord => ({
                    nodeId: address.nodeId,
                    sharedSecret,
                    resumptionId,
                    fabricId: fabric.fabricId,
                    fabricIndex: fabric.fabricIndex,
                    peerNodeId: peerNodeId,
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

    async #initialize() {
        await this.#context.fabrics.construction;

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
                sessionParameters: {
                    idleInterval,
                    activeInterval,
                    activeThreshold,
                    dataModelRevision,
                    interactionModelRevision,
                    specificationVersion,
                    maxPathsPerInvoke,
                    supportedTransports,
                    maxTcpMessageSize,
                } = {},
                caseAuthenticatedTags,
            }) => {
                const fabric = this.#context.fabrics.find(
                    fabric =>
                        fabric.fabricId === fabricId &&
                        // Backward compatibility logic: fabricIndex was added later (0.15.5), so it might be undefined in older records
                        (fabricIndex === undefined || fabric.fabricIndex === fabricIndex),
                );
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
                    fabric,
                    peerNodeId,
                    sessionParameters: {
                        // Make sure to initialize default values when restoring an older resumption record
                        idleInterval: idleInterval ?? SessionIntervals.defaults.idleInterval,
                        activeInterval: activeInterval ?? SessionIntervals.defaults.activeInterval,
                        activeThreshold: activeThreshold ?? SessionIntervals.defaults.activeThreshold,
                        dataModelRevision: dataModelRevision ?? FALLBACK_DATAMODEL_REVISION,
                        interactionModelRevision: interactionModelRevision ?? FALLBACK_INTERACTIONMODEL_REVISION,
                        specificationVersion: specificationVersion ?? FALLBACK_SPECIFICATION_VERSION,
                        maxPathsPerInvoke: maxPathsPerInvoke ?? FALLBACK_MAX_PATHS_PER_INVOKE,
                        supportedTransports:
                            supportedTransports !== undefined
                                ? SupportedTransportsSchema.decode(supportedTransports)
                                : {},
                        maxTcpMessageSize: maxTcpMessageSize ?? FALLBACK_MAX_TCP_MESSAGE_SIZE,
                    },
                    caseAuthenticatedTags,
                });
            },
        );
    }

    getActiveSessionInformation() {
        this.#construction.assert();
        return [...this.#sessions]
            .filter(session => session.isSecure && !session.isPase)
            .map(session => ({
                name: session.name,
                nodeId: session.nodeId,
                peerNodeId: session.peerNodeId,
                fabric: session instanceof SecureSession ? session.fabric?.externalInformation : undefined,
                isPeerActive: session.isPeerActive(),
                secure: session.isSecure,
                lastInteractionTimestamp: session instanceof SecureSession ? session.timestamp : undefined,
                lastActiveTimestamp: session instanceof SecureSession ? session.activeTimestamp : undefined,
                numberOfActiveSubscriptions: session instanceof SecureSession ? session.subscriptions.size : 0,
            }));
    }

    async close() {
        if (this.#construction.status === Lifecycle.Status.Initializing) {
            await this.#construction;
        }

        await this.#subscriptionUpdateMutex;

        this.#observers.close();
        await this.#storeResumptionRecords();
        const closePromises = this.#sessions.map(async session => {
            await session?.end(false);
            this.#sessions.delete(session);
        });
        for (const session of this.#insecureSessions.values()) {
            closePromises.push(session?.end());
        }
        for (const sessions of this.#groupSessions.values()) {
            for (const session of sessions) {
                closePromises.push(session?.end());
            }
        }
        await MatterAggregateError.allSettled(closePromises, "Error closing sessions").catch(error =>
            logger.error(error),
        );
    }

    async clear() {
        await this.close();
        await this.#context.storage.clear();
        this.#resumptionRecords.clear();
    }

    updateAllSubscriptions() {
        this.#subscriptionUpdateMutex.run(async () => {
            for (const session of this.#sessions) {
                for (const subscription of session.subscriptions) {
                    await subscription.update();
                }
            }
        });
    }

    /** Clears all subscriptions for a given node and returns how many were cleared. */
    async clearSubscriptionsForNode(peerAddress: PeerAddress, flushSubscriptions?: boolean) {
        let clearedCount = 0;
        for (const session of this.#sessions) {
            if (PeerAddress.is(session.peerAddress, peerAddress)) {
                clearedCount += await session.clearSubscriptions(flushSubscriptions, true);
            }
        }
        return clearedCount;
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
