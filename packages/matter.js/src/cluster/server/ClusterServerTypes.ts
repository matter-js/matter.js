/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Merge } from "#general";
import { ClusterClientObj, Fabric, Message, Session } from "#protocol";
import {
    Attribute,
    AttributeId,
    AttributeJsType,
    Attributes,
    Cluster,
    ClusterId,
    ClusterType,
    Command,
    CommandId,
    Commands,
    EventId,
    Events,
    EventType,
    FabricScopedAttribute,
    FixedAttribute,
    GlobalAttributes,
    MandatoryAttributeNames,
    MandatoryEventNames,
    OptionalAttribute,
    OptionalAttributeNames,
    OptionalCommand,
    OptionalEventNames,
    OptionalFixedAttribute,
    OptionalWritableAttribute,
    OptionalWritableFabricScopedAttribute,
    RequestType,
    ResponseType,
    WritableAttribute,
    WritableFabricScopedAttribute,
} from "#types";
import { Endpoint } from "../../device/Endpoint.js";
import { AttributeServer, FabricScopedAttributeServer, FixedAttributeServer } from "./AttributeServer.js";
import { type ClusterServer } from "./ClusterServer.js";
import { CommandServer } from "./CommandServer.js";
import { AnyEventServer } from "./EventServer.js";

/** Cluster attributes accessible on the cluster server */
type MandatoryAttributeServers<A extends Attributes> = Omit<
    {
        [P in MandatoryAttributeNames<A>]: A[P] extends FabricScopedAttribute<any, any>
            ? FabricScopedAttributeServer<AttributeJsType<A[P]>>
            : A[P] extends WritableFabricScopedAttribute<any, any>
              ? FabricScopedAttributeServer<AttributeJsType<A[P]>>
              : A[P] extends FixedAttribute<any, any>
                ? FixedAttributeServer<AttributeJsType<A[P]>>
                : AttributeServer<AttributeJsType<A[P]>>;
    },
    keyof GlobalAttributes<any>
>;
type OptionalAttributeServers<A extends Attributes> = {
    [P in OptionalAttributeNames<A>]?: A[P] extends OptionalWritableFabricScopedAttribute<any, any>
        ? FabricScopedAttributeServer<AttributeJsType<A[P]>>
        : A[P] extends OptionalFixedAttribute<any, any>
          ? FixedAttributeServer<AttributeJsType<A[P]>>
          : AttributeServer<AttributeJsType<A[P]>>;
};
export type AttributeServers<A extends Attributes = Attributes> = Merge<
    MandatoryAttributeServers<A>,
    OptionalAttributeServers<A>
>;

/** Initial values for the cluster attribute */
export type AttributeInitialValues<A extends Attributes> = Merge<
    Omit<{ [P in MandatoryAttributeNames<A>]: AttributeJsType<A[P]> }, keyof GlobalAttributes<any>>,
    { [P in OptionalAttributeNames<A>]?: AttributeJsType<A[P]> }
>;

type MandatoryCommandNames<C extends Commands> = {
    [K in keyof C]: C[K] extends OptionalCommand<any, any, any> ? never : K;
}[keyof C];
type OptionalCommandNames<C extends Commands> = {
    [K in keyof C]: C[K] extends OptionalCommand<any, any, any> ? K : never;
}[keyof C];
type AttributeGetters<A extends Attributes> = {
    [P in keyof A as `${string & P}AttributeGetter`]?: (args: {
        attributes: AttributeServers<A>;
        endpoint?: Endpoint;
        session?: Session;
        isFabricFiltered?: boolean;
    }) => AttributeJsType<A[P]>;
};
type AttributeSetters<A extends Attributes> = {
    [P in keyof A as `${string & P}AttributeSetter`]?: (
        value: AttributeJsType<A[P]>,
        args: { attributes: AttributeServers<A>; endpoint?: Endpoint; session?: Session },
    ) => boolean;
};
type AttributeValidators<A extends Attributes> = {
    [P in keyof A as `${string & P}AttributeValidator`]?: (
        value: AttributeJsType<A[P]>,
        args: { attributes: AttributeServers<A>; endpoint?: Endpoint; session?: Session },
    ) => void;
};
export type CommandHandler<
    C extends Command<any, any, any>,
    AS extends AttributeServers<any>,
    ES extends EventServers<any>,
> =
    C extends Command<infer RequestT, infer ResponseT, any>
        ? (args: {
              request: RequestT;
              attributes: AS;
              events: ES;
              session: Session;
              message: Message;
              endpoint: Endpoint;
          }) => Promise<ResponseT> | ResponseT
        : never;
