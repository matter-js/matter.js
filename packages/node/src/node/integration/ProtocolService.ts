/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import type { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import type { DescriptorBehavior } from "#behaviors/descriptor";
import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    camelize,
    Diagnostic,
    ImplementationError,
    isObject,
    Logger,
    MaybePromise,
    Observable,
    Transaction,
} from "#general";
import { AcceptedCommandList, AttributeList, ElementTag, GeneratedCommandList, Matter } from "#model";
import type { Node } from "#node/Node.js";
import type {
    AttributeTypeProtocol,
    ClusterProtocol,
    ClusterTypeProtocol,
    CollectionProtocol,
    CommandInvokeHandler,
    CommandTypeProtocol,
    EndpointProtocol,
    InteractionSession,
    NodeProtocol,
} from "#protocol";
import {
    EventTypeProtocol,
    FabricManager,
    hasRemoteActor,
    OccurrenceManager,
    toWildcardOrHexPath,
    Val,
} from "#protocol";
import {
    AttributeId,
    AttributePath,
    ClusterId,
    ClusterType,
    CommandId,
    CommandPath,
    DeviceTypeId,
    EndpointNumber,
    EventId,
    EventPath,
    FabricIndex,
    WildcardPathFlags as WildcardPathFlagsType,
} from "#types";

const logger = Logger.get("ProtocolService");

/**
 * Protocol view of a {@link Node}
 *
 * This service maintains an optimized {@link NodeProtocol} that maps to the state of a {@link Node}.
 *
 * The protocol view only contains endpoints and clusters with active backings.  {@link Behaviors} conveys backing
 * state via the public interface.
 */
export class ProtocolService {
    readonly #state: NodeState;

    constructor(node: Node) {
        this.#state = new NodeState(node);
    }

    /**
     * Invoked by a backing when initialized.
     */
    addCluster(backing: BehaviorBacking) {
        const { schema } = backing.type;
        if (schema?.tag !== ElementTag.Cluster || schema.id === undefined) {
            return;
        }

        this.#state.stateFor(backing.endpoint).addCluster(backing);
    }

    /**
     * Invoked by a backing when closed.
     */
    deleteCluster(backing: BehaviorBacking) {
        if (this.#state.hasEndpoint(backing.endpoint)) {
            this.#state.stateFor(backing.endpoint).deleteCluster(backing);
        }
    }

    /**
     * Invoked by a backing when there is a state change.
     *
     * This optimized path allows us to broadcast state changes without registering observers for every change.
     */
    handleChange(backing: BehaviorBacking, props: string[]) {
        const clusterId = backing.type.schema.id as ClusterId | undefined;
        if (clusterId === undefined) {
            return;
        }

        const namesToIds = backing.type.supervisor.propertyNamesAndIds;
        const attrs = props.map(name => namesToIds.get(name)).filter(id => id !== undefined);

        this.protocol.attrsChanged.emit(backing.endpoint.number, clusterId, attrs, backing.datasource.version);
    }

    /**
     * The {@link NodeProtocol}.
     */
    get protocol() {
        return this.#state.protocol;
    }
}

const WildcardPathFlags = {
    skipRootNode: 1 << WildcardPathFlagsType.wildcardSkipRootNode.offset,
    skipGlobalAttributes: 1 << WildcardPathFlagsType.wildcardSkipGlobalAttributes.offset,
    skipAttributeList: 1 << WildcardPathFlagsType.wildcardSkipAttributeList.offset,
    skipCommandLists: 1 << WildcardPathFlagsType.wildcardSkipCommandLists.offset,
    skipCustomElements: 1 << WildcardPathFlagsType.wildcardSkipCustomElements.offset,
    skipFixedAttributes: 1 << WildcardPathFlagsType.wildcardSkipFixedAttributes.offset,
    skipChangesOmittedAttributes: 1 << WildcardPathFlagsType.wildcardSkipChangesOmittedAttributes.offset,
    skipDiagnosticsClusters: 1 << WildcardPathFlagsType.wildcardSkipDiagnosticsClusters.offset,
};

class NodeState {
    readonly protocol: NodeProtocol;
    readonly #endpoints = new Set<EndpointProtocol>();
    readonly #endpointStates = {} as Record<EndpointNumber, EndpointState>;

