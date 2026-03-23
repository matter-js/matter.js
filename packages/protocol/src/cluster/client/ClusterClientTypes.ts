/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Duration, OptionalKeys, RequiredKeys, WritableKeys } from "@matter/general";
import { Merge } from "@matter/general";
import {
    Attribute,
    AttributeId,
    AttributeJsType,
    Attributes,
    BitSchema,
    ClusterId,
    ClusterType,
    ClusterTyping,
    Command,
    CommandId,
    Commands,
    EndpointNumber,
    Event,
    EventId,
    EventNumber,
    EventType,
    Events,
    GlobalAttributeNames,
    GlobalAttributes,
    MandatoryAttributeNames,
    MandatoryEventNames,
    OptionalAttribute,
    OptionalAttributeNames,
    OptionalEventNames,
    OptionalWritableAttribute,
    RequestType,
    ResponseType,
    TlvEventFilter,
    TypeFromPartialBitSchema,
    TypeFromSchema,
    WritableAttribute,
} from "@matter/types";
import { DecodedEventData } from "../../interaction/EventDataDecoder.js";

export interface AttributeClientObj<T = any> {
    readonly id: AttributeId;
    readonly attribute: Attribute<T, any>;
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
    readonly event: Event<T, any>;
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

// --- Legacy ClusterType-parameterized helpers (used by ClusterClient factory) ---

export type AttributeClients<F extends BitSchema, A extends Attributes> = Merge<
    Merge<
        { [P in MandatoryAttributeNames<A>]: AttributeClientObj<AttributeJsType<A[P]>> },
        { [P in OptionalAttributeNames<A>]: AttributeClientObj<AttributeJsType<A[P]> | undefined> }
    >,
    { [P in GlobalAttributeNames<F>]: AttributeClientObj<AttributeJsType<GlobalAttributes<F>[P]>> }
>;

export type AttributeClientValues<A extends Attributes> = Merge<
    { [P in MandatoryAttributeNames<A>]: AttributeJsType<A[P]> },
    { [P in OptionalAttributeNames<A>]?: AttributeJsType<A[P]> }
>;

export type EventClients<E extends Events> = Merge<
    { [P in MandatoryEventNames<E>]: EventClientObj<EventType<E[P]>> },
    { [P in OptionalEventNames<E>]: EventClientObj<EventType<E[P]> | undefined> }
>;

export type SignatureFromCommandSpec<C extends Command<any, any, any>> = (
    request: RequestType<C>,
    options?: {
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
    },
) => Promise<ResponseType<C>>;

export type SignatureFromCommandSpecWithoutResponse<C extends Command<any, any, any>> = (
    request: RequestType<C>,
    options?: {
        /** Send this command as a timed request also when not required. Default timeout are 10 seconds. */
        asTimedRequest?: boolean;

        /** Override the request timeout when the command is sent as times request. Default are 10s. */
        timedRequestTimeoutMs?: number;

        /**
         * Expected processing time on the device side for this command.
         * useExtendedFailSafeMessageResponseTimeout is ignored if this value is set.
         */
        expectedProcessingTimeMs?: number;

        /**
         * Use the extended fail-safe message response timeout of 30 seconds. Use this for all commands
         * executed during an activated FailSafe context!
         */
        useExtendedFailSafeMessageResponseTimeout?: boolean;
    },
) => Promise<void>;

// Legacy accessor types (kept for ClusterType-parameterized factory code)
type GetterTypeFromSpec<A extends Attribute<any, any>> =
    A extends OptionalAttribute<infer T, any> ? T | undefined : AttributeJsType<A>;
type LegacyClientAttributeGetters<A extends Attributes> = Omit<
    {
        [P in keyof A as `get${Capitalize<string & P>}Attribute`]: (
            requestFromRemote?: boolean,
            isFabricFiltered?: boolean,
        ) => Promise<GetterTypeFromSpec<A[P]>>;
    },
    keyof GlobalAttributes<any>
>;
type LegacyClientLocalAttributeGetters<A extends Attributes> = Omit<
    {
        [P in keyof A as `get${Capitalize<string & P>}AttributeFromCache`]: () => GetterTypeFromSpec<A[P]> | undefined;
    },
    keyof GlobalAttributes<any>
>;
type LegacyClientGlobalAttributeGetters<F extends BitSchema> = {
    [P in GlobalAttributeNames<F> as `get${Capitalize<string & P>}Attribute`]: () => Promise<
        GetterTypeFromSpec<GlobalAttributes<F>[P]>
    >;
};
type WritableAttributeNames<A extends Attributes> =
    | { [K in keyof A]: A[K] extends WritableAttribute<any, any> ? K : never }[keyof A]
    | { [K in keyof A]: A[K] extends OptionalWritableAttribute<any, any> ? K : never }[keyof A];
type LegacyClientAttributeSetters<A extends Attributes> = {
    [P in WritableAttributeNames<A> as `set${Capitalize<string & P>}Attribute`]: (
        value: AttributeJsType<A[P]>,
    ) => Promise<void>;
};
type LegacyClientAttributeSubscribers<A extends Attributes> = {
    [P in keyof A as `subscribe${Capitalize<string & P>}Attribute`]: (
        listener: (value: AttributeJsType<A[P]>) => void,
        minIntervalS: number,
        maxIntervalS: number,
        knownDataVersion?: number,
        isFabricFiltered?: boolean,
    ) => Promise<void>;
};
type LegacyClientAttributeListeners<A extends Attributes> = {
    [P in keyof A as `add${Capitalize<string & P>}AttributeListener`]: (
        listener: (value: AttributeJsType<A[P]>) => void,
    ) => void;
} & {
    [P in keyof A as `remove${Capitalize<string & P>}AttributeListener`]: (
        listener: (value: AttributeJsType<A[P]>) => void,
    ) => void;
};
type LegacyCommandServers<C extends Commands> = { [P in keyof C]: SignatureFromCommandSpec<C[P]> };
type LegacyNoResponseCommandServers<C extends Commands> = {
    [P in keyof C]: SignatureFromCommandSpecWithoutResponse<C[P]>;
};
type LegacyClientEventGetters<E extends Events> = {
    [P in keyof E as `get${Capitalize<string & P>}Event`]: (
        minimumEventNumber?: number | bigint,
        isFabricFiltered?: boolean,
    ) => Promise<DecodedEventData<EventType<E[P]>>>;
};
type LegacyClientEventSubscribers<E extends Events> = {
    [P in keyof E as `subscribe${Capitalize<string & P>}Event`]: (
        listener: (value: DecodedEventData<EventType<E[P]>>) => void,
        minIntervalS: number,
        maxIntervalS: number,
        isUrgent?: boolean,
        minimumEventNumber?: number | bigint,
        isFabricFiltered?: boolean,
    ) => Promise<void>;
};
type LegacyClientEventListeners<E extends Events> = {
    [P in keyof E as `add${Capitalize<string & P>}EventListener`]: (
        listener: (value: DecodedEventData<EventType<E[P]>>) => void,
    ) => void;
} & {
    [P in keyof E as `remove${Capitalize<string & P>}EventListener`]: (
        listener: (value: DecodedEventData<EventType<E[P]>>) => void,
    ) => void;
};

// --- ClusterTyping-parameterized accessor types ---

/**
 * Command options shared by all legacy client command invocations.
 */
export interface LegacyClientCommandOptions {
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

type LegacyClientCommand<F> = F extends (...args: infer A) => infer Ret
    ? A extends [infer R, ...unknown[]]
        ? (request: R, options?: LegacyClientCommandOptions) => Promise<Awaited<Ret>>
        : (options?: LegacyClientCommandOptions) => Promise<Awaited<Ret>>
    : (options?: LegacyClientCommandOptions) => Promise<void>;

type TypedClientCommands<C> = { [K in keyof C]: LegacyClientCommand<C[K]> };

type TypedClientAttributeGetters<A> = {
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

type TypedClientLocalAttributeGetters<A> = {
    [K in RequiredKeys<A> & string as `get${Capitalize<K>}AttributeFromCache`]: () => A[K] | undefined;
} & {
    [K in OptionalKeys<A> as `get${Capitalize<K>}AttributeFromCache`]: () => A[K] | undefined;
};

type TypedClientAttributeSetters<A> = {
    [K in WritableKeys<A> & string as `set${Capitalize<K>}Attribute`]: (value: A[K]) => Promise<void>;
};

type TypedClientAttributeSubscribers<A> = {
    [K in keyof A & string as `subscribe${Capitalize<K>}Attribute`]: (
        listener: (value: A[K]) => void,
        minIntervalS: number,
        maxIntervalS: number,
        knownDataVersion?: number,
        isFabricFiltered?: boolean,
    ) => Promise<void>;
};

type TypedClientAttributeListeners<A> = {
    [K in keyof A & string as `add${Capitalize<K>}AttributeListener`]: (listener: (value: A[K]) => void) => void;
} & {
    [K in keyof A & string as `remove${Capitalize<K>}AttributeListener`]: (listener: (value: A[K]) => void) => void;
};

type TypedClientEventGetters<E> = {
    [K in keyof E & string as `get${Capitalize<K>}Event`]: (
        minimumEventNumber?: number | bigint,
        isFabricFiltered?: boolean,
    ) => Promise<DecodedEventData<E[K]>[]>;
};

type TypedClientEventSubscribers<E> = {
    [K in keyof E & string as `subscribe${Capitalize<K>}Event`]: (
        listener: (value: DecodedEventData<E[K]>) => void,
        minIntervalS: number,
        maxIntervalS: number,
        isUrgent?: boolean,
        minimumEventNumber?: number | bigint,
        isFabricFiltered?: boolean,
    ) => Promise<void>;
};

type TypedClientEventListeners<E> = {
    [K in keyof E & string as `add${Capitalize<K>}EventListener`]: (
        listener: (value: DecodedEventData<E[K]>) => void,
    ) => void;
} & {
    [K in keyof E & string as `remove${Capitalize<K>}EventListener`]: (
        listener: (value: DecodedEventData<E[K]>) => void,
    ) => void;
};

type TypedAttributeClients<A> = {
    [K in RequiredKeys<A> & string]: AttributeClientObj<A[K]>;
} & {
    [K in OptionalKeys<A>]: AttributeClientObj<A[K] | undefined>;
};

type TypedEventClients<E> = {
    [K in RequiredKeys<E> & string]: EventClientObj<E[K]>;
} & {
    [K in OptionalKeys<E>]: EventClientObj<E[K] | undefined>;
};

// --- Main types ---

/** Strongly typed interface of a group cluster client (limited functionalities) */
export type BaseClusterClientObj<T extends ClusterType = ClusterType> = {
    /**
     * Cluster ID
     * @readonly
     */
    id: ClusterId;

    /**
     * Cluster type
     * @private
     * @readonly
     */
    _type: "ClusterClient";

    /**
     * Cluster revision
     * @readonly
     */
    readonly revision: number;

    /**
     * Cluster name
     * @readonly
     */
    readonly name: string;

    /**
     * Whether the cluster is unknown, means that we do not have types and schema information for it. Most likely no
     * official cluster.
     * @readonly
     */
    readonly isUnknown: boolean;

    /**
     * Supported Features of the cluster
     * @readonly
     */
    readonly supportedFeatures: TypeFromPartialBitSchema<T["features"]>;

    /**
     * Attributes of the cluster as object with named keys. This can be used to discover the attributes of the cluster
     * programmatically.
     * @readonly
     */
    readonly attributes: AttributeClients<T["features"], T["attributes"]>;
} & LegacyClientAttributeSetters<T["attributes"]>;

export type GroupClusterClientObj<T extends ClusterType = ClusterType> = BaseClusterClientObj<T> & {
    /**
     * Commands of the cluster as object with named keys. This can be used to discover the commands of the cluster
     * programmatically.
     * @readonly
     */
    readonly commands: LegacyNoResponseCommandServers<T["commands"]>;
} & LegacyNoResponseCommandServers<T["commands"]>;

/** Strongly typed interface of a cluster client */
export type ClusterClientObj<T extends ClusterType = ClusterType> = BaseClusterClientObj<T> & {
    /**
     * Endpoint ID the cluster is on.
     * @readonly
     */
    readonly endpointId: number;

    /**
     * Events of the cluster as object with named keys. This can be used to discover the events of the cluster
     * programmatically.
     * @readonly
     */
    readonly events: EventClients<T["events"]>;

    /**
     * Commands of the cluster as object with named keys. This can be used to discover the commands of the cluster
     * programmatically.
     * @readonly
     */
    readonly commands: LegacyCommandServers<T["commands"]>;

    /**
     * Subscribe to all attributes of the cluster. This will subscribe to all attributes of the cluster. Add listeners
     * to the relevant attributes you want to get updates for.
     */
    readonly subscribeAllAttributes: (options: {
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        keepSubscriptions?: boolean;
        isFabricFiltered?: boolean;
        eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
        dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
    }) => Promise<void>;

    /** Returns if a given Attribute Id is present and supported at the connected cluster server. */
    isAttributeSupported: (attributeId: AttributeId) => boolean;

    /** Returns if a given Attribute with provided name is present and supported at the connected cluster server. */
    isAttributeSupportedByName: (attributeName: string) => boolean;

    /** Returns if a given Command Id is present and supported at the connected cluster server. */
    isCommandSupported: (commandId: CommandId) => boolean;

    /** Returns if a given Command with provided name is present and supported at the connected cluster server. */
    isCommandSupportedByName: (commandName: string) => boolean;
} & LegacyClientAttributeGetters<T["attributes"]> &
    LegacyClientLocalAttributeGetters<T["attributes"]> &
    LegacyClientGlobalAttributeGetters<T["features"]> &
    LegacyClientAttributeSubscribers<T["attributes"]> &
    LegacyClientAttributeListeners<T["attributes"]> &
    LegacyCommandServers<T["commands"]> &
    LegacyClientEventGetters<T["events"]> &
    LegacyClientEventSubscribers<T["events"]> &
    LegacyClientEventListeners<T["events"]>;

/**
 * {@link ClusterClientObj} parameterized on {@link ClusterTyping} (plain value interfaces).
 *
 * Produced by legacy API methods like `getClusterClient()` when called with either a `ClusterType` (via
 * `TypingOf`) or a `ClusterNamespace.Concrete` (which carries `Typing` directly).
 */
export type TypedClusterClientObj<N extends ClusterTyping = ClusterTyping> = {
    id: ClusterId;
    _type: "ClusterClient";
    readonly revision: number;
    readonly name: string;
    readonly isUnknown: boolean;
    readonly supportedFeatures: N["SupportedFeatures"];
    readonly attributes: TypedAttributeClients<N["Attributes"]>;
    readonly endpointId: number;
    readonly events: TypedEventClients<N["Events"]>;
    readonly commands: TypedClientCommands<N["Commands"]>;
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
} & TypedClientAttributeGetters<N["Attributes"]> &
    TypedClientLocalAttributeGetters<N["Attributes"]> &
    TypedClientAttributeSetters<N["Attributes"]> &
    TypedClientAttributeSubscribers<N["Attributes"]> &
    TypedClientAttributeListeners<N["Attributes"]> &
    TypedClientCommands<N["Commands"]> &
    TypedClientEventGetters<N["Events"]> &
    TypedClientEventSubscribers<N["Events"]> &
    TypedClientEventListeners<N["Events"]>;

export type ClusterClientObjInternal<T extends ClusterType = ClusterType> = ClusterClientObj<T> & {
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
