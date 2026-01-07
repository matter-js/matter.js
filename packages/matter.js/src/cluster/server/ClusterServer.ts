/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { capitalize, Diagnostic, ImplementationError, InternalError, Logger, MaybePromise } from "#general";
import { AccessLevel } from "#model";
import { Fabric } from "#protocol";
import {
    AttributeId,
    BitSchema,
    ClusterId,
    ClusterType,
    CommandId,
    ConditionalFeatureList,
    EventId,
    TlvNoResponse,
    TypeFromPartialBitSchema,
} from "#types";
import { Endpoint } from "../../device/Endpoint.js";
import { createAttributeServer } from "./AttributeServer.js";
import { ClusterDatasource } from "./ClusterDatasource.js";
import {
    AttributeInitialValues,
    AttributeServers,
    ClusterServerHandlers,
    ClusterServerObj,
    CommandServers,
    EventServers,
    SupportedEventsList,
} from "./ClusterServerTypes.js";
import { CommandServer } from "./CommandServer.js";
import { createEventServer } from "./EventServer.js";

const logger = Logger.get("ClusterServer");

function isConditionMatching<F extends BitSchema, SF extends TypeFromPartialBitSchema<F>>(
    featureSets: ConditionalFeatureList<F>,
    supportedFeatures: SF,
): boolean {
    for (const features of featureSets) {
        if (Object.keys(features).every(feature => !!features[feature] === !!supportedFeatures[feature])) {
            return true;
        }
    }
    return false;
}

/**
 * A collection of servers for a cluster's attributes, commands and events.
 */
export interface ClusterServer<T extends ClusterType = ClusterType> {
    /**
     * Cluster ID
     */
    id: ClusterId;

    /**
     * Cluster name
     */
    readonly name: string;

    /**
     * Cluster datasource
     */
    datasource?: ClusterDatasource;

    /**
     * Cluster attributes as named object that can be used to programmatically work with available attributes
     */
    readonly attributes: AttributeServers<T["attributes"]>;

    /**
     * Cluster commands as array
     */
    readonly commands: CommandServers<T["commands"]>;

    /**
     * Cluster events as named object
     */
    readonly events: EventServers<T["events"]>;
}

