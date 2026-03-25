/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Duration, OptionalKeys, RequiredKeys, WritableKeys } from "@matter/general";
import {
    AttributeId,
    ClusterId,
    ClusterNamespace,
    ClusterTyping,
    CommandId,
    EndpointNumber,
    EventId,
    EventNumber,
    TlvEventFilter,
    TypeFromSchema,
} from "@matter/types";
import { DecodedEventData } from "../../interaction/EventDataDecoder.js";

export interface AttributeClientObj<T = any> {
    readonly id: AttributeId;
    readonly attribute: ClusterNamespace.Attribute<T>;
    readonly name: string;
    readonly endpointId: EndpointNumber | undefined;
    readonly clusterId: ClusterId;
    readonly fabricScoped: boolean;
    set(value: T, dataVersion?: number): Promise<void>;
    getLocal(): T | undefined;
    get(requestFromRemote?: boolean, isFabricFiltered?: boolean): Promise<T | undefined>;
    subscribe(
        minIntervalFloorSeconds: number,
        maxIntervalCeilingSeconds: number,
        knownDataVersion?: number,
        isFabricFiltered?: boolean,
    ): Promise<{ maxInterval: number }>;
    update(value: T): void;
    addListener(listener: (newValue: T) => void): void;
    removeListener(listener: (newValue: T) => void): void;
}

export interface EventClientObj<T> {
    readonly id: EventId;
    readonly event: ClusterNamespace.Event<T>;
    readonly name: string;
    readonly endpointId: EndpointNumber | undefined;
    readonly clusterId: ClusterId;
    get(minimumEventNumber?: EventNumber, isFabricFiltered?: boolean): Promise<DecodedEventData<T>[] | undefined>;
    subscribe(
        minIntervalFloorSeconds: Duration,
        maxIntervalCeilingSeconds: Duration,
        isUrgent?: boolean,
        minimumEventNumber?: EventNumber,
        isFabricFiltered?: boolean,
    ): Promise<{ maxInterval: number }>;
    update(newEvent: DecodedEventData<T>): void;
    addListener(listener: (newValue: DecodedEventData<T>) => void): void;
    removeListener(listener: (newValue: DecodedEventData<T>) => void): void;
}

// --- Accessor types ---

/**
 * Command options shared by all client command invocations.
 */
export interface ClientCommandOptions {
    /** Send this command as a timed request also when not required. Default timeout are 10 seconds. */
    asTimedRequest?: boolean;

    /** Override the request timeout when the command is sent as times request. Default are 10s. */
    timedRequestTimeout?: Duration;

    /**
     * Expected processing time on the device side for this command.
     * useExtendedFailSafeMessageResponseTimeout is ignored if this value is set.
     */
    expectedProcessingTime?: Duration;

    /**
     * Use the extended fail-safe message response timeout of 30 seconds. Use this for all commands
     * executed during an activated FailSafe context!
     */
    useExtendedFailSafeMessageResponseTimeout?: boolean;
}

type ClientCommand<F> = F extends (...args: infer A) => infer Ret
    ? A extends [infer R, ...unknown[]]
        ? (request: R, options?: ClientCommandOptions) => Promise<Awaited<Ret>>
        : (options?: ClientCommandOptions) => Promise<Awaited<Ret>>
    : (options?: ClientCommandOptions) => Promise<void>;

type ClientCommands<C> = { [K in keyof C]: ClientCommand<C[K]> };

type ClientAttributeGetters<A> = {
    [K in RequiredKeys<A> & string as `get${Capitalize<K>}Attribute`]: (
        requestFromRemote?: boolean,
        isFabricFiltered?: boolean,
    ) => Promise<A[K]>;
} & {
    [K in OptionalKeys<A> as `get${Capitalize<K>}Attribute`]: (
        requestFromRemote?: boolean,
        isFabricFiltered?: boolean,
    ) => Promise<A[K] | undefined>;
};

type ClientLocalAttributeGetters<A> = {
    [K in RequiredKeys<A> & string as `get${Capitalize<K>}AttributeFromCache`]: () => A[K] | undefined;
} & {
    [K in OptionalKeys<A> as `get${Capitalize<K>}AttributeFromCache`]: () => A[K] | undefined;
};

type ClientAttributeSetters<A> = {
    [K in WritableKeys<A> & string as `set${Capitalize<K>}Attribute`]: (value: A[K]) => Promise<void>;
};

