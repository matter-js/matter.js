/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deprecated element interfaces and factory functions for the legacy {@link ClusterType} factory.
 *
 * These provide a backward-compatible API for consumers that define clusters using the deprecated
 * {@link ClusterType}() factory rather than generated cluster namespaces or the decorator system.
 *
 * @deprecated use generated cluster namespaces or the decorator system instead.
 */

import { Priority } from "#globals/Priority.js";
import { AccessLevel } from "@matter/model";
import { AttributeId } from "../datatype/AttributeId.js";
import { CommandId } from "../datatype/CommandId.js";
import { EventId } from "../datatype/EventId.js";
import { BitSchema } from "../schema/BitmapSchema.js";
import { TlvSchema } from "../tlv/TlvSchema.js";

/* Attribute interfaces */

/**
 * @deprecated
 */
export interface Attribute<T, _F extends BitSchema> {
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
    unknown: boolean;
}

/**
 * @deprecated
 */
export interface OptionalAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    optional: true;
}

/**
 * @deprecated
 */
export interface WritableAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    writable: true;
}

/**
 * @deprecated
 */
export interface OptionalWritableAttribute<T, F extends BitSchema> extends OptionalAttribute<T, F> {
    writable: true;
}

/**
 * @deprecated
 */
export interface FabricScopedAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    fabricScoped: true;
}

/**
 * @deprecated
 */
export interface WritableFabricScopedAttribute<T, F extends BitSchema> extends WritableAttribute<T, F> {
    fabricScoped: true;
}

/**
 * @deprecated
 */
export interface OptionalWritableFabricScopedAttribute<T, F extends BitSchema> extends OptionalWritableAttribute<T, F> {
    fabricScoped: true;
}

/**
 * @deprecated
 */
export interface FixedAttribute<T, F extends BitSchema> extends Attribute<T, F> {
    fixed: true;
}

/**
 * @deprecated
 */
export interface WritableFixedAttribute<T, F extends BitSchema> extends WritableAttribute<T, F> {
    fixed: true;
}

/**
 * @deprecated
 */
export interface OptionalFixedAttribute<T, F extends BitSchema> extends OptionalAttribute<T, F> {
    fixed: true;
}

/* Attribute factories */

interface AttributeOptions<T> {
    scene?: boolean;
    persistent?: boolean;
    omitChanges?: boolean;
    timed?: boolean;
    default?: T;
    readAcl?: AccessLevel;
    writeAcl?: AccessLevel;
}

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});

/* Command interfaces */

/**
 * @deprecated
 */
export interface Command<RequestT, ResponseT, _F extends BitSchema> {
    optional: boolean;
    requestId: CommandId;
    requestSchema: TlvSchema<RequestT>;
    responseId: CommandId;
    responseSchema: TlvSchema<ResponseT>;
    invokeAcl: AccessLevel;
    timed: boolean;
}

/**
 * @deprecated
 */
export interface OptionalCommand<RequestT, ResponseT, F extends BitSchema> extends Command<RequestT, ResponseT, F> {
    optional: true;
}

/* Command factories */

interface CommandOptions {
    invokeAcl?: AccessLevel;
    timed?: boolean;
}

/**
 * @deprecated
 */
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
});

/**
 * @deprecated
 */
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
});

/* Event interfaces */

/**
 * @deprecated
 */
export interface Event<T, _F extends BitSchema> {
    id: EventId;
    schema: TlvSchema<T>;
    priority: Priority;
    optional: boolean;
    readAcl: AccessLevel;
    unknown: boolean;
}

/**
 * @deprecated
 */
export interface OptionalEvent<T, F extends BitSchema> extends Event<T, F> {
    optional: true;
}

/* Event factories */

interface EventOptions {
    readAcl?: AccessLevel;
}

/**
 * @deprecated
 */
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
    readAcl,
    unknown: false,
});

/**
 * @deprecated
 */
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
    unknown: false,
});