type CommandHandlers<T extends Commands, AS extends AttributeServers<any>, ES extends EventServers<any>> = Merge<
    { [P in MandatoryCommandNames<T>]: CommandHandler<T[P], AS, ES> },
    { [P in OptionalCommandNames<T>]?: CommandHandler<T[P], AS, ES> }
>;

/** Handlers to process cluster commands */
type AttributeHandlers<A extends Attributes> = Merge<
    AttributeGetters<A>,
    Merge<AttributeSetters<A>, AttributeValidators<A>>
>;
export type ClusterServerHandlers<C extends ClusterType> = Merge<
    CommandHandlers<C["commands"], AttributeServers<C["attributes"]>, EventServers<C["events"]>>,
    Merge<
        AttributeHandlers<C["attributes"]>,
        {
            initializeClusterServer?: (args: {
                attributes: AttributeServers<C["attributes"]>;
                events: EventServers<C["events"]>;
                endpoint: Endpoint;
            }) => void;
            destroyClusterServer?: () => void;
        }
    >
>;

export type CommandServers<C extends Commands = Commands> = Merge<
    { [P in MandatoryCommandNames<C>]: CommandServer<RequestType<C[P]>, ResponseType<C[P]>> },
    { [P in OptionalCommandNames<C>]?: CommandServer<RequestType<C[P]>, ResponseType<C[P]>> }
>;

type OptionalAttributeConf<T extends Attributes> = { [K in OptionalAttributeNames<T>]?: true };
type MakeAttributeMandatory<A extends Attribute<any, any>> =
    A extends OptionalWritableFabricScopedAttribute<infer T, any>
        ? WritableFabricScopedAttribute<T, any>
        : A extends OptionalWritableAttribute<infer T, any>
          ? WritableAttribute<T, any>
          : A extends OptionalAttribute<infer T, any>
            ? Attribute<T, any>
            : A;

type MakeAttributesMandatory<T extends Attributes, C extends OptionalAttributeConf<T>> = {
    [K in keyof T]: K extends keyof C ? MakeAttributeMandatory<T[K]> : T[K];
};

const MakeAttributesMandatory = <T extends Attributes, C extends OptionalAttributeConf<T>>(
    attributes: T,
    conf: C,
): MakeAttributesMandatory<T, C> => {
    const result = <Attributes>{ ...attributes };
    for (const key in conf) {
        (result as any)[key] = { ...result[key], optional: false };
    }
    return result as MakeAttributesMandatory<T, C>;
};

export type UseOptionalAttributes<
    C extends Cluster<any, any, any, any, any>,
    A extends OptionalAttributeConf<C["attributes"]>,
> = Cluster<
    C["features"],
    C["supportedFeatures"],
    MakeAttributesMandatory<C["attributes"], A>,
    C["commands"],
    C["events"]
>;

/** Forces the presence of the specified optional attributes, so they can be used in the command handlers */
export const UseOptionalAttributes = <
    C extends Cluster<any, any, any, any, any>,
    A extends OptionalAttributeConf<C["attributes"]>,
>(
    cluster: C,
    conf: A,
): UseOptionalAttributes<C, A> => ({ ...cluster, attributes: MakeAttributesMandatory(cluster.attributes, conf) });

export type FabricScopedAttributeNames<A extends Attributes> = {
    [K in keyof A]: A[K] extends FabricScopedAttribute<any, any>
        ? K
        : A[K] extends WritableFabricScopedAttribute<any, any>
          ? K
          : A[K] extends OptionalWritableFabricScopedAttribute<any, any>
            ? K
            : never;
}[keyof A];
export type NonFixedAttributeNames<A extends Attributes> = {
    [K in keyof A]: A[K] extends FixedAttribute<any, any>
        ? never
        : A[K] extends OptionalFixedAttribute<any, any>
          ? never
          : K;
}[keyof A];

type GetterTypeFromSpec<A extends Attribute<any, any>> =
    A extends OptionalAttribute<infer T, any> ? T | undefined : AttributeJsType<A>;
