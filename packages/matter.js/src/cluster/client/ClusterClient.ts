/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { capitalize, Diagnostic, Duration, ImplementationError, Logger } from "@matter/general";
import { AttributeModel } from "@matter/model";
import { ClusterClientObj, DecodedEventData } from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    ClusterType,
    CommandId,
    EndpointNumber,
    EventId,
    StatusCode,
    StatusResponseError,
    TlvEventFilter,
    TlvOfModel,
    TypeFromSchema,
} from "@matter/types";
import { TlvVoid } from "@matter/types/tlv";
import { createAttributeClient } from "./AttributeClient.js";
import { createEventClient } from "./EventClient.js";
import { InteractionClient } from "./InteractionClient.js";

const logger = Logger.get("ClusterClient");

export function GroupClusterClient<const N extends ClusterType.Concrete>(
    clusterDef: N,
    interactionClient: InteractionClient,
    globalAttributeValues?: Record<string, unknown>,
): ClusterClientObj<N["Typing"]>;

export function GroupClusterClient(
    clusterDef: ClusterType.Concrete,
    interactionClient: InteractionClient,
    globalAttributeValues: Record<string, unknown> = {},
): ClusterClientObj {
    if (!interactionClient.isGroupAddress) {
        throw new Error("GroupClusterClient must be used with a GroupAddress InteractionClient");
    }

    return ClusterClient(clusterDef as any, undefined, interactionClient, globalAttributeValues) as any;
}

export function ClusterClient<const N extends ClusterType.Concrete>(
    clusterDef: N,
    endpointId: EndpointNumber | undefined,
    interactionClient: InteractionClient,
    globalAttributeValues?: Record<string, unknown>,
): ClusterClientObj<N["Typing"]>;

