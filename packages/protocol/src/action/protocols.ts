/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionSession } from "#action/Interactable.js";
import { OccurrenceManager } from "#events/OccurrenceManager.js";
import { MaybePromise, Observable } from "#general";
import { DataModelPath, MatterModel } from "#model";
import type {
    AttributeId,
    ClusterId,
    CommandId,
    DeviceTypeId,
    EndpointNumber,
    FabricIndex,
    NodeId,
    TlvSchema,
} from "#types";
import { AttributePath, CommandPath, EventId, EventPath } from "#types";
import { AccessControl } from "./server/AccessControl.js";
import { Val } from "./Val.js";

export type CommandInvokeHandler = (
    args: Val.Struct | undefined,
    session: InteractionSession,
) => MaybePromise<Val.Struct | void>;

/**
 * Optimized Matter protocol<->JS object interface
 *
 * This is the root contract between a Matter protocol implementation and a higher-level Matter data model.
 *
 * Note that the term "protocol" here has dual meaning.  The client of this interface is a Matter Protocol
 * implementation.  The implementation adheres to a JS protocol in the "interface" sense used by JS specifications.
 *
 * The goal is for this abstraction to be as inexpensive as possible.  Element access is via iteration or direct
 * property access using protocol-level numeric IDs.
 *
 * We limit metadata to parent->child, authorization and marshalling.  We limit function calls to a few places where the
 * return value depends on session state.
 *
 * To optimize performance, underlying implementations should align their native structures as closely as possible to
 * those defined by these contracts.  When adaptation is necessary you can generate objects to perform adaptation,
 * possibly with getters and/or setters where caching is infeasible or unnecessary.
 */
export interface NodeProtocol extends CollectionProtocol<EndpointProtocol> {
    /**
     * The active Matter data model.
     *
     * A protocol implementation may fall back to this model in some cases when element paths do not resolve.
     */
    matter: MatterModel;

    /**
     * Obtain the ID of this node in the context of a specific fabric.
     */
    nodeIdFor(fabric: FabricIndex): NodeId | undefined;

    /**
     * The Event Handler for this node.
     */
    eventHandler: OccurrenceManager;

    /**
     * Emitted when attributes change.
     */
    attrsChanged: Observable<NodeProtocol.AttrChange, MaybePromise>;

    /**
     * Inspects an Attribute- or Event path and log in human-readable form if possible
     */
    inspectPath(path: AttributePath | EventPath | CommandPath): string;
}

export namespace NodeProtocol {
    export type AttrChange = [
        endpointId: EndpointNumber,
        clusterId: ClusterId,
        changes: AttributeId[],
        version: number,
    ];
}

/**
 * Protocol contract for a specific endpoint.
 */
export interface EndpointProtocol
    extends CollectionProtocol<ClusterProtocol>,
        AddressableElementProtocol<EndpointNumber> {
    /**
     * Bitmap with each wildcard path flag bit set where this value should be skipped.
     */
    wildcardPathFlags: number;

    /**
     * Path to the endpoint within the data model.
     */
    path: DataModelPath;

    /**
     * List of device types associated with the endpoint.
     */
    deviceTypes: DeviceTypeId[];
}

/**
 * Protocol contract for a specific cluster on a specific endpoint.
 */
export interface ClusterProtocol {
    type: ClusterTypeProtocol;

    /**
     * Current version of cluster data.
     */
    version: number;

    /**
     * The location of the cluster within the data model.
     */
    location: AccessControl.Location;

    /**
     * Read-only state of the cluster
     */
    readState(session: InteractionSession): Val.ProtocolStruct;

    /**
     * Writeable record of attribute values, keyed by attribute ID.
     *
     * Note that current protocol implementations do not filter data within this responsibility based on the
     * session.  So doing is the responsibility of the node implementation.
     */
    openForWrite(session: InteractionSession): Promise<Val.ProtocolStruct>;

    /**
     * Invoke handler for the commands of the cluster
     */
    commands: Record<CommandId, CommandInvokeHandler>;
}

/**
 * Protocol contract for a specific type of cluster (including feature variants).
 *
 * TODO - commands
 */
export interface ClusterTypeProtocol extends AddressableElementProtocol<ClusterId> {
    /**
     * Bitmap with each wildcard path flag bit set where this value should be skipped.
     */
    wildcardPathFlags: number;

    /**
     * Attribute metadata.
     */
    attributes: CollectionProtocol<AttributeTypeProtocol>;

    /**
     * Event metadata.
     */
    events: CollectionProtocol<EventTypeProtocol>;

    /**
     * Command metadata.
     */
    commands: CollectionProtocol<CommandTypeProtocol>;
}

/**
 * Descriptor for a specific attribute property type.
 */
export interface AttributeTypeProtocol extends AddressableElementProtocol<AttributeId> {
    /**
     * Bitmap with each wildcard path flag bit set where this value should be skipped.
     */
    wildcardPathFlags: number;

    /**
     * The TLV schema for this property.
     */
    tlv: TlvSchema<unknown>;

    /**
     * Access control information for the attribute.
     */
    limits: AccessControl.Limits;

    /**
     * Changes of this attribute are omitted from subscriptions
     */
    changesOmitted?: boolean;

    /**
     * Changes of this attribute are omitted from subscriptions
     */
    quieter?: boolean;
}

/**
 * Descriptor for a specific event property type.
 */
export interface EventTypeProtocol extends AddressableElementProtocol<EventId> {
    /**
     * The TLV schema for this property.
     */
    tlv: TlvSchema<unknown>;

    /**
     * Access control information for the event.
     */
    limits: AccessControl.Limits;
}

/**
 * Descriptor for a specific command property type.
 */
export interface CommandTypeProtocol extends AddressableElementProtocol<CommandId> {
    /**
     * The TLV schema for the command request.
     */
    requestTlv: TlvSchema<unknown>;

    /**
     * The TLV schema for the command response.
     */
    responseTlv: TlvSchema<unknown>;

    /**
     * The Response command Id
     */
    responseId: CommandId;

    /**
     * Access control information for the command.
     */
    limits: AccessControl.Limits;
}

/**
 * Protocol contract for addressable elements.
 */
export interface AddressableElementProtocol<N extends number> {
    /**
     * The numeric ID of the element defined by the Matter specification.
     */
    id: N;

    /**
     * Human readable name of the element.
     */
    name: string;
}

/**
 * A collection of elements that supports lookup by numeric ID and iteration.
 */
export interface CollectionProtocol<T> {
    [id: number]: T | undefined;
    [Symbol.iterator](): Iterator<T, void, void>;
}
