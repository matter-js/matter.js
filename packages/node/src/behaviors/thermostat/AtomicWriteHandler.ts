/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext, Behavior, ClusterBehavior, type ClusterState, ValueSupervisor } from "#behavior/index.js";
import { Thermostat } from "#clusters/thermostat";
import { Endpoint } from "#endpoint/Endpoint.js";
import { BasicSet, Environment, Environmental, InternalError, Logger, ObserverGroup, serialize } from "#general";
import { ClusterModel, DataModelPath } from "#model";
import {
    AccessControl,
    assertRemoteActor,
    Fabric,
    FabricManager,
    hasRemoteActor,
    PeerAddress,
    Subject,
    Val,
} from "#protocol";
import { AttributeId, NodeId, Status, StatusResponse, StatusResponseError } from "#types";
import { AtomicWriteState } from "./AtomicWriteState.js";

const logger = Logger.get("AtomicWriteHandler");

/**
 * Handles atomic write handling according to Matter definitions.
 * The implementation tries to be generic, but is currently only used by the Thermostat cluster, so the atomic write
 * types are imported from there.
 *
 * The logic requires that the cluster behavior implements the following additional events as "pure Observable()" events,
 * because the current implementation logic requires error thrown by the event handlers to signal validation failures to
 * be thrown back to te emitter. This is not the case for official state events.
 * * `${attributeName}$AtomicChanging` - emitted when an attribute is changed as part of an atomic write, before the value
 *   is actually changed. Receives the new value, the old value and the action context as parameters.
 * * `${attributeName}$AtomicChanged` - emitted when an attribute is changed as part of an atomic write, after the value
 *   is actually changed. Receives the new value, the old value and the action context as parameters.
 *
 * TODO: Move out of thermostat behavior into a more generic behavior handler once used by other clusters too. Then we
 *  also need to adjust how it is handled.
 *  Proper solution might be to add the handling of the atomic Request command on interaction level and leave the
 *  transaction open until it is rolled back or committed. This might have side effects on other parts of the system though.
 *  So lets do that later when we have more clusters using it.
 */
export class AtomicWriteHandler {
    #observers = new ObserverGroup();
    #pendingWrites = new BasicSet<AtomicWriteState>();

    constructor(fabricManager: FabricManager) {
        this.#observers.on(fabricManager.events.deleted, fabric => this.#handleFabricRemoval(fabric));
    }

    static [Environmental.create](env: Environment) {
        const instance = new AtomicWriteHandler(env.get(FabricManager));
        env.set(AtomicWriteHandler, instance);
        return instance;
    }

    close() {
        this.#observers.close();
        for (const writeState of Array.from(this.#pendingWrites)) {
            writeState.close();
        }
    }

    /**
     * Initializes an AtomicWrite state for the given request, context, endpoint and cluster.
     * It also implements all relevant validation according to the Matter spec.
     */
    #initializeState<B extends Behavior.Type>(
        { requestType, attributeRequests, timeout }: Thermostat.AtomicRequest,
        context: ActionContext,
        endpoint: Endpoint,
        cluster: B,
    ) {
        if (!ClusterBehavior.is(cluster) || !cluster.schema) {
            throw new InternalError("Cluster behavior expected for atomic write handler");
        }

        // Ensure we have a valid peer and so also associated fabric
        const peerAddress = this.#assertValidPeer(context);

        // Validate AttributeRequests
        if (attributeRequests.length === 0) {
            throw new StatusResponse.InvalidCommandError("No attribute requests provided");
        }
        const attributes = new Map<AttributeId, string>();
        for (const attr of attributeRequests) {
            const [attributeName, _] =
                Object.entries((cluster as ClusterBehavior.Type).cluster.attributes).find(
                    ([_, { id }]) => id === attr,
                ) ?? [];
            if (attributeName === undefined || endpoint.stateOf(cluster.id)[attr] === undefined) {
                throw new StatusResponse.InvalidCommandError(`Attribute ${attr} not supported by cluster`);
            }
            if (attributes.has(attr)) {
                throw new StatusResponse.InvalidCommandError("Duplicate attribute in attribute requests");
            }
            attributes.set(attr, attributeName);
        }

        const existingState = this.#pendingWrites.find(
            s =>
                PeerAddress.is(s.peerAddress, peerAddress) &&
                s.endpoint.number === endpoint.number &&
                s.clusterId === (cluster as ClusterBehavior.Type).cluster.id,
        );

