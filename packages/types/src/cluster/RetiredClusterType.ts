/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, type DeepPartial, Merge } from "@matter/general";
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
import type { ClusterNamespace, ClusterTyping } from "./ClusterNamespace.js";
import { ClusterType } from "./ClusterType.js";

/**
 * Types and utilities for the deprecated {@link ClusterType} factory.
 *
 * @deprecated Remove when ClusterType compat layer is dropped.
 */
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
     * @deprecated Use {@link DeepPartial} from `@matter/general` instead.
     */
    export type PatchType<V> = DeepPartial<V>;

    /**
     * @deprecated
     */
    export interface Extension<F extends BitSchema = {}> {
        flags: TypeFromPartialBitSchema<F>;
        component: false | Partial<ClusterType.Elements>;
    }

    /**
     * Extract {@link ClusterTyping} from an {@link Options} bag.
     *
     * This replaces the `ClusterTypeBridge<Of<T>, {}>` path with a simpler extraction that derives value types
     * directly from the TLV schemas in the options without the component-merging machinery.
     */
    export type TypingOfOptions<T extends Options> = {
        Attributes: AttrValuesOf<Of<T>["attributes"]>;
        Commands: CmdValuesOf<Of<T>["commands"]>;
        Events: EventValuesOf<Of<T>["events"]>;
        Features: FeatureNamesOf<Of<T>["features"]>;
        SupportedFeatures: Of<T>["supportedFeatures"];
        Components: [
            {
                flags: {};
                attributes: AttrInterfaceOf<Of<T>["attributes"]>;
                events: EventInterfaceOf<Of<T>["events"]>;
            },
            ...ExtComponents<ExtensionsOf<Of<T>>>,
        ];
    };

    type AttrValueOf<A> = A extends { schema: TlvSchema<infer T> } ? T : never;

    type AttrValuesOf<R> = { [K in keyof R]: AttrValueOf<R[K]> };

    type EventValuesOf<R> = { [K in keyof R]: AttrValueOf<R[K]> };

    type CmdFnOf<C> = C extends { requestSchema: TlvSchema<infer Req>; responseSchema: TlvSchema<infer Resp> }
        ? Req extends void
            ? () => Resp
            : (request: Req) => Resp
        : () => void;

    type CmdValuesOf<R> = { [K in keyof R]: CmdFnOf<R[K]> };

    type FeatureNamesOf<F> = Capitalize<keyof F & string>;

    /**
     * Attribute keys that are mandatory (not optional).
     */
    type MandatoryAttrKeys<R> = {
        [K in keyof R & string]: R[K] extends { optional: true } ? never : K;
    }[keyof R & string];

    /**
     * Attribute keys that are optional.
     */
    type OptionalAttrKeys<R> = {
        [K in keyof R & string]: R[K] extends { optional: true } ? K : never;
    }[keyof R & string];

    /**
     * Build a per-component attribute interface from ClusterType attributes.
     *
     * Mandatory attributes are required; optional attributes use `?`.
     */
    type AttrInterfaceOf<R> = { [K in MandatoryAttrKeys<R>]: AttrValueOf<R[K]> } & {
        [K in OptionalAttrKeys<R>]?: AttrValueOf<R[K]>;
    };

    /**
     * Build a per-component event interface from ClusterType events.
     *
     * Mandatory events are required; optional events use `?`.
     */
    type EventInterfaceOf<R> = { [K in MandatoryAttrKeys<R>]: AttrValueOf<R[K]> } & {
        [K in OptionalAttrKeys<R>]?: AttrValueOf<R[K]>;
    };

    type ExtensionsOf<C extends ClusterType> = C extends {
        extensions: infer E extends readonly ClusterType.Extension[];
    }
        ? E
        : [];

    type ExtFlags<E extends ClusterType.Extension> = E["flags"];

    type ExtComponents<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
        infer E extends ClusterType.Extension,
        ...infer Rest extends readonly ClusterType.Extension[],
    ]
        ? [ExtComponentEntry<E>, ...ExtComponents<Rest>]
        : [];

    type ExtComponentEntry<E extends ClusterType.Extension> = {
        flags: ExtFlags<E>;
    } & (E["component"] extends { attributes: infer A } ? { attributes: AttrInterfaceOf<A> } : {}) &
        (E["component"] extends { events: infer Ev } ? { events: EventInterfaceOf<Ev> } : {});

    /**
     * Extract {@link ClusterTyping} from either a {@link ClusterNamespace.Concrete} (which carries
     * `Typing` directly) or a legacy {@link ClusterType} (via direct extraction).
     */
    export type TypingOf<C> = C extends { Typing: infer N extends ClusterTyping }
        ? N
        : C extends ClusterType
          ? TypingOfOptions<C>
          : ClusterTyping;
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
