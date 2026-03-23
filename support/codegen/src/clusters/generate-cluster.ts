/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import {
    AttributeModel,
    ClusterVariance,
    CommandModel,
    EventModel,
} from "#model";
import { ComponentGenerator } from "../endpoints/ComponentGenerator.js";
import { ClusterFile } from "./ClusterFile.js";
import { camelize, serialize } from "../util/string.js";

const logger = Logger.get("generate-cluster");

export function generateCluster(file: ClusterFile) {
    const cluster = file.cluster;
    logger.info(`${cluster.name} → ${file.name}.ts`);

    generateComponents(file);
}

/**
 * Generate unified component interfaces (Attributes, Commands, Events, Features) and ClusterNamespace consts.
 */
function generateComponents(file: ClusterFile) {
    const cluster = file.cluster;

    const gen = new ComponentGenerator(file);

    // Only generate components for clusters that have non-global attributes, commands, or events
    const hasContent = cluster.allAces.some(
        el =>
            !AttributeModel.isGlobal(el) &&
            (el instanceof AttributeModel || (el instanceof CommandModel && el.isRequest) || el instanceof EventModel),
    );

    let hasAttrs = false;
    let hasCommands = false;
    let hasEvents = false;

    if (hasContent) {
        const variance = ClusterVariance(cluster);

        gen.generateComponent("Base", variance.base);
        for (const component of variance.components) {
            gen.generateComponent(component.name, component);
        }

        // Generate interfaces first — onReference during generateAll() discovers types referenced by
        // attributes/commands/events.  TS hoists within namespaces so output order is fine.
        const result = gen.generateAll();
        hasAttrs = result.hasAttrs;
        hasCommands = result.hasCommands;
        hasEvents = result.hasEvents;

        gen.generateTypes();
    }

    gen.generateFeatures();
    generateFeatureEnum(file);
    const hasFeatures = cluster.features.length > 0;

    // Generate declare consts inside the namespace (type-only, no runtime code)
    const name = cluster.name;
    file.addImport("!types/cluster/ClusterNamespace.js", "ClusterNamespace");
    file.addImport("!types/cluster/ClusterNamespace.js", "ClusterTyping");
    file.addImport("@matter/model", `${name} as ${name}Model`);

    // Real constants for id and revision
    if (cluster.id !== undefined) {
        file.addImport("!types/datatype/ClusterId.js", "ClusterId");
        file.ns.atom(`export const id = ClusterId(0x${cluster.id.toString(16)})`);
    }
    file.ns.atom(`export const name = ${serialize(name)} as const`);
    file.ns.atom(`export const revision = ${cluster.revision}`);
    file.ns.atom(`export const schema = ${name}Model`);

    if (hasAttrs) {
        file.ns.atom(`export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}`);
        file.ns.atom(`export declare const attributes: AttributeObjects`);
    }
    if (hasCommands) {
        file.ns.atom(`export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}`);
        file.ns.atom(`export declare const commands: CommandObjects`);
    }
    if (hasEvents) {
        file.ns.atom(`export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}`);
        file.ns.atom(`export declare const events: EventObjects`);
    }
    if (hasFeatures) {
        file.ns.atom(`export declare const features: ClusterNamespace.Features<Features>`);
    }

    // Generate Cluster self-alias (for concrete clusters with an id)
    if (cluster.id !== undefined) {
        file.ns.atom(`export type Cluster = typeof ${name}`);
        file.ns.atom(`export declare const Cluster: Cluster`);
    }

    // Generate Complete self-alias
    generateComplete(file);

    // Bridge the interface type onto the namespace value so typeof OnOff carries Typing
    file.ns.atom(`export declare const Typing: ${name}`);

    // Install lazy getters after the namespace (computed on first access)
    file.atom(`ClusterNamespace.define(${name})`);

    // Generate FooCluster external alias (for concrete clusters with an id)
    if (cluster.id !== undefined) {
        file.atom(`export type ${file.clusterName} = ${name}.Cluster`);
        file.atom(`export const ${file.clusterName} = ${name}.Cluster`);
    }

    // Merge an interface with the namespace so it can be used as a type (e.g. in for(OnOff))
    const members = [] as string[];
    if (hasAttrs) {
        members.push(`Attributes: ${name}.Attributes`);
    }
    if (hasCommands) {
        members.push(`Commands: ${name}.Commands`);
    }
    if (hasEvents) {
        members.push(`Events: ${name}.Events`);
    }
    if (hasFeatures) {
        members.push(`Features: ${name}.Features`);
    }
    if (hasAttrs || hasCommands || hasEvents) {
        members.push(`Components: ${name}.Components`);
    }
    const body = members.length ? ` ${members.join("; ")} ` : "";
    file.atom(`export interface ${name} extends ClusterTyping {${body}}`);
}

/**
 * Generate the Feature enum with string values (e.g. `Feature.Lighting = "Lighting"`).
 */
function generateFeatureEnum(file: ClusterFile) {
    const features = file.cluster.features;
    if (!features.length) {
        return;
    }

    const featureEnum = file.featureEnum.expressions(`export enum Feature {`, "}").document({
        description: `These are optional features supported by ${file.clusterName}.`,
        xref: file.cluster.featureMap.xref,
    });
    for (const f of features) {
        const name = camelize(f.title ?? f.name, true);
        featureEnum.atom(`${name} = ${serialize(name)}`).document({
            description: f.title ? `${f.title} (${f.name})` : f.name,
            details: f.details,
            xref: f.xref,
        });
    }
}

/**
 * Generate the deprecated `Complete` type alias that points back to the namespace itself.  The runtime value is
 * provided by the `lazy("Complete", () => ns)` call in {@link ClusterNamespace.define}.
 */
function generateComplete(file: ClusterFile) {
    const name = file.cluster.name;
    const definition = file.ns.atom(`export type Complete = typeof ${name}`);
    definition.document(
        `@deprecated Use the cluster namespace directly (e.g. \`${name}\` instead of \`${name}.Complete\`)`,
    );
    file.ns.atom(`export declare const Complete: Complete`);
}