        if (requestType === Thermostat.RequestType.BeginWrite) {
            if (timeout === undefined) {
                throw new StatusResponse.InvalidCommandError("Timeout missing for BeginWrite request");
            }

            if (
                existingState !== undefined &&
                existingState.attributeRequests.some(attr => attributeRequests.includes(attr))
            ) {
                throw new StatusResponse.InvalidCommandError(
                    "An atomic write for at least one of the attributes is already in progress for this peer",
                );
            }

            const initialValues: Val.Struct = {};
            for (const attr of attributeRequests) {
                initialValues[attr] = endpoint.stateOf(cluster.id)[attr];
            }

            const state = new AtomicWriteState(
                peerAddress,
                endpoint,
                cluster.cluster.id,
                attributeRequests,
                timeout,
                attributes,
                initialValues,
            );
            this.#pendingWrites.add(state);
            state.closed.on(() => void this.#pendingWrites.delete(state));
            logger.debug("Added atomic write state:", state);
            return state;
        }
        if (existingState === undefined) {
            throw new StatusResponse.InvalidInStateError("No atomic write in progress for this peer");
        }
        if (
            existingState.attributeRequests.length !== attributeRequests.length ||
            !existingState.attributeRequests.every(attr => attributeRequests.includes(attr))
        ) {
            throw new StatusResponse.InvalidInStateError("Attribute requests do not match existing atomic write");
        }
        return existingState;
    }

    /**
     * Implements the begin write logic for an atomic write.
     */
    beginWrite(
        request: Thermostat.AtomicRequest,
        context: ActionContext,
        endpoint: Endpoint,
        cluster: Behavior.Type,
    ): Thermostat.AtomicResponse {
        if (!hasRemoteActor(context)) {
            throw new StatusResponse.InvalidCommandError("AtomicRequest requires a remote actor");
        }
        if (!ClusterBehavior.is(cluster) || !cluster.schema) {
            throw new InternalError("Cluster behavior expected for atomic write handler");
        }
        let commandStatusCode = Status.Success;
        const attributeStatus = request.attributeRequests.map(attr => {
            let statusCode = Status.Success;
            const attributeModel = (cluster.schema!.conformant as ClusterModel.Conformant).attributes.for(attr);
            if (!attributeModel?.quality.atomic) {
                statusCode = Status.InvalidAction;
            } else if (this.#pendingWriteStateForAttribute(endpoint, cluster, attr) !== undefined) {
                statusCode = Status.Busy;
            } else {
                const { writeLevel } = cluster.supervisor.get(attributeModel).access.limits;
                const location = {
                    path: DataModelPath.none,
                    endpoint: endpoint.number,
                    cluster: cluster.cluster.id,
                    owningFabric: context.fabric,
                };
                if (context.authorityAt(writeLevel, location) !== AccessControl.Authority.Granted) {
                    statusCode = Status.UnsupportedAccess;
                }
            }

            if (statusCode !== Status.Success) {
                commandStatusCode = Status.Failure;
            }
            return {
                attributeId: attr,
                statusCode,
            };
        });

        let timeout;
        if (commandStatusCode === Status.Success) {
            const state = this.#initializeState(request, context, endpoint, cluster);
            timeout = state.timeout;
        }

        return {
            statusCode: commandStatusCode,
            attributeStatus,
            timeout,
        };
    }

    /**
     * Handles writing a value for an attribute as part of an ongoing atomic write.
     * It uses the *$AtomicChanging* event to trigger validation of the partial write.
     */
    writeAttribute(
        context: ValueSupervisor.Session,
        endpoint: Endpoint,
        cluster: Behavior.Type,
        attribute: AttributeId,
        value: unknown,
    ) {
        const state = this.#assertPendingWriteForAttributeAndPeer(context, endpoint, cluster, attribute);
        const attributeName = state.attributeNames.get(attribute)!;
        logger.debug(`Writing pending value for attribute ${attributeName}, ${attribute} in atomic write`, value);
        // TODO currently we only handle this one changing, so checking other state within the event potentially use
        //  older values. We need to tweak the state for a complete solution. But ok for now!
        endpoint
            .eventsOf(cluster.id)
            [
                `${attributeName}$AtomicChanging`
            ]?.emit(value, state.pendingAttributeValues[attribute] !== undefined ? state.pendingAttributeValues[attribute] : state.initialValues[attribute], context);
        state.pendingAttributeValues[attribute] = value;
        logger.debug("Atomic write state after current write:", state);
    }

    /**
     * Implements the commit logic for an atomic write.
     */
    async commitWrite<B extends Behavior.Type>(
        request: Thermostat.AtomicRequest,
        context: ActionContext,
        endpoint: Endpoint,
        cluster: B,
        clusterState: ClusterState.Type<any, B>,
    ): Promise<Thermostat.AtomicResponse> {
        const state = this.#initializeState(request, context, endpoint, cluster);

        let commandStatusCode = Status.Success;
        const attributeStatus = [];
        for (const [attr, value] of Object.entries(state.pendingAttributeValues)) {
            let statusCode = Status.Success;
            try {
                const attributeName = state.attributeNames.get(AttributeId(Number(attr)))!;
                endpoint
                    .eventsOf(cluster.id)
                    [`${attributeName}$AtomicChanging`]?.emit(value, endpoint.stateOf(cluster.id)[attr], context);
                endpoint
                    .eventsOf(cluster.id)
                    [`${attributeName}$AtomicChanged`]?.emit(value, endpoint.stateOf(cluster.id)[attr], context);
                (clusterState as any)[attr] = value;
                await context.transaction?.commit();
            } catch (error) {
                await context.transaction?.rollback();
                logger.info(`Failed to write attribute ${attr} during atomic write commit: ${error}`);
                statusCode = error instanceof StatusResponseError ? error.code : Status.Failure;
                // If one fails with ConstraintError, the whole command should return ConstraintError, otherwise Failure
                commandStatusCode =
                    commandStatusCode === Status.Failure
                        ? Status.Failure
                        : commandStatusCode === Status.ConstraintError
                          ? Status.ConstraintError
                          : Status.Failure;
            }
            attributeStatus.push({
                attributeId: AttributeId(Number(attr)),
                statusCode,
            });
        }
        state.close(); // Irrelevant of the outcome the state is closed
        return {
            statusCode: commandStatusCode,
            attributeStatus,
        };
    }

