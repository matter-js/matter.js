/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, Merge } from "@matter/general";
import {
    Access,
    AccessLevel,
    AttributeElement,
    ClusterElement,
    ClusterModel,
    CommandElement,
    EventElement,
    FieldElement,
} from "@matter/model";
import { BitSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";
import { TlvSchema } from "../tlv/TlvSchema.js";
import { TlvVoid } from "../tlv/TlvVoid.js";
import { Attribute, Command, Event, GlobalAttributes } from "./Cluster.js";
import { ClusterId } from "../datatype/ClusterId.js";
import { ClusterType } from "./ClusterType.js";

/**
 * The old {@link ClusterType} factory.
 *
 * Builds an old-style cluster descriptor from a legacy options bag.
 *
 * @deprecated Remove when ClusterType compat layer is dropped.
 */
export function RetiredClusterType<const T extends RetiredClusterType.Options>(options: T) {
    const cluster = {
        id: ClusterId(options.id),
        name: options.name,
        revision: options.revision,

        features: options.features ?? {},
        supportedFeatures: options.supportedFeatures ?? {},

        attributes: {
            ...options.attributes,
            ...GlobalAttributes(options.features ?? {}),
        },
        commands: options.commands ?? {},
        events: options.events ?? {},

        unknown: false,
    } as RetiredClusterType.Of<T>;

    if (options.base) {
        cluster.base = options.base as RetiredClusterType.Of<T>["base"];
    }

    if (options.extensions) {
        cluster.extensions = options.extensions as RetiredClusterType.Of<T>["extensions"];
    }

    return cluster;
}

export namespace RetiredClusterType {
    /**
     * Convert a legacy options bag (TLV schemas, AccessLevel enums, boolean flags) into a {@link ClusterModel}.
     */
    export function ModelForOptions(options: Options): ClusterModel {
        const children: ClusterElement.Child[] = [];

        // Attributes
        const attrs = options.attributes ?? {};
        for (const [name, attr] of Object.entries(attrs)) {
            if (GLOBAL_ATTR_IDS.has(attr.id)) {
                continue;
            }

            const el = attr.schema.element;
            children.push(
                AttributeElement({
                    id: attr.id,
                    name,
                    type: el?.type,
                    constraint: el?.constraint,
                    quality: attributeQuality(attr),
                    access: attributeAccess(attr),
                    conformance: attr.optional ? "O" : undefined,
                    children: el?.children,
                }),
            );
        }

        // Commands
        const cmds = options.commands ?? {};
        const responsesSeen = new Set<number>();

        for (const [name, cmd] of Object.entries(cmds)) {
            const hasResponse = cmd.responseSchema !== TlvVoid;
            const responseName = hasResponse ? `${name}Response` : undefined;

            const reqEl = cmd.requestSchema.element;
            children.push(
                CommandElement({
                    id: cmd.requestId,
                    name,
                    direction: CommandElement.Direction.Request,
                    response: responseName,
                    access: commandAccess(cmd),
                    conformance: cmd.optional ? "O" : undefined,
                    type: reqEl?.type,
                    constraint: reqEl?.constraint,
                    quality: reqEl?.quality,
                    children: reqEl?.children,
                }),
            );

            if (hasResponse && !responsesSeen.has(cmd.responseId)) {
                responsesSeen.add(cmd.responseId);
                const respEl = cmd.responseSchema.element;
                children.push(
                    CommandElement({
                        id: cmd.responseId,
                        name: responseName!,
                        direction: CommandElement.Direction.Response,
                        type: respEl?.type,
                        constraint: respEl?.constraint,
                        quality: respEl?.quality,
                        children: respEl?.children,
                    }),
                );
            }
        }

        // Events
        const events = options.events ?? {};
        for (const [name, evt] of Object.entries(events)) {
            const el = evt.schema.element;
            children.push(
                EventElement({
                    id: evt.id,
                    name,
                    priority: PRIORITY_TO_STRING[evt.priority] ?? EventElement.Priority.Debug,
                    access: eventAccess(evt),
                    conformance: evt.optional ? "O" : undefined,
                    type: el?.type,
                    constraint: el?.constraint,
                    quality: el?.quality,
                    children: el?.children,
                }),
            );
        }

        // Features
        const features = options.features ?? {};
        const featureChildren: FieldElement[] = [];
        for (const [name, flag] of Object.entries(features)) {
            const offset = (flag as { offset: number }).offset;
            featureChildren.push(
                FieldElement({
                    name,
                    constraint: offset,
                }),
            );
        }

        if (featureChildren.length) {
            children.push(
                AttributeElement({
                    id: 0xfffc,
                    name: "featureMap",
                    children: featureChildren,
                }),
            );
        }

        return new ClusterModel({
            id: options.id,
            name: options.name,
            revision: options.revision,
            children,
        });
    }

    /**
     * Input to the retired {@link ClusterType} factory.
     *
     * @deprecated
     */
    export type Options<F extends BitSchema = {}> = { id: number } & Omit<ClusterType.Identity, "id"> &
        Partial<ClusterType.Features<F>> & {
            attributes?: ClusterType.ElementSet<ClusterType.Attribute>;
            commands?: ClusterType.ElementSet<ClusterType.Command>;
            events?: ClusterType.ElementSet<ClusterType.Event>;
        };

    /**
     * A fully typed result of the retired {@link ClusterType} factory.
     *
     * @deprecated
     */
    export interface Of<T extends Options> {
        id: Branded<T["id"], "ClusterId">;
        name: T["name"];
        revision: T["revision"];
        features: T["features"] extends {} ? T["features"] : {};
        supportedFeatures: T["supportedFeatures"] extends {} ? T["supportedFeatures"] : {};
        attributes: T["attributes"] extends infer A extends {}
            ? Merge<A, GlobalAttributes<T["features"] extends {} ? T["features"] : {}>>
            : {};
        commands: T["commands"] extends {} ? T["commands"] : {};
        events: T["events"] extends {} ? T["events"] : {};
        unknown: T["unknown"] extends boolean ? T["unknown"] : false;
        base: T["base"] extends {} ? T["base"] : undefined;
        extensions: T["extensions"] extends {} ? T["extensions"] : undefined;
    }

    /**
     * @deprecated
     */
    export type AttributeValues<T> = ValuesOfAttributes<ClusterType.AttributesOf<T>>;

    /**
     * @deprecated
     */
    export type ValuesOfAttributes<AttrsT extends { [K: string]: Attribute<any, any> }> = {
        [K in keyof AttrsT as [AttrsT[K]] extends [{ optional: true }] ? never : K]: AttrsT[K] extends {
            schema: TlvSchema<infer T>;
        }
            ? T
            : never;
    } & {
        [K in keyof AttrsT as [AttrsT[K]] extends [{ optional: true }] ? K : never]?: AttrsT[K] extends {
            schema: TlvSchema<infer T>;
        }
            ? T
            : never;
    };

    /**
     * @deprecated
     */
    export type PatchType<V> = V extends (infer E)[]
        ? { readonly [K in `${number}`]: PatchType<E> } | Readonly<PatchType<E>[]>
        : V extends boolean | number | bigint | string
          ? V
          : V extends object
            ? V extends (...args: any[]) => any
                ? never
                : {
                      readonly [K in keyof V]?: PatchType<V[K]>;
                  }
            : V;

    /**
     * @deprecated
     */
    export interface Extension<F extends BitSchema = {}> {
        flags: TypeFromPartialBitSchema<F>;
        component: false | Partial<ClusterType.Elements>;
    }
}

const GLOBAL_ATTR_IDS = new Set([0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8]);

const PRIVILEGE_TO_FLAG: Record<number, Access.Privilege> = {
    [AccessLevel.View]: Access.Privilege.View,
    [AccessLevel.Operate]: Access.Privilege.Operate,
    [AccessLevel.Manage]: Access.Privilege.Manage,
    [AccessLevel.Administer]: Access.Privilege.Administer,
};

const PRIORITY_TO_STRING: Record<number, EventElement.Priority> = {
    [0]: EventElement.Priority.Debug,
    [1]: EventElement.Priority.Info,
    [2]: EventElement.Priority.Critical,
};

function attributeAccess(attr: Attribute<any, any>): string | undefined {
    const parts: string[] = [];

    parts.push(attr.writable ? "RW" : "R");

    const readPriv = PRIVILEGE_TO_FLAG[attr.readAcl];
    if (readPriv) {
        parts.push(readPriv);
    }
    if (attr.writable && attr.writeAcl !== undefined) {
        const writePriv = PRIVILEGE_TO_FLAG[attr.writeAcl];
        if (writePriv && writePriv !== readPriv) {
            parts[parts.length - 1] += writePriv;
        }
    }

    if (attr.fabricScoped) {
        parts.push("F");
    }
    if (attr.timed) {
        parts.push("T");
    }

    return parts.join(" ");
}

function commandAccess(cmd: Command<any, any, any>): string | undefined {
    const parts: string[] = [];

    const priv = PRIVILEGE_TO_FLAG[cmd.invokeAcl];
    if (priv) {
        parts.push(priv);
    }
    if (cmd.timed) {
        parts.push("T");
    }

    return parts.length ? parts.join(" ") : undefined;
}

function eventAccess(evt: Event<any, any>): string | undefined {
    const priv = PRIVILEGE_TO_FLAG[evt.readAcl];
    return priv ?? undefined;
}

function attributeQuality(attr: Attribute<any, any>): string | undefined {
    let q = attr.schema.element?.quality?.toString() ?? "";

    if (attr.persistent && !q.includes("N")) {
        q += "N";
    }
    if (attr.scene && !q.includes("S")) {
        q += "S";
    }
    if (attr.omitChanges && !q.includes("C")) {
        q += "C";
    }
    if (attr.fixed && !q.includes("F")) {
        q += "F";
    }

    return q || undefined;
}