    constructor(node: Node) {
        let fabrics: FabricManager | undefined;
        let eventHandler: OccurrenceManager | undefined;

        this.protocol = {
            matter: Matter,

            nodeIdFor(index: FabricIndex) {
                if (!fabrics) {
                    fabrics = node.env.get(FabricManager);
                }
                return fabrics.findByIndex(index)?.nodeId;
            },

            get eventHandler() {
                if (eventHandler === undefined) {
                    eventHandler = node.env.get(OccurrenceManager);
                }
                return eventHandler;
            },

            [Symbol.iterator]: this.#endpoints[Symbol.iterator].bind(this.#endpoints),

            attrsChanged: new Observable<
                [endpointId: EndpointNumber, clusterId: ClusterId, changes: AttributeId[], version: number]
            >(),

            toString() {
                return `node-proto#${node.id}`;
            },

            inspect() {
                return this.toString();
            },

            inspectPath(path: AttributePath | EventPath | CommandPath) {
                return resolvePathForNode(this, path);
            },
        } satisfies NodeProtocol & { toString(): string; inspect(): string } as NodeProtocol;
    }

    stateFor(endpoint: Endpoint) {
        const { number } = endpoint;
        let state = this.#endpointStates[number];
        if (state !== undefined) {
            return state;
        }

        state = new EndpointState(this, endpoint);
        this.protocol[number] = state.protocol;
        this.#endpoints.add(state.protocol);
        this.#endpointStates[number] = state;

        return state;
    }

    hasEndpoint(endpoint: Endpoint) {
        return endpoint.number in this.#endpointStates;
    }

    deleteEndpoint(endpoint: EndpointProtocol) {
        delete this.protocol[endpoint.id];
        this.#endpoints.delete(endpoint);
        delete this.#endpointStates[endpoint.id];
    }
}

class EndpointState {
    readonly protocol: EndpointProtocol;
    readonly #node: NodeState;
    readonly #activeClusters = new Set<ClusterId>();
    readonly #clusters = new Set<ClusterProtocol>();

    constructor(node: NodeState, endpoint: Endpoint) {
        this.#node = node;
        const number = endpoint.number;
        this.protocol = {
            id: number,
            wildcardPathFlags: number === 0 ? WildcardPathFlags.skipRootNode : 0,
            path: endpoint.path,
            name: endpoint.type.name,
            deviceTypes: [],

            toString() {
                return `endpoint-proto#${this.id}`;
            },

            inspect() {
                return this.toString();
            },

            [Symbol.iterator]: this.#clusters[Symbol.iterator].bind(this.#clusters),
        } satisfies EndpointProtocol & { toString(): string; inspect(): string } as EndpointProtocol;
    }

    addCluster(backing: BehaviorBacking) {
        const type = clusterTypeProtocolOf(backing);
        if (!type) {
            return;
        }

        const cluster = new ClusterState(type, backing);

        // When descriptor behavior initializes, sync device types
        if (backing.type.id === "descriptor") {
            this.#updateDeviceTypes(backing.endpoint.state.descriptor.deviceTypeList);
            (backing.events as DescriptorBehavior["events"]).deviceTypeList$Changed.on(
                this.#updateDeviceTypes.bind(this),
            );
        }

        this.protocol[cluster.type.id] = cluster;
        this.#activeClusters.add(cluster.type.id);
        this.#clusters.add(cluster);

        // Cluster added, emit all attributes as changed
        const attrs = [...cluster.type.attributes]
            .filter(attr => attr.limits.readable && !attr.changesOmitted)
            .map(attr => attr.id);
        if (attrs.length) {
            this.#node.protocol.attrsChanged.emit(this.protocol.id, cluster.type.id, attrs, cluster.version);
        }
    }

    deleteCluster(backing: BehaviorBacking) {
        const { schema } = backing.type;
        if (schema === undefined) {
            return;
        }

        const { tag, id } = schema;
        if (tag !== ElementTag.Cluster || id === undefined) {
            return;
        }

        const protocol = this.protocol[id];
        if (protocol) {
            this.#clusters.delete(protocol);
            delete this.protocol[id];
        }

        this.#activeClusters.delete(id as ClusterId);

        if (!this.#activeClusters.size) {
            this.#node.deleteEndpoint(this.protocol);
        }
    }

    #updateDeviceTypes(deviceTypeList: Readonly<{ deviceType: DeviceTypeId }[]>) {
        this.protocol.deviceTypes = deviceTypeList.map(dt => dt.deviceType);
    }
}

