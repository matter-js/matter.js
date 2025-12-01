/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError, Merge } from "#general";
import { Priority } from "#globals/Priority.js";
import { AccessLevel } from "#model";
import { AttributeId, TlvAttributeId } from "../datatype/AttributeId.js";
import { ClusterId } from "../datatype/ClusterId.js";
import { CommandId, TlvCommandId } from "../datatype/CommandId.js";
import { EventId } from "../datatype/EventId.js";
import { BitSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";
import { TlvAny } from "../tlv/TlvAny.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvBitmap, TlvUInt16, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvSchema } from "../tlv/TlvSchema.js";
import { TlvVoid } from "../tlv/TlvVoid.js";

export class AttributeError extends MatterError {}

export class EventError extends MatterError {}

export type ConditionalFeatureList<F extends BitSchema> = TypeFromPartialBitSchema<F>[];

/* Interfaces and helper methods to define a cluster attribute */
export interface Attribute<T, F extends BitSchema> {
    id: AttributeId;
    schema: TlvSchema<T>;
    optional: boolean;
    readAcl: AccessLevel;
    writable: boolean;
    scene: boolean;
    persistent: boolean;
    timed: boolean;
    fixed: boolean;
    fabricScoped: boolean;
    omitChanges: boolean;
    writeAcl?: AccessLevel;
    default?: T;
    isConditional: boolean;
    optionalIf: ConditionalFeatureList<F>;
    mandatoryIf: ConditionalFeatureList<F>;
    unknown: boolean;
}

export interface OptionalAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    optional: true;
}

export interface ConditionalAttribute<T, F extends BitSchema> extends OptionalAttribute<T, F> {
    isConditional: true;
}

export interface WritableAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    writable: true;
}

export interface OptionalWritableAttribute<T, F extends BitSchema> extends OptionalAttribute<T, F> {
    writable: true;
}

export interface ConditionalWritableAttribute<T, F extends BitSchema> extends OptionalWritableAttribute<T, F> {
    isConditional: true;
}

export interface FabricScopedAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    fabricScoped: true;
}

export interface WritableFabricScopedAttribute<T, F extends BitSchema> extends WritableAttribute<T, F> {
    fabricScoped: true;
}

export interface OptionalWritableFabricScopedAttribute<T, F extends BitSchema> extends OptionalWritableAttribute<T, F> {
    fabricScoped: true;
}

export interface ConditionalWritableFabricScopedAttribute<
    T,
    F extends BitSchema,
> extends OptionalWritableFabricScopedAttribute<T, F> {
    isConditional: true;
}

export interface FixedAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    fixed: true;
}

export interface WritableFixedAttribute<T, F extends BitSchema> extends WritableAttribute<T, F> {
    fixed: true;
}

export interface OptionalFixedAttribute<T, F extends BitSchema> extends OptionalAttribute<T, F> {
    fixed: true;
}

export interface ConditionalFixedAttribute<T, F extends BitSchema> extends OptionalFixedAttribute<T, F> {
    isConditional: true;
}

export type AttributeJsType<T extends Attribute<any, any>> = T extends Attribute<infer JsType, any> ? JsType : never;

interface AttributeOptions<T> {
    scene?: boolean;
    persistent?: boolean;
    omitChanges?: boolean;
    timed?: boolean;
    default?: T;
    readAcl?: AccessLevel;
    writeAcl?: AccessLevel;
}

interface ConditionalAttributeOptions<T, F extends BitSchema> extends AttributeOptions<T> {
    optionalIf?: ConditionalFeatureList<F>;
    mandatoryIf?: ConditionalFeatureList<F>;
}

export const Attribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = false,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): Attribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: false,
    writable: false,
    fixed: false,
    scene,
    persistent,
    timed,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const OptionalAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = false,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): OptionalAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: false,
    fixed: false,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const ConditionalAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = false,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        optionalIf = [],
        mandatoryIf = [],
        timed = false,
    }: ConditionalAttributeOptions<V, F>,
): ConditionalAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: false,
    fixed: false,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    isConditional: true,
    optionalIf,
    mandatoryIf,
    unknown: false,
});

export const WritableAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = true,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        writeAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): WritableAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: false,
    writable: true,
    fixed: false,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    writeAcl,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const OptionalWritableAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = true,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        writeAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): OptionalWritableAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: true,
    fixed: false,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    writeAcl,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const ConditionalWritableAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = true,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        writeAcl = AccessLevel.View,
        optionalIf = [],
        mandatoryIf = [],
        timed = false,
    }: ConditionalAttributeOptions<V, F>,
): ConditionalWritableAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: true,
    fixed: false,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    writeAcl,
    isConditional: true,
    optionalIf,
    mandatoryIf,
    unknown: false,
});