// Note - template parameter H should not be necessary but works around TS (as of 5.4) bug
export function ClusterServer<const T extends ClusterType, const H extends ClusterServerHandlers<T>>(
    clusterDef: T,
    attributesInitialValues: AttributeInitialValues<T["attributes"]>,
    handlers: H,
    supportedEvents: SupportedEventsList<T["events"]> = <SupportedEventsList<T["events"]>>{},
    ignoreMissingElements = false,
): ClusterServerObj<T> {
    const {
        id: clusterId,
        name,
        commands: commandDef,
        attributes: attributeDef,
        events: eventDef,
        supportedFeatures,
    } = clusterDef;
    let datasource: ClusterDatasource | undefined;
    const sceneAttributeList = new Array<string>();
    const attributes = <AttributeServers<T["attributes"]>>{};
    const commands = <CommandServers<T["commands"]>>{};
    const events = <EventServers<T["events"]>>{};
    let assignedEndpoint: Endpoint | undefined = undefined;

    // We pass a proxy into attribute servers so we can swap out our datasource without updating all servers
    //
    // There should always be a datasource when the server is online, so if there is no datasource we just report
    // version as 0 rather than assigning a random version that will be overwritten when we receive a datasource
    const datasourceProxy: ClusterDatasource = {
        get version() {
            return datasource?.version ?? 0;
        },

        get eventHandler() {
            return datasource?.eventHandler;
        },

        get fabrics() {
            return datasource?.fabrics ?? [];
        },

        increaseVersion() {
            return datasource?.increaseVersion() ?? 0;
        },

        changed(key, value) {
            datasource?.changed(key, value);
        },
    };

    const result: any = {
        id: clusterId,
        name,
        _type: "ClusterServer",
        attributes,
        commands: commands,
        events: events,

        get datasource() {
            return datasource;
        },

        set datasource(newDatasource: ClusterDatasource | undefined) {
            // This is not legal but TS requires setters to accept getter type
            if (newDatasource === undefined) {
                throw new InternalError("Cluster datasource cannot be unset");
            }

            datasource = newDatasource;

            if (assignedEndpoint === undefined) {
                throw new InternalError(
                    "The Endpoint always needs to be existing before storage is initialized for an Endpoint.",
                );
            }

            if (typeof handlers.initializeClusterServer === "function") {
                handlers.initializeClusterServer({
                    attributes,
                    events,
                    endpoint: assignedEndpoint,
                });
            }

            if (datasource.eventHandler) {
                for (const eventName in events) {
                    const bindResult = (events as any)[eventName].bindToEventHandler(datasource.eventHandler);
                    if (bindResult !== undefined && MaybePromise.is(bindResult)) {
                        throw new InternalError("Binding events to event handler should never return a promise");
                    }
                }
            }
        },

        _assignToEndpoint: (endpoint: Endpoint) => {
            for (const name in attributes) {
                (attributes as any)[name].assignToEndpoint(endpoint);
            }
            for (const name in events) {
                (events as any)[name].assignToEndpoint(endpoint);
            }
            assignedEndpoint = endpoint;
        },

        _close: () => {
            if (typeof handlers.destroyClusterServer === "function") {
                handlers.destroyClusterServer();
            }
        },

        isAttributeSupported: (attributeId: AttributeId) => {
            return (attributes as any).attributeList.getLocal().includes(attributeId);
        },

        isAttributeSupportedByName: (attributeName: string) => {
            return (attributesInitialValues as any)[attributeName] !== undefined;
        },

        isEventSupported: (eventId: EventId) => {
            return eventList.includes(eventId);
        },

        isEventSupportedByName: (eventName: string) => {
            return (supportedEvents as any)[eventName] === true;
        },

        isCommandSupported: (commandId: CommandId) => {
            return (attributes as any).acceptedCommandList.getLocal().includes(commandId);
        },

        isCommandSupportedByName: (commandName: string) => {
            return (commands as any)[commandName] !== undefined;
        },
    };

    // Create attributes
    attributesInitialValues = {
        ...attributesInitialValues,
        clusterRevision: clusterDef.revision,
        featureMap: supportedFeatures,
        attributeList: new Array<AttributeId>(),
        acceptedCommandList: new Array<CommandId>(),
        generatedCommandList: new Array<CommandId>(),
    };

    const attributeList = new Array<AttributeId>();
    for (const attributeName in attributeDef) {
        const capitalizedAttributeName = capitalize(attributeName);

        // logger.info(`check this for REQUIRED Attributes ${Diagnostic.json(attributeName)}`)
        if (attributeDef[attributeName].isConditional) {
            const { mandatoryIf, optionalIf } = attributeDef[attributeName];
            let conditionHasMatched = false;
            if (mandatoryIf !== undefined && mandatoryIf.length > 0) {
                // Check if mandatoryIf is relevant for current feature combination and the attribute initial value is set
                const conditionMatched = isConditionMatching(mandatoryIf, supportedFeatures);
                if (conditionMatched && (attributesInitialValues as any)[attributeName] === undefined) {
                    logger.warn(
                        `InitialAttributeValue for "${
                            clusterDef.name
                        }/${attributeName}" is REQUIRED by supportedFeatures: ${Diagnostic.json(
                            supportedFeatures,
                        )} but is not set!`,
                    );
                }
                conditionHasMatched = conditionHasMatched || conditionMatched;
            }
            // TODO Remove optional info/checks
            if (!conditionHasMatched && optionalIf !== undefined && optionalIf.length > 0) {
                const conditionMatched = isConditionMatching(optionalIf, supportedFeatures);
                if (conditionMatched && (attributesInitialValues as any)[attributeName] === undefined) {
                    logger.debug(
                        `InitialAttributeValue for "${
                            clusterDef.name
                        }/${attributeName}" is optional by supportedFeatures: ${Diagnostic.json(
                            supportedFeatures,
                        )} and is not set!`,
                    );
                }
                conditionHasMatched = conditionHasMatched || conditionMatched;
            }

            if (!conditionHasMatched && (attributesInitialValues as any)[attributeName] !== undefined) {
                logger.warn(
                    `InitialAttributeValue for "${
                        clusterDef.name
                    }/${attributeName}" is provided but it's neither optional or mandatory for supportedFeatures: ${Diagnostic.json(
                        supportedFeatures,
                    )} but is set!`,
                );
            }
        }

        const { id, persistent, fabricScoped, scene, fixed } = attributeDef[attributeName];
        if ((attributesInitialValues as any)[attributeName] !== undefined) {
            // Get the handlers for this attribute if present
            const getter = (handlers as any)[`${attributeName}AttributeGetter`];
            const setter = (handlers as any)[`${attributeName}AttributeSetter`];
            const validator = (handlers as any)[`${attributeName}AttributeValidator`];

            (attributes as any)[attributeName] = createAttributeServer(
                clusterDef,
                attributeDef[attributeName],
                attributeName,
                (attributesInitialValues as any)[attributeName],
                datasourceProxy,
                getter
                    ? (session, endpoint, isFabricFiltered, message) =>
                          getter({
                              attributes,
                              endpoint,
                              session,
                              isFabricFiltered,
                              message,
                          })
                    : undefined,
                setter
                    ? (value, session, endpoint, message) =>
                          setter(value, {
                              attributes,
                              endpoint,
                              session,
                              message,
                          })
                    : undefined,
                validator
                    ? (value, session, endpoint) =>
                          validator(value, {
                              attributes,
                              endpoint,
                              session,
                          })
                    : undefined,
            );

            // Add the relevant convenient methods to the ClusterServerObj
            if (fixed) {
                result[`get${capitalizedAttributeName}Attribute`] = () => (attributes as any)[attributeName].getLocal();
            } else if (fabricScoped) {
                result[`get${capitalizedAttributeName}Attribute`] = (fabric: Fabric) =>
                    (attributes as any)[attributeName].getLocalForFabric(fabric);
                result[`set${capitalizedAttributeName}Attribute`] = <T>(value: T, fabric: Fabric) =>
                    (attributes as any)[attributeName].setLocalForFabric(value, fabric);
                result[`subscribe${capitalizedAttributeName}Attribute`] = <T>(
                    listener: (newValue: T, oldValue: T) => void,
                ) => (attributes as any)[attributeName].addValueSetListener(listener);
            } else {
                if (scene) {
                    sceneAttributeList.push(attributeName);
                }
                result[`get${capitalizedAttributeName}Attribute`] = () => (attributes as any)[attributeName].getLocal();
                result[`set${capitalizedAttributeName}Attribute`] = <T>(value: T) =>
                    (attributes as any)[attributeName].setLocal(value);
                result[`subscribe${capitalizedAttributeName}Attribute`] = <T>(
                    listener: (newValue: T, oldValue: T) => void,
                ) => (attributes as any)[attributeName].addValueSetListener(listener);
            }
            if (persistent || getter || setter) {
                const listener = (value: any) =>
                    datasource?.changed(attributeName, fabricScoped || getter || setter ? undefined : value);
                (attributes as any)[attributeName].addValueChangeListener(listener);
            }
            attributeList.push(AttributeId(id));
        } else {
            // TODO: Find maybe a better way to do this including strong typing according to attribute initial values set?
            result[`get${capitalizedAttributeName}Attribute`] = () => undefined;
            if (!fixed) {
                result[`set${capitalizedAttributeName}Attribute`] = () => {
                    throw new ImplementationError(
                        `Attribute ${attributeName} is optional and not initialized. To use it please initialize it first.`,
                    );
                };
                result[`subscribe${capitalizedAttributeName}Attribute`] = () => {
                    throw new ImplementationError(
                        `Attribute ${attributeName} is optional and not initialized. To use it please initialize it first.`,
                    );
                };
            }
        }
    }
    (attributes as any).attributeList.setLocal(attributeList.sort((a, b) => a - b));

    // Create commands
    const acceptedCommandList = new Array<CommandId>();
    const generatedCommandList = new Array<CommandId>();
    for (const name in commandDef) {
        const handler = (handlers as any)[name];

        if (commandDef[name].isConditional) {
            const { mandatoryIf, optionalIf } = commandDef[name];
            let conditionHasMatched = false;
            if (mandatoryIf !== undefined && mandatoryIf.length > 0) {
                const conditionMatched = isConditionMatching(mandatoryIf, supportedFeatures);
                if (conditionMatched && handler === undefined) {
                    logger.warn(
                        `Command "${clusterDef.name}/${name}" is REQUIRED by supportedFeatures: ${Diagnostic.json(
                            supportedFeatures,
                        )} but is not set!`,
                    );
                }
                conditionHasMatched = conditionHasMatched || conditionMatched;
            }
            // TODO Remove optional info/checks
            if (!conditionHasMatched && optionalIf !== undefined && optionalIf.length > 0) {
                const conditionMatched = isConditionMatching(optionalIf, supportedFeatures);
                if (conditionMatched && handler === undefined) {
                    logger.debug(
                        `Command "${clusterDef.name}/${name}" is optional by supportedFeatures: ${Diagnostic.json(
                            supportedFeatures,
                        )} and is not set!`,
                    );
                }
                conditionHasMatched = conditionHasMatched || conditionMatched;
            }

            if (!conditionHasMatched && handler !== undefined) {
                logger.warn(
                    `Command "${
                        clusterDef.name
                    }/${name}" is provided but it's neither optional nor mandatory for supportedFeatures: ${Diagnostic.json(
                        supportedFeatures,
                    )} but is set!`,
                );
            }
        }

        if (handler === undefined) continue;
        const { requestId, requestSchema, responseId, responseSchema, timed, invokeAcl } = commandDef[name];
        (commands as any)[name] = new CommandServer(
            requestId,
            responseId,
            name,
            requestSchema,
            responseSchema,
            timed,
            invokeAcl ?? AccessLevel.Operate, //????
            (request, session, message, endpoint) =>
                handler({
                    request,
                    attributes,
                    events,
                    session,
                    message,
                    endpoint,
                }),
        );
        if (!acceptedCommandList.includes(requestId)) {
            acceptedCommandList.push(requestId);
        }
        if (responseSchema !== TlvNoResponse) {
            if (!generatedCommandList.includes(responseId)) {
                generatedCommandList.push(responseId);
            }
        }
    }
    (attributes as any).acceptedCommandList.setLocal(acceptedCommandList.sort((a, b) => a - b));
    (attributes as any).generatedCommandList.setLocal(generatedCommandList.sort((a, b) => a - b));

    const eventList = new Array<EventId>();
    for (const eventName in eventDef) {
        const { id, schema, priority, optional, readAcl } = eventDef[eventName];
        if (!optional && (supportedEvents as any)[eventName] !== true) {
            if (!ignoreMissingElements) {
                throw new ImplementationError(
                    `Event ${eventName} needs be supported by cluster ${name} (${clusterId})`,
                );
            }
            logger.warn(
                `Event ${eventName} should be supported by cluster ${name} (${clusterId}) but not present and ignored.`,
            );
            continue;
        }

        if (eventDef[eventName].isConditional) {
            const { mandatoryIf, optionalIf } = eventDef[eventName];
            let conditionHasMatched = false;
            if (mandatoryIf !== undefined) {
                const conditionMatched = isConditionMatching(mandatoryIf, supportedFeatures);
                if (conditionMatched && (supportedEvents as any)[eventName] === undefined) {
                    logger.warn(
                        `Event "${clusterDef.name}/${eventName}" is REQUIRED by supportedFeatures: ${Diagnostic.json(
                            supportedFeatures,
                        )} but is not set!`,
                    );
                }
                conditionHasMatched = conditionHasMatched || conditionMatched;
            }
            // TODO Remove optional info/checks
            if (!conditionHasMatched && optionalIf !== undefined && optionalIf.length > 0) {
                const conditionMatched = isConditionMatching(optionalIf, supportedFeatures);
                if (conditionMatched && (supportedEvents as any)[eventName] === undefined) {
                    logger.debug(
                        `Event "${clusterDef.name}/${eventName}" is optional by supportedFeatures: ${Diagnostic.json(
                            supportedFeatures,
                        )} and is not set!`,
                    );
                }
                conditionHasMatched = conditionHasMatched || conditionMatched;
            }

            if (!conditionHasMatched && (supportedEvents as any)[eventName] !== undefined) {
                logger.warn(
                    `Event "${
                        clusterDef.name
                    }/${eventName}" is provided but it's neither optional or mandatory for supportedFeatures: ${Diagnostic.json(
                        supportedFeatures,
                    )} but is set!`,
                );
            }
        }

        if ((supportedEvents as any)[eventName] === true) {
            (events as any)[eventName] = createEventServer(
                clusterDef,
                eventDef[eventName],
                eventName,
                schema,
                priority,
                readAcl,
            );
            const capitalizedEventName = capitalize(eventName);
            result[`trigger${capitalizedEventName}Event`] = <T>(event: T) =>
                (events as any)[eventName].triggerEvent(event);
            eventList.push(id);
        }
    }

    return result as ClusterServerObj<T>;
}