type ServerAttributeGetters<A extends Attributes> = {
    [P in MandatoryAttributeNames<A> as `get${Capitalize<string & P>}Attribute`]: () => GetterTypeFromSpec<A[P]>;
} & { [P in OptionalAttributeNames<A> as `get${Capitalize<string & P>}Attribute`]?: () => GetterTypeFromSpec<A[P]> } & {
    [P in FabricScopedAttributeNames<A> as `get${Capitalize<string & P>}Attribute`]: (
        fabric: Fabric,
    ) => GetterTypeFromSpec<A[P]>;
};
type ServerAttributeSetters<A extends Attributes> = {
    [P in NonFixedAttributeNames<A> as `set${Capitalize<string & P>}Attribute`]: (value: AttributeJsType<A[P]>) => void;
} & {
    [P in FabricScopedAttributeNames<A> as `set${Capitalize<string & P>}Attribute`]: (
        value: AttributeJsType<A[P]>,
        fabric: Fabric,
    ) => void;
};
type ServerAttributeSubscribers<A extends Attributes> = {
    [P in NonFixedAttributeNames<A> as `subscribe${Capitalize<string & P>}Attribute`]: (
        listener: (newValue: AttributeJsType<A[P]>, oldValue: AttributeJsType<A[P]>) => void,
    ) => void;
} & {
    [P in FabricScopedAttributeNames<A> as `subscribe${Capitalize<string & P>}Attribute`]: (
        listener: (newValue: AttributeJsType<A[P]>, oldValue: AttributeJsType<A[P]>) => void,
        fabric: Fabric,
    ) => void;
};

export type EventServers<E extends Events = Events> = Merge<
    { [P in MandatoryEventNames<E>]: AnyEventServer<EventType<E[P]>> },
    { [P in OptionalEventNames<E>]?: AnyEventServer<EventType<E[P]>> }
>;
type ServerEventTriggers<E extends Events> = {
    [P in MandatoryEventNames<E> as `trigger${Capitalize<string & P>}Event`]: (event: EventType<E[P]>) => void;
} & { [P in OptionalEventNames<E> as `trigger${Capitalize<string & P>}Event`]?: (event: EventType<E[P]>) => void };
export type SupportedEventsList<E extends Events> = Merge<
    { [P in MandatoryEventNames<E>]: true },
    { [P in OptionalEventNames<E>]?: boolean }
>;

export type ClusterServerObj<T extends ClusterType = ClusterType> = ClusterServer<T> & {
    /**
     * Cluster ID
     * @readonly
     */
    id: ClusterId;

    /**
     * Cluster name
     * @readonly
     */
    readonly name: string;

    /**
     * Cluster type
     * @private
     * @readonly
     */
    _type: "ClusterServer";

    /** Returns if a given Attribute Id is defined and supported by this cluster server. */
    isAttributeSupported: (attributeId: AttributeId) => boolean;

    /** Returns if a given Attribute for provided name is defined and supported by this cluster server. */
    isAttributeSupportedByName: (attributeName: string) => boolean;

    /** Returns if a given Event is defined and supported by this cluster server. */
    isEventSupported: (eventId: EventId) => boolean;

    /** Returns if a given Event for provided name is defined and supported by this cluster server. */
    isEventSupportedByName: (eventName: string) => boolean;

    /** Returns if a given Command is defined and supported by this cluster server. */
    isCommandSupported: (commandId: CommandId) => boolean;

    /** Returns if a given Command for provided name is defined and supported by this cluster server. */
    isCommandSupportedByName: (commandName: string) => boolean;
} & ServerAttributeGetters<T["attributes"]> &
    ServerAttributeSetters<T["attributes"]> &
    ServerAttributeSubscribers<T["attributes"]> &
    ServerEventTriggers<T["events"]>;

/** Strongly typed interface of a cluster server */
export type ClusterServerObjInternal<T extends ClusterType = ClusterType> = ClusterServerObj<T> & {
    /**
     * Assign this cluster to a specific endpoint. This method also initializes the internal Cluster logics
     * @private
     *
     * @param endpoint Endpoint to assign to
     */
    readonly _assignToEndpoint: (endpoint: Endpoint) => void;

    /**
     * Destroy internal cluster logics, timers and such
     * @private
     */
    readonly _close: () => void;
};

export function isClusterServer<T extends ClusterType>(
    obj: ClusterClientObj<T> | ClusterServerObj<T>,
): obj is ClusterServerObj<T> {
    return obj._type === "ClusterServer";
}

export function isClusterServerInternal<T extends ClusterType>(
    obj: ClusterClientObj<T> | ClusterServerObj<T>,
): obj is ClusterServerObjInternal<T> {
    return obj._type === "ClusterServer";
}

export function asClusterServerInternal<T extends ClusterType>(obj: ClusterServerObj<T>): ClusterServerObjInternal<T> {
    if (!isClusterServerInternal(obj)) {
        throw new Error("Object is not a ClusterServerObj instance.");
    }
    return obj;
}