export const FabricScopedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = true,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): FabricScopedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: false,
    writable: false,
    fixed: false,
    scene,
    persistent,
    fabricScoped: true,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const WritableFabricScopedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = true,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        writeAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): WritableFabricScopedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: false,
    writable: true,
    fixed: false,
    scene,
    persistent,
    fabricScoped: true,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    writeAcl,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const OptionalWritableFabricScopedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = true,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        writeAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): OptionalWritableFabricScopedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: true,
    fixed: false,
    scene,
    persistent,
    fabricScoped: true,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    writeAcl,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const ConditionalWritableFabricScopedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = true,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        writeAcl = AccessLevel.View,
        optionalIf = [],
        mandatoryIf = [],
        timed = false,
    }: ConditionalAttributeOptions<V, F> = {},
): ConditionalWritableFabricScopedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: true,
    fixed: false,
    scene,
    persistent,
    fabricScoped: true,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    writeAcl,
    isConditional: true,
    optionalIf,
    mandatoryIf,
    unknown: false,
});

export const FixedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = false,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): FixedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: false,
    writable: false,
    fixed: true,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const WritableFixedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = false,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): FixedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: false,
    writable: true,
    fixed: true,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const OptionalFixedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = false,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        timed = false,
    }: AttributeOptions<V> = {},
): OptionalFixedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: false,
    fixed: true,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const ConditionalFixedAttribute = <T, V extends T, F extends BitSchema>(
    id: number,
    schema: TlvSchema<T>,
    {
        scene = false,
        persistent = false,
        omitChanges = false,
        default: conformanceValue,
        readAcl = AccessLevel.View,
        timed = false,
        optionalIf = [],
        mandatoryIf = [],
    }: ConditionalAttributeOptions<V, F>,
): ConditionalFixedAttribute<T, F> => ({
    id: AttributeId(id),
    schema,
    optional: true,
    writable: false,
    fixed: true,
    scene,
    persistent,
    fabricScoped: false,
    omitChanges,
    default: conformanceValue,
    readAcl,
    timed,
    isConditional: true,
    optionalIf,
    mandatoryIf,
    unknown: false,
});

export interface UnknownAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    unknown: true;
}
export const UnknownAttribute = <F extends BitSchema>(id: number): UnknownAttribute<any, F> => ({
    id: AttributeId(id),
    schema: TlvAny,
    optional: false,
    writable: true,
    fixed: false,
    scene: false,
    persistent: false,
    fabricScoped: false,
    omitChanges: true, // We assume custom clusters do mot report values via subscription because we do not know it
    default: undefined,
    readAcl: AccessLevel.View,
    timed: false,
    isConditional: true,
    optionalIf: [],
    mandatoryIf: [],
    unknown: true,
});

export type MandatoryAttributeNames<A extends Attributes> = {
    [K in keyof A]: A[K] extends OptionalAttribute<any, any> ? never : K;
}[keyof A];
export type OptionalAttributeNames<A extends Attributes> = {
    [K in keyof A]: A[K] extends OptionalAttribute<any, any> ? K : never;
}[keyof A];
export type GlobalAttributeNames<F extends BitSchema> = keyof GlobalAttributes<F>;

/* Interfaces and helper methods to define a cluster command */
export const TlvNoResponse = TlvVoid;

export interface Command<RequestT, ResponseT, F extends BitSchema> {
    optional: boolean;
    requestId: CommandId;
    requestSchema: TlvSchema<RequestT>;
    responseId: CommandId;
    responseSchema: TlvSchema<ResponseT>;
    invokeAcl: AccessLevel;
    timed: boolean;
    isConditional: boolean;
    mandatoryIf: ConditionalFeatureList<F>;
    optionalIf: ConditionalFeatureList<F>;
}

export interface OptionalCommand<RequestT, ResponseT, F extends BitSchema> extends Command<RequestT, ResponseT, F> {
    optional: true;
}

export interface ConditionalCommand<RequestT, ResponseT, F extends BitSchema> extends OptionalCommand<
    RequestT,
    ResponseT,
    F
> {
    isConditional: true;
}

export type ResponseType<T extends Command<any, any, any>> =
    T extends OptionalCommand<any, infer ResponseT, any>
        ? ResponseT
        : T extends Command<any, infer ResponseT, any>
          ? ResponseT
          : never;
export type RequestType<T extends Command<any, any, any>> =
    T extends OptionalCommand<infer RequestT, any, any>
        ? RequestT
        : T extends Command<infer RequestT, any, any>
          ? RequestT
          : never;

interface CommandOptions {
    invokeAcl?: AccessLevel;
    timed?: boolean;
}

interface ConditionalCommandOptions<F extends BitSchema> extends CommandOptions {
    optionalIf?: ConditionalFeatureList<F>;
    mandatoryIf?: ConditionalFeatureList<F>;
}