    /**
     * Implements the rollback logic for an atomic write.
     */
    rollbackWrite(
        request: Thermostat.AtomicRequest,
        context: ActionContext,
        endpoint: Endpoint,
        cluster: Behavior.Type,
    ): Thermostat.AtomicResponse {
        const state = this.#initializeState(request, context, endpoint, cluster);
        state.close();
        return {
            statusCode: Status.Success,
            attributeStatus: state.attributeRequests.map(attr => ({
                attributeId: attr,
                statusCode: Status.Success,
            })),
        };
    }

    /**
     * Handles fabric removal by closing all pending atomic write states for peers on the removed fabric.
     */
    #handleFabricRemoval(fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        for (const writeState of Array.from(this.#pendingWrites)) {
            if (writeState.peerAddress.fabricIndex === fabricIndex) {
                logger.debug(
                    `Closing atomic write state for peer ${writeState.peerAddress.toString()} on endpoint ${writeState.endpoint.id} due to fabric removal`,
                );
                writeState.close();
            }
        }
    }

    /**
     * Returns the pending write state for the given attribute, if any.
     */
    #pendingWriteStateForAttribute(endpoint: Endpoint, cluster: Behavior.Type, attribute: AttributeId) {
        const writeStates = this.#pendingWrites.filter(
            s => s.endpoint.number == endpoint.number && s.clusterId === (cluster as ClusterBehavior.Type).cluster.id,
        );
        if (writeStates.length === 0) {
            return undefined;
        }
        const attrWriteStates = writeStates.filter(({ attributeRequests }) => attributeRequests.includes(attribute));
        if (attrWriteStates.length === 0) {
            return undefined;
        }
        if (attrWriteStates.length > 1) {
            throw new InternalError("Multiple atomic write states found for the same attribute. Should never happen");
        }
        return attrWriteStates[0];
    }

    /**
     * Returns the pending value for the given attribute and peer, if any.
     */
    pendingValueForAttributeAndPeer(
        context: ValueSupervisor.Session,
        endpoint: Endpoint,
        cluster: Behavior.Type,
        attribute: AttributeId,
    ) {
        const peerAddress = this.#derivePeerAddress(context);
        if (peerAddress === undefined) {
            // No valid peer address could be derived from the session
            return undefined;
        }
        const attrWriteState = this.#pendingWriteStateForAttribute(endpoint, cluster, attribute);
        if (attrWriteState === undefined) {
            // No pending write for this attribute
            return undefined;
        }
        if (!PeerAddress.is(attrWriteState.peerAddress, peerAddress)) {
            // Pending state s for an other peer
            return undefined;
        }
        logger.debug(
            `Found pending value for attribute ${attribute} for peer ${peerAddress.nodeId}`,
            serialize(attrWriteState.pendingAttributeValues[attribute]),
        );
        return attrWriteState.pendingAttributeValues[attribute];
    }

    #assertPendingWriteForAttributeAndPeer(
        session: ValueSupervisor.Session,
        endpoint: Endpoint,
        cluster: Behavior.Type,
        attribute: AttributeId,
    ) {
        const attrWriteState = this.#pendingWriteStateForAttribute(endpoint, cluster, attribute);
        if (attrWriteState === undefined) {
            throw new StatusResponse.InvalidInStateError("There is no atomic write in progress for this attribute");
        }
        const peerAddress = this.#derivePeerAddress(session);
        if (peerAddress === undefined) {
            throw new StatusResponse.InvalidInStateError("There is no atomic write in progress for this peer");
        }
        if (!PeerAddress.is(attrWriteState.peerAddress, peerAddress)) {
            throw new StatusResponse.BusyError("Attribute is part of an atomic write in progress for a different peer");
        }
        return attrWriteState;
    }

    #derivePeerAddress(session: ValueSupervisor.Session) {
        if (
            hasRemoteActor(session) &&
            Subject.isNode(session.subject) &&
            NodeId.isOperationalNodeId(session.subject.id)
        ) {
            return PeerAddress({ fabricIndex: session.fabric, nodeId: NodeId(session.subject.id) });
        }
    }

    #assertValidPeer(context: ActionContext) {
        assertRemoteActor(context); // Also validate that we have a remote actor for processing the command

        const peerAddress = this.#derivePeerAddress(context);
        if (!context.session.associatedFabric || peerAddress === undefined) {
            throw new StatusResponse.InvalidCommandError("AtomicRequest requires an operational session");
        }
        return peerAddress;
    }
}