type ClientAttributeSubscribers<A> = {
    [K in keyof A & string as `subscribe${Capitalize<K>}Attribute`]: (
        listener: (value: A[K]) => void,
        minIntervalS: number,
        maxIntervalS: number,
        knownDataVersion?: number,
        isFabricFiltered?: boolean,
    ) => Promise<void>;
};

type ClientAttributeListeners<A> = {
    [K in keyof A & string as `add${Capitalize<K>}AttributeListener`]: (listener: (value: A[K]) => void) => void;
} & {
    [K in keyof A & string as `remove${Capitalize<K>}AttributeListener`]: (listener: (value: A[K]) => void) => void;
};

type ClientEventGetters<E> = {
    [K in keyof E & string as `get${Capitalize<K>}Event`]: (
        minimumEventNumber?: number | bigint,
        isFabricFiltered?: boolean,
    ) => Promise<DecodedEventData<E[K]>[]>;
};

type ClientEventSubscribers<E> = {
    [K in keyof E & string as `subscribe${Capitalize<K>}Event`]: (
        listener: (value: DecodedEventData<E[K]>) => void,
        minIntervalS: number,
        maxIntervalS: number,
        isUrgent?: boolean,
        minimumEventNumber?: number | bigint,
        isFabricFiltered?: boolean,
    ) => Promise<void>;
};

type ClientEventListeners<E> = {
    [K in keyof E & string as `add${Capitalize<K>}EventListener`]: (
        listener: (value: DecodedEventData<E[K]>) => void,
    ) => void;
} & {
    [K in keyof E & string as `remove${Capitalize<K>}EventListener`]: (
        listener: (value: DecodedEventData<E[K]>) => void,
    ) => void;
};

type AttributeClients<A> = {
    [K in RequiredKeys<A> & string]: AttributeClientObj<A[K]>;
} & {
    [K in OptionalKeys<A>]: AttributeClientObj<A[K] | undefined>;
} & Record<string, AttributeClientObj>;

type EventClients<E> = {
    [K in RequiredKeys<E> & string]: EventClientObj<E[K]>;
} & {
    [K in OptionalKeys<E>]: EventClientObj<E[K] | undefined>;
} & Record<string, EventClientObj<unknown>>;

type ClientCommandsRecord<C> = ClientCommands<C> & Record<string, (...args: any[]) => Promise<unknown>>;

// --- Main types ---

/**
 * Strongly typed interface of a cluster client.
 */
export type ClusterClientObj<N extends ClusterTyping = ClusterTyping> = {
    id: ClusterId;
    _type: "ClusterClient";
    readonly revision: number;
    readonly name: string;
    readonly isUnknown: boolean;
    readonly supportedFeatures: N["SupportedFeatures"];
    readonly attributes: AttributeClients<N["Attributes"]>;
    readonly endpointId: number;
    readonly events: EventClients<N["Events"]>;
    readonly commands: ClientCommandsRecord<N["Commands"]>;
    readonly subscribeAllAttributes: (options: {
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        keepSubscriptions?: boolean;
        isFabricFiltered?: boolean;
        eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
        dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
    }) => Promise<void>;
    isAttributeSupported: (attributeId: AttributeId) => boolean;
    isAttributeSupportedByName: (attributeName: string) => boolean;
    isCommandSupported: (commandId: CommandId) => boolean;
    isCommandSupportedByName: (commandName: string) => boolean;
} & ClientAttributeGetters<N["Attributes"]> &
    ClientLocalAttributeGetters<N["Attributes"]> &
    ClientAttributeSetters<N["Attributes"]> &
    ClientAttributeSubscribers<N["Attributes"]> &
    ClientAttributeListeners<N["Attributes"]> &
    ClientCommands<N["Commands"]> &
    ClientEventGetters<N["Events"]> &
    ClientEventSubscribers<N["Events"]> &
    ClientEventListeners<N["Events"]>;

export type ClusterClientObjInternal = ClusterClientObj & {
    /**
     * Trigger an attribute update. This is mainly used internally and not needed to be called by the user.
     * @private
     */
    readonly _triggerAttributeUpdate: (attributeId: AttributeId, value: any) => void;

    /**
     * Trigger an event update. This is mainly used internally and not needed to be called by the user.
     * @private
     */
    readonly _triggerEventUpdate: (eventId: EventId, events: DecodedEventData<any>[]) => void;
};