export const Command = <RequestT, ResponseT, F extends BitSchema>(
    requestId: number,
    requestSchema: TlvSchema<RequestT>,
    responseId: number,
    responseSchema: TlvSchema<ResponseT>,
    { invokeAcl = AccessLevel.Operate, timed = false }: CommandOptions = {},
): Command<RequestT, ResponseT, F> => ({
    optional: false,
    requestId: CommandId(requestId),
    requestSchema,
    responseId: CommandId(responseId),
    responseSchema,
    invokeAcl,
    timed,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
});

export const OptionalCommand = <RequestT, ResponseT, F extends BitSchema>(
    requestId: number,
    requestSchema: TlvSchema<RequestT>,
    responseId: number,
    responseSchema: TlvSchema<ResponseT>,
    { invokeAcl = AccessLevel.Operate, timed = false }: CommandOptions = {},
): OptionalCommand<RequestT, ResponseT, F> => ({
    optional: true,
    requestId: CommandId(requestId),
    requestSchema,
    responseId: CommandId(responseId),
    responseSchema,
    invokeAcl,
    timed,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
});

export const ConditionalCommand = <RequestT, ResponseT, F extends BitSchema>(
    requestId: number,
    requestSchema: TlvSchema<RequestT>,
    responseId: number,
    responseSchema: TlvSchema<ResponseT>,
    {
        invokeAcl = AccessLevel.Operate,
        timed = false,
        optionalIf = [],
        mandatoryIf = [],
    }: ConditionalCommandOptions<F> = {},
): ConditionalCommand<RequestT, ResponseT, F> => ({
    optional: true,
    requestId: CommandId(requestId),
    requestSchema,
    responseId: CommandId(responseId),
    responseSchema,
    invokeAcl,
    timed,
    isConditional: true,
    optionalIf,
    mandatoryIf,
});

/**
 * @deprecated use {@link Priority}
 */
export type EventPriority = Priority;

/**
 * @deprecated use {@link Priority}
 */
export const EventPriority = Priority;

export interface Event<T, F extends BitSchema> {
    id: EventId;
    schema: TlvSchema<T>;
    priority: Priority;
    optional: boolean;
    readAcl: AccessLevel;
    isConditional: boolean;
    optionalIf: ConditionalFeatureList<F>;
    mandatoryIf: ConditionalFeatureList<F>;
    unknown: boolean;
}

export interface UnknownEvent<F extends BitSchema> extends Event<any, F> {
    unknown: true;
}

interface EventOptions {
    readAcl?: AccessLevel;
}

interface ConditionalEventOptions<F extends BitSchema> extends EventOptions {
    optionalIf?: ConditionalFeatureList<F>;
    mandatoryIf?: ConditionalFeatureList<F>;
}

export interface OptionalEvent<T, F extends BitSchema> extends Event<T, F> {
    optional: true;
}

export interface ConditionalEvent<T, F extends BitSchema> extends OptionalEvent<T, F> {
    isConditional: true;
}