export function ClusterClient(
    clusterDef: ClusterType.Concrete,
    endpointId: EndpointNumber | undefined,
    interactionClient: InteractionClient,
    globalAttributeValues: any = {},
): ClusterClientObj {
    // After factory swap, ClusterType() returns namespace-shaped objects at runtime
    const ns = clusterDef as ClusterType.Concrete;
    const isGroupAddress = interactionClient.isGroupAddress;
    if (isGroupAddress !== (endpointId === undefined)) {
        throw new Error("Endpoint ID must be defined for a Non-Group ClusterClient");
    }

    const clusterId = ns.id;
    const name = ns.name;
    const model = ns.schema;
    const revisionAttr = model.attributes(0xfffd);
    const revision = typeof revisionAttr?.default === "number" ? revisionAttr.default : 1;

    function addAttributeToResult(attribute: ClusterType.Attribute, attributeName: string, unknown = false) {
        (attributes as any)[attributeName] = createAttributeClient(
            attribute,
            attributeName,
            endpointId,
            clusterId,
            interactionClient,
            !!globalAttributeValues?.attributeList?.includes(attribute.id),
            unknown,
        );
        (attributes as any)[attribute.id] = (attributes as any)[attributeName];
        attributeToId[attribute.id] = attributeName;
        const capitalizedAttributeName = capitalize(attributeName);
        result[`get${capitalizedAttributeName}Attribute`] = async (
            requestFromRemote?: boolean,
            isFabricFiltered = true,
        ) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support reading attributes");
            }

            try {
                return await (attributes as any)[attributeName].get(requestFromRemote, isFabricFiltered);
            } catch (e) {
                if (StatusResponseError.is(e, StatusCode.UnsupportedAttribute)) {
                    return undefined;
                }
                throw e;
            }
        };
        result[`get${capitalizedAttributeName}AttributeFromCache`] = () => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support reading attributes");
            }

            return (attributes as any)[attributeName].getLocal();
        };
        result[`set${capitalizedAttributeName}Attribute`] = async <T>(value: T, dataVersion?: number) =>
            (attributes as any)[attributeName].set(value, dataVersion);
        result[`subscribe${capitalizedAttributeName}Attribute`] = async <T>(
            listener: (value: T) => void,
            minIntervalS: number,
            maxIntervalS: number,
            knownDataVersion?: number,
            isFabricFiltered?: boolean,
        ) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support subscribing attributes");
            }

            (attributes as any)[attributeName].addListener(listener);
            return (attributes as any)[attributeName].subscribe(
                minIntervalS,
                maxIntervalS,
                knownDataVersion,
                isFabricFiltered,
            );
        };
        result[`add${capitalizedAttributeName}AttributeListener`] = <T>(listener: (value: T) => void) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support subscribing attributes");
            }

            (attributes as any)[attributeName].addListener(listener);
        };
        result[`remove${capitalizedAttributeName}AttributeListener`] = <T>(listener: (value: T) => void) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support subscribing attributes");
            }

            (attributes as any)[attributeName].removeListener(listener);
        };
    }

    function addEventToResult(event: ClusterType.Event, eventName: string) {
        (events as any)[eventName] = createEventClient(event, eventName, endpointId, clusterId, interactionClient);
        (events as any)[event.id] = (events as any)[eventName];
        eventToId[event.id] = eventName;
        const capitalizedEventName = capitalize(eventName);
        result[`get${capitalizedEventName}Event`] = async (
            minimumEventNumber?: number | bigint,
            isFabricFiltered?: boolean,
        ) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support reading events");
            }

            try {
                return await (events as any)[eventName].get(minimumEventNumber, isFabricFiltered);
            } catch (e) {
                if (StatusResponseError.is(e, StatusCode.UnsupportedEvent)) {
                    return undefined;
                }
                throw e;
            }
        };
        result[`subscribe${capitalizedEventName}Event`] = async <T>(
            listener: (value: DecodedEventData<T>) => void,
            minIntervalS: number,
            maxIntervalS: number,
            isUrgent?: boolean,
            minimumEventNumber?: number | bigint,
            isFabricFiltered?: boolean,
        ) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support subscribing to events");
            }

            (events as any)[eventName].addListener(listener);
            return (events as any)[eventName].subscribe(
                minIntervalS,
                maxIntervalS,
                isUrgent,
                minimumEventNumber,
                isFabricFiltered,
            );
        };
        result[`add${capitalizedEventName}EventListener`] = <T>(listener: (value: DecodedEventData<T>) => void) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support subscribing events");
            }

            (events as any)[eventName].addListener(listener);
        };
        result[`remove${capitalizedEventName}EventListener`] = <T>(listener: (value: DecodedEventData<T>) => void) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support subscribing events");
            }

            (events as any)[eventName].removeListener(listener);
        };
    }

    const attributes = <Record<string, any>>{};
    const events = <Record<string, any>>{};
    const commands: any = {};
    const nsAttrs = ns.attributes ?? {};
    const nsCmds = ns.commands ?? {};
    const nsEvts = ns.events ?? {};

    let reportedFeatures: any = undefined;
    if (globalAttributeValues !== undefined) {
        if (globalAttributeValues.featureMap !== undefined) {
            reportedFeatures = globalAttributeValues.featureMap;
        }
    }

    const result: any = {
        id: clusterId,
        name,
        revision: globalAttributeValues?.clusterRevision ?? revision,
        _type: "ClusterClient",
        supportedFeatures: reportedFeatures ?? {},
        isUnknown: false,
        endpointId,
        attributes,
        events,
        commands,
        subscribeAllAttributes: async (options: {
            minIntervalFloorSeconds: number;
            maxIntervalCeilingSeconds: number;
            keepSubscriptions?: boolean;
            isFabricFiltered?: boolean;
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
        }) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not support subscribing attributes");
            }

            const {
                minIntervalFloorSeconds,
                maxIntervalCeilingSeconds,
                keepSubscriptions,
                isFabricFiltered,
                eventFilters,
                dataVersionFilters,
            } = options;

            return interactionClient.subscribeMultipleAttributesAndEvents({
                attributes: [{ endpointId: endpointId, clusterId: clusterId }],
                events: [{ endpointId: endpointId, clusterId: clusterId }],
                minIntervalFloorSeconds,
                maxIntervalCeilingSeconds,
                keepSubscriptions,
                isFabricFiltered,
                eventFilters,
                dataVersionFilters,
                attributeListener: attributeData => {
                    const { path, value } = attributeData;
                    result._triggerAttributeUpdate(path.attributeId, value);
                },
                eventListener: eventData => {
                    const { path, events: newEvents } = eventData;
                    result._triggerEventUpdate(path.eventId, newEvents);
                },
            });
        },

        _triggerAttributeUpdate(attributeId: AttributeId, value: any) {
            const attributeName = attributeToId[attributeId];
            if (attributeName === undefined) {
                logger.warn("Unknown attribute id", attributeId);
                return;
            }
            if ((attributes as any)[attributeName] !== undefined) {
                (attributes as any)[attributeName].update(value);
            } else {
                logger.warn("Attribute not found", attributeName, "in list", Object.keys(attributes));
            }
        },

        _triggerEventUpdate(eventId: EventId, eventData: DecodedEventData<any>[]) {
            const eventName = eventToId[eventId];
            if (eventName === undefined) {
                logger.warn("Unknown event id", eventId);
                return;
            }
            if ((events as any)[eventName] !== undefined) {
                const event = (events as any)[eventName];
                eventData.forEach(data => event.update(data));
            } else {
                logger.warn("Event not found", eventName, "in list", Object.keys(events));
            }
        },

        isAttributeSupported: (attributeId: AttributeId) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not allow to determine attribute existence.");
            }

            return !!globalAttributeValues?.attributeList?.includes(attributeId);
        },

        isAttributeSupportedByName: (attributeName: string) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not allow to determine attribute existence.");
            }

            const attribute = (attributes as any)[attributeName];
            if (attribute === undefined) {
                return false;
            }
            return !!globalAttributeValues?.attributeList?.includes(attribute.id);
        },

        isCommandSupported: (commandId: CommandId) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not allow to determine command existence.");
            }

            return !!globalAttributeValues?.acceptedCommandList?.includes(commandId);
        },

        isCommandSupportedByName: (commandName: string) => {
            if (isGroupAddress) {
                throw new ImplementationError("Group cluster clients do not allow to determine attribute existence.");
            }

            const cmd = nsCmds[commandName];
            if (cmd === undefined) {
                return false;
            }
            return !!globalAttributeValues?.acceptedCommandList?.includes(cmd.id);
        },
    };

    const attributeToId = <{ [key: AttributeId]: string }>{};

    // Add attribute accessors — use model attributes which include globals
    for (const attr of model.attributes) {
        if (attr.isDisallowed || attr.effectiveMetatype === undefined) {
            continue;
        }
        const attrName = attr.propertyName;
        const nsAttr: ClusterType.Attribute = nsAttrs[attrName] ?? {
            id: AttributeId(attr.id),
            name: attrName,
            schema: attr,
        };
        addAttributeToResult(nsAttr, attrName);
    }

    if (globalAttributeValues?.attributeList !== undefined) {
        // Add accessors for unknown attributes discovered at runtime
        for (const attributeId of globalAttributeValues.attributeList) {
            if (attributeToId[attributeId] === undefined) {
                const unknownModel = new AttributeModel({
                    id: attributeId,
                    name: `unknown_${attributeId}`,
                    access: "RW",
                });
                const nsAttr: ClusterType.Attribute = {
                    id: attributeId,
                    name: unknownModel.name,
                    schema: unknownModel,
                };
                addAttributeToResult(nsAttr, `unknownAttribute_${Diagnostic.hex(attributeId)}`, true);
            }
        }
    }

    const eventToId = <{ [key: EventId]: string }>{};

    for (const eventName in nsEvts) {
        addEventToResult(nsEvts[eventName], eventName);
    }

    const commandToId = <{ [key: CommandId]: string }>{};

    for (const commandName in nsCmds) {
        const cmd = nsCmds[commandName];
        const requestId = cmd.id;
        const isVoidRequest = TlvOfModel(cmd.schema) === TlvVoid;

        commandToId[requestId] = commandName;

        if (isVoidRequest) {
            // Void-request commands: first arg is options, not request payload
            (commands as any)[commandName] = async (
                options: {
                    asTimedRequest?: boolean;
                    timedRequestTimeout?: Duration;
                    expectedProcessingTime?: Duration;
                    useExtendedFailSafeMessageResponseTimeout?: boolean;
                } = {},
            ) => {
                const {
                    asTimedRequest,
                    timedRequestTimeout,
                    useExtendedFailSafeMessageResponseTimeout,
                    expectedProcessingTime,
                } = options;
                if (isGroupAddress) {
                    return interactionClient.invokeWithSuppressedResponse({
                        clusterId,
                        command: cmd,
                        request: undefined,
                        asTimedRequest,
                        timedRequestTimeout,
                    });
                }
                return interactionClient.invoke({
                    endpointId: endpointId!,
                    clusterId,
                    command: cmd,
                    request: undefined,
                    asTimedRequest,
                    timedRequestTimeout,
                    expectedProcessingTime,
                    useExtendedFailSafeMessageResponseTimeout,
                });
            };
        } else {
            (commands as any)[commandName] = async (
                request: any,
                options: {
                    asTimedRequest?: boolean;
                    timedRequestTimeout?: Duration;
                    expectedProcessingTime?: Duration;
                    useExtendedFailSafeMessageResponseTimeout?: boolean;
                } = {},
            ) => {
                const {
                    asTimedRequest,
                    timedRequestTimeout,
                    useExtendedFailSafeMessageResponseTimeout,
                    expectedProcessingTime,
                } = options;
                if (isGroupAddress) {
                    return interactionClient.invokeWithSuppressedResponse({
                        clusterId,
                        command: cmd,
                        request,
                        asTimedRequest,
                        timedRequestTimeout,
                    });
                }
                return interactionClient.invoke({
                    endpointId: endpointId!,
                    clusterId,
                    command: cmd,
                    request,
                    asTimedRequest,
                    timedRequestTimeout,
                    expectedProcessingTime,
                    useExtendedFailSafeMessageResponseTimeout,
                });
            };
        }

        (commands as any)[requestId] = (commands as any)[commandName];
        result[commandName] = result.commands[commandName];
    }

    return result as ClusterClientObj;
}