class ClusterState implements ClusterProtocol {
    readonly type: ClusterTypeProtocol;
    readonly #datasource: Datasource;
    readonly #endpointId: EndpointNumber;
    readonly commands: Record<CommandId, CommandInvokeHandler> = {};

    constructor(type: ClusterTypeProtocol, backing: BehaviorBacking) {
        this.type = type;
        this.#datasource = backing.datasource;
        this.#endpointId = backing.endpoint.number;

        for (const cmd of type.commands) {
            this.commands[cmd.id] = (args, session) => invokeCommand(backing, cmd, args, session);
        }
    }

    get version() {
        return this.#datasource.version;
    }

    get location() {
        return this.#datasource.location;
    }

    readState(session: InteractionSession): Val.ProtocolStruct {
        return this.#datasource.reference(session as ValueSupervisor.Session);
    }

    async openForWrite(session: InteractionSession): Promise<Val.ProtocolStruct> {
        if (session.transaction === undefined) {
            throw new ImplementationError("Cluster protocol must be opened with a supervisor session");
        }
        await session.transaction.addResources(this.#datasource);
        await session.transaction.begin();
        return this.#datasource.reference(session as ValueSupervisor.Session);
    }

    toString() {
        return `cluster-proto#${this.#endpointId}:${this.type.id}`;
    }

    inspect() {
        return this.toString();
    }
}

const behaviorCache = new WeakMap<Behavior.Type, Map<string, ClusterTypeProtocol | undefined>>();

function clusterTypeProtocolOf(backing: BehaviorBacking): ClusterTypeProtocol | undefined {
    const behavior = backing.type;

    const { cluster, schema } = behavior as ClusterBehavior.Type;
    if (cluster === undefined || schema?.id === undefined) {
        return;
    }

    const supportedElements = backing.endpoint.behaviors.elementsOf(behavior);
    const nonMandatorySupportedAttributes = new Set<AttributeId>();
    const nonMandatorySupportedEvents = new Set<EventId>();
    const nonMandatorySupportedCommands = new Set<CommandId>();

    // Collect Attribute Metadata
    const attrDef = {} as Record<number, ClusterType.Attribute>;
    for (const attr of Object.values(cluster.attributes)) {
        attrDef[attr.id] = attr;
    }
    let wildcardPathFlags = schema.effectiveQuality.diagnostics ? WildcardPathFlags.skipDiagnosticsClusters : 0;
    if (schema.id & 0xffff0000) {
        wildcardPathFlags |= WildcardPathFlags.skipCustomElements;
    }
    const attrList = Array<AttributeTypeProtocol>();
    const attributes: CollectionProtocol<AttributeTypeProtocol> = {
        [Symbol.iterator]: attrList[Symbol.iterator].bind(attrList),
    };

    // Collect Event Metadata
    const eventDef = {} as Record<number, ClusterType.Event>;
    for (const ev of Object.values(cluster.events)) {
        eventDef[ev.id] = ev;
    }
    const eventList = Array<EventTypeProtocol>();
    const events: CollectionProtocol<EventTypeProtocol> = {
        [Symbol.iterator]: eventList[Symbol.iterator].bind(eventList),
    };

    // Collect Command Metadata
    const cmdDef = {} as Record<number, ClusterType.Command>;
    for (const cmd of Object.values(cluster.commands)) {
        cmdDef[cmd.requestId] = cmd;
    }
    const commandList = Array<CommandTypeProtocol>();
    const commands: CollectionProtocol<CommandTypeProtocol> = {
        [Symbol.iterator]: commandList[Symbol.iterator].bind(commandList),
    };

    // Collect all attributes and events from model and generate type protocol
    // TODO: Potentially combine the two searches again once the issue os fixed when selecting attributes and events
    for (const member of behavior.supervisor.membersOf(schema, {
        tags: [ElementTag.Attribute, ElementTag.Event, ElementTag.Command],
    })) {
        const { id, tag, effectiveQuality: quality } = member;

        if (id === undefined) {
            continue;
        }

        const name = camelize(member.name);
        switch (tag) {
            case "attribute": {
                if (!member.effectiveConformance.isMandatory && !supportedElements.attributes.has(name)) {
                    continue;
                }

                const tlv = attrDef[id]?.schema;
                if (tlv === undefined) {
                    continue;
                }

                let wildcardPathFlags;
                switch (id) {
                    case GeneratedCommandList.id:
                    case AcceptedCommandList.id:
                        wildcardPathFlags = WildcardPathFlags.skipGlobalAttributes | WildcardPathFlags.skipCommandLists;
                        break;

                    case AttributeList.id:
                        wildcardPathFlags =
                            WildcardPathFlags.skipGlobalAttributes | WildcardPathFlags.skipAttributeList;
                        break;

                    default:
                        wildcardPathFlags = 0;
                        break;
                }

                if (id & 0xffff0000) {
                    wildcardPathFlags |= WildcardPathFlags.skipGlobalAttributes;
                }
                if (quality.fixed) {
                    wildcardPathFlags |= WildcardPathFlags.skipFixedAttributes;
                }
                if (quality.changesOmitted) {
                    wildcardPathFlags |= WildcardPathFlags.skipChangesOmittedAttributes;
                }

                const {
                    access: { limits },
                } = behavior.supervisor.get(member);
                const {
                    changesOmitted,
                    effectiveQuality: { quieter },
                } = member;

                const attr: AttributeTypeProtocol = {
                    id: id as AttributeId,
                    tlv,
                    wildcardPathFlags,
                    limits,
                    name,
                };
                if (changesOmitted) {
                    attr.changesOmitted = true;
                }
                if (quieter) {
                    attr.quieter = true;
                }
                attrList.push(attr);
                attributes[id] = attr;
                if (!member.effectiveConformance.isMandatory) {
                    nonMandatorySupportedAttributes.add(id as AttributeId);
                }
                break;
            }
            case "event": {
                if (!member.effectiveConformance.isMandatory && !supportedElements.events.has(name)) {
                    continue;
                }

                const tlv = eventDef[id]?.schema;
                if (tlv === undefined) {
                    continue;
                }

                const {
                    access: { limits },
                } = behavior.supervisor.get(member);

                const event = { id: id as EventId, tlv, limits, name };
                eventList.push(event);
                events[id] = event;
                if (!member.effectiveConformance.isMandatory) {
                    nonMandatorySupportedEvents.add(id as EventId);
                }
                break;
            }
            case "command": {
                if (
                    (!member.effectiveConformance.isMandatory && !supportedElements.commands.has(name)) ||
                    !member.isRequest
                ) {
                    continue;
                }

                const def = cmdDef[id];
                if (def === undefined) {
                    continue;
                }
                const { requestSchema: requestTlv, responseSchema: responseTlv, responseId } = def;

                const {
                    access: { limits },
                } = behavior.supervisor.get(member);

                const command = { id: id as CommandId, responseId, requestTlv, responseTlv, limits, name };
                commandList.push(command);
                commands[id] = command;
                if (!member.effectiveConformance.isMandatory) {
                    nonMandatorySupportedCommands.add(id as CommandId);
                }
                break;
            }
        }
    }

    const elementsCacheKey = `a:${[...nonMandatorySupportedAttributes.values()].sort().join(",")},e:${[...nonMandatorySupportedEvents.values()].sort().join(",")},c:${[...nonMandatorySupportedCommands.values()].sort().join(",")}`;
    const existingCache = behaviorCache.get(behavior)?.get(elementsCacheKey);
    if (existingCache) {
        return existingCache;
    }

    const descriptor: ClusterTypeProtocol = {
        id: schema.id as ClusterId,
        name: schema.name,
        attributes,
        events,
        commands,
        wildcardPathFlags,
    };
    const elementCache = behaviorCache.get(behavior) ?? new Map();
    elementCache.set(elementsCacheKey, descriptor);
    behaviorCache.set(behavior, elementCache);

    return descriptor;
}

/**
 * Invokes a command on a backing behavior
 */
function invokeCommand(
    backing: BehaviorBacking,
    command: CommandTypeProtocol,
    request: Val.Struct | undefined,
    session: InteractionSession,
): MaybePromise<Val.Struct | undefined> {
    if (session.transaction === undefined) {
        throw new ImplementationError("Cluster protocol must be opened with a supervisor session");
    }

    let requestDiagnostic: unknown;
    if (isObject(request)) {
        requestDiagnostic = Diagnostic.dict(request);
    } else if (request !== undefined) {
        requestDiagnostic = request;
    } else {
        requestDiagnostic = Diagnostic.weak("(no payload)");
    }

    const { path, endpoint } = backing;
    const context = session as ActionContext;

    logger.info(
        "Invoke «",
        Diagnostic.strong(`${path.toString()}.${command.name}`),
        session.transaction.via,
        requestDiagnostic,
    );

    const agent = endpoint.agentFor(context);
    const behavior = agent.get(backing.type);

    let isAsync = false;
    let activity: undefined | Disposable;
    let result: unknown;
    const { name } = command;
    try {
        activity = hasRemoteActor(context) ? context.activity?.frame(`invoke ${name}`) : undefined;

        const invoke = (behavior as unknown as Record<string, (arg: unknown) => unknown>)[camelize(name)].bind(
            behavior,
        );

        // Lock if necessary, then invoke
        if ((behavior.constructor as ClusterBehavior.Type).lockOnInvoke) {
            const tx = session.transaction;
            if (Transaction.Resource.isLocked(behavior)) {
                // Automatic locking with locked resource; requires async lock acquisition
                result = (async function invokeAsync() {
                    await tx.addResources(behavior);
                    await tx.begin();
                    return invoke(request);
                })();
            } else {
                // Automatic locking on unlocked resource; may proceed synchronously
                tx.addResourcesSync(behavior);
                tx.beginSync();
                result = invoke(request);
            }
        } else {
            // Automatic locking disabled
            result = invoke(request);
        }

        if (MaybePromise.is(result)) {
            isAsync = true;
            result = Promise.resolve(result)
                .then(result => {
                    if (isObject(result)) {
                        logger.debug(
                            "Invoke result",
                            Diagnostic.strong(`${path.toString()}.${command.name}`),
                            session.transaction!.via,
                            Diagnostic.dict(result),
                        );
                    }
                    return result;
                })
                .finally(() => activity?.[Symbol.dispose]());
        } else {
            if (isObject(result)) {
                logger.debug(
                    "Invoke result",
                    Diagnostic.strong(`${path.toString()}.${command.name}`),
                    session.transaction.via,
                    Diagnostic.dict(result),
                );
            }
        }
    } finally {
        if (!isAsync) {
            activity?.[Symbol.dispose]();
        }
    }

    return result as MaybePromise<Val.Struct | undefined>;
}

/**
 * Resolve a path into a human readable textual form for logging
 * TODO: Add a Diagnostic display formatter for this
 */
function resolvePathForNode(node: NodeProtocol, path: AttributePath | EventPath | CommandPath) {
    const { endpointId, clusterId } = path;
    const isUrgentString = "isUrgent" in path && path.isUrgent ? "!" : "";
    const listIndexString = "listIndex" in path && path.listIndex === null ? "[ADD]" : "";
    const postString = `${listIndexString}${isUrgentString}`;

    const elementId =
        "attributeId" in path
            ? path.attributeId
            : "eventId" in path
              ? path.eventId
              : "commandId" in path
                ? path.commandId
                : undefined;

    if (endpointId === undefined) {
        return `*.${toWildcardOrHexPath("", clusterId)}.${toWildcardOrHexPath("", elementId)}${postString}`;
    }

    const endpoint = node[endpointId];
    if (endpoint === undefined) {
        return `${toWildcardOrHexPath("?", endpointId)}.${toWildcardOrHexPath("", clusterId)}.${toWildcardOrHexPath("", elementId)}${postString}`;
    }
    const endpointName = toWildcardOrHexPath(endpoint.name, endpointId);

    if (clusterId === undefined) {
        return `${endpointName}.*.${toWildcardOrHexPath("", elementId)}${postString}`;
    }

    const cluster = endpoint[clusterId];
    if (cluster === undefined) {
        return `${endpointName}.${toWildcardOrHexPath("?", clusterId)}.${toWildcardOrHexPath("", elementId)}${postString}`;
    }
    const clusterName = toWildcardOrHexPath(cluster.type.name, clusterId);

    if (elementId !== undefined) {
        if ("eventId" in path) {
            const event = cluster.type.events[elementId];
            return `${endpointName}.${clusterName}.${toWildcardOrHexPath(event?.name ?? "?", elementId)}${postString}`;
        } else if ("attributeId" in path) {
            const attribute = cluster.type.attributes[elementId];
            return `${endpointName}.${clusterName}.${toWildcardOrHexPath(attribute?.name ?? "?", elementId)}${postString}`;
        } else if ("commandId" in path) {
            const command = cluster.type.commands[elementId];
            return `${endpointName}.${clusterName}.${toWildcardOrHexPath(command?.name ?? "?", elementId)}${postString}`;
        } else {
            throw new ImplementationError("Invalid path");
        }
    } else {
        return `${endpointName}.${clusterName}.*${postString}`;
    }
}