export const Event = <T, F extends BitSchema>(
    id: number,
    priority: Priority,
    schema: TlvSchema<T>,
    { readAcl = AccessLevel.View }: EventOptions = {},
): Event<T, F> => ({
    id: EventId(id),
    schema,
    priority,
    optional: false,
    isConditional: false,
    readAcl,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const OptionalEvent = <T, F extends BitSchema>(
    id: number,
    priority: Priority,
    schema: TlvSchema<T>,
    { readAcl = AccessLevel.View }: EventOptions = {},
): OptionalEvent<T, F> => ({
    id: EventId(id),
    schema,
    priority,
    optional: true,
    readAcl,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: false,
});

export const ConditionalEvent = <T, F extends BitSchema>(
    id: EventId,
    priority: Priority,
    schema: TlvSchema<T>,
    { readAcl = AccessLevel.View, optionalIf = [], mandatoryIf = [] }: ConditionalEventOptions<F>,
): ConditionalEvent<T, F> => ({
    id: EventId(id),
    schema,
    priority,
    optional: true,
    readAcl,
    isConditional: true,
    optionalIf,
    mandatoryIf,
    unknown: false,
});

export const UnknownEvent = <F extends BitSchema>(id: number): Event<unknown, F> => ({
    id: EventId(id),
    schema: TlvVoid,
    priority: Priority.Debug,
    optional: false,
    readAcl: AccessLevel.View,
    isConditional: false,
    optionalIf: [],
    mandatoryIf: [],
    unknown: true,
});

export type EventType<T extends Event<any, any>> =
    T extends OptionalEvent<infer EventT, any> ? EventT : T extends Event<infer EventT, any> ? EventT : never;
export type MandatoryEventNames<E extends Events> = {
    [K in keyof E]: E[K] extends OptionalEvent<any, any> ? never : K;
}[keyof E];
export type OptionalEventNames<E extends Events> = {
    [K in keyof E]: E[K] extends OptionalEvent<any, any> ? K : never;
}[keyof E];

/* Interfaces and helper methods to define a cluster */
export interface Attributes {
    [key: string]: Attribute<any, any>;
}

export interface Commands {
    [key: string]: Command<any, any, any>;
}

export interface Events {
    [key: string]: Event<any, any>;
}

// TODO Adjust typing to be derived from the schema below
/** @see {@link MatterSpecification.v11.Core} § 7.13 */
export type GlobalAttributes<F extends BitSchema> = {
    /** Indicates the revision of the server cluster specification supported by the cluster instance. */
    clusterRevision: Attribute<number, never>;

    /** Indicates whether the server supports zero or more optional cluster features. */
    featureMap: Attribute<TypeFromPartialBitSchema<F>, never>;

    /** List of the attribute IDs of the attributes supported by the cluster instance. */
    attributeList: Attribute<AttributeId[], never>;

    /** List of client generated commands which are supported by this cluster server instance. */
    acceptedCommandList: Attribute<CommandId[], never>;

    /** List of server generated commands (server to client commands). */
    generatedCommandList: Attribute<CommandId[], never>;
};

export const GlobalAttributes = <F extends BitSchema>(features: F) =>
    ({
        clusterRevision: Attribute(0xfffd, TlvUInt16),
        featureMap: Attribute(0xfffc, TlvBitmap(TlvUInt32, features)),
        attributeList: Attribute(0xfffb, TlvArray(TlvAttributeId)),
        acceptedCommandList: Attribute(0xfff9, TlvArray(TlvCommandId)),
        generatedCommandList: Attribute(0xfff8, TlvArray(TlvCommandId)),
    }) as GlobalAttributes<F>;

export interface Cluster<
    F extends BitSchema,
    SF extends TypeFromPartialBitSchema<F>,
    A extends Attributes,
    C extends Commands,
    E extends Events,
> {
    id: ClusterId;
    name: string;
    revision: number;
    features: F;
    supportedFeatures: SF;
    attributes: A;
    commands: C;
    events: E;
    unknown: boolean;
}

export const Cluster = <
    F extends BitSchema,
    SF extends TypeFromPartialBitSchema<F>,
    A extends Attributes = {},
    C extends Commands = {},
    E extends Events = {},
>({
    id,
    name,
    revision,
    features = <F>{},
    supportedFeatures = <SF>{},
    attributes = <A>{},
    commands = <C>{},
    events = <E>{},
    unknown = false,
}: {
    id: number;
    name: string;
    revision: number;
    features?: F;
    supportedFeatures?: SF;
    attributes?: A;
    commands?: C;
    events?: E;
    unknown?: boolean;
}): Cluster<F, SF, Merge<A, GlobalAttributes<F>>, C, E> => ({
    id: ClusterId(id),
    name,
    revision,
    features,
    supportedFeatures,
    commands,
    attributes: Merge(attributes, GlobalAttributes(features)),
    events,
    unknown,
});

export type ClusterExtend<
    F extends BitSchema,
    SF extends TypeFromPartialBitSchema<F>,
    A extends Attributes,
    C extends Commands,
    E extends Events,
> = {
    supportedFeatures: SF;
    attributes?: A;
    commands?: C;
    events?: E;
};

export const ClusterExtend = <
    F extends BitSchema,
    SF_BASE extends TypeFromPartialBitSchema<F>,
    SF_EXTEND extends TypeFromPartialBitSchema<F>,
    A_BASE extends Attributes = {},
    C_BASE extends Commands = {},
    E_BASE extends Events = {},
    A_EXTEND extends Attributes = {},
    C_EXTEND extends Commands = {},
    E_EXTEND extends Events = {},
>(
    {
        id,
        name,
        revision,
        features,
        supportedFeatures,
        attributes,
        commands,
        events,
        unknown,
    }: Cluster<F, SF_BASE, A_BASE, C_BASE, E_BASE>,
    {
        supportedFeatures: supportedFeaturesExtend,
        attributes: attributesExtend = <A_EXTEND>{},
        commands: commandsExtend = <C_EXTEND>{},
        events: eventsExtend = <E_EXTEND>{},
    }: ClusterExtend<F, SF_EXTEND, A_EXTEND, C_EXTEND, E_EXTEND>,
): Cluster<
    F,
    Merge<SF_BASE, SF_EXTEND>,
    Merge<A_BASE, A_EXTEND>,
    Merge<C_BASE, C_EXTEND>,
    Merge<E_BASE, E_EXTEND>
> => ({
    id,
    name,
    revision,
    features,
    supportedFeatures: Merge(supportedFeatures, supportedFeaturesExtend),
    attributes: Merge(attributes, attributesExtend),
    commands: Merge(commands, commandsExtend),
    events: Merge(events, eventsExtend),
    unknown,
});
