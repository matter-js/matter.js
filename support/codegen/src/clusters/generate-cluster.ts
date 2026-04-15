/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { AttributeModel, ClusterVariance, CommandModel, EventModel } from "#model";
import { ComponentGenerator } from "../endpoints/ComponentGenerator.js";
import { camelize, serialize } from "../util/string.js";
import { ClusterFile } from "./ClusterFile.js";

const logger = Logger.get("generate-cluster");

export function generateCluster(file: ClusterFile) {
    const cluster = file.cluster;
    logger.info(`${cluster.name} → ${file.name}.d.ts`);

    generateComponents(file);
}

/**
 * Generate unified component interfaces (Attributes, Commands, Events, Features) and ClusterType consts.
 */
function generateComponents(file: ClusterFile) {
    const cluster = file.cluster;
    const name = cluster.name;

    file.addImport("!types/cluster/ClusterType.js", "ClusterType");
    file.addImport("!types/cluster/ClusterType.js", "ClusterTyping");

    // --- Identity (top of namespace, via interfaces section) ---

    if (cluster.id !== undefined) {
        file.addImport("!types/datatype/ClusterId.js", "ClusterId");
        file.interfaces
            .atom(`export const id: ClusterId & 0x${cluster.id.toString(16).padStart(4, "0")}`)
            .document("The Matter protocol cluster identifier.");
    }
    file.interfaces.atom(`export const name: ${serialize(name)}`).document("Textual cluster identifier.");
    file.interfaces
        .atom(`export const revision: ${cluster.revision}`)
        .document(`The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.`);

    file.addImport("@matter/model", "ClusterModel");
    file.interfaces.atom(`export const schema: ClusterModel`).document({
        description: `Canonical metadata for the ${name} cluster.`,
        details: "This is the exhaustive runtime metadata source that matter.js considers canonical.",
    });

    // --- Per-component interfaces, flat interfaces, Components, Features (via ComponentGenerator) ---

    const gen = new ComponentGenerator(file);

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

        const result = gen.generateAll();
        hasAttrs = result.hasAttrs;
        hasCommands = result.hasCommands;
        hasEvents = result.hasEvents;

        gen.generateTypes();
    }

    gen.generateFeatures();
    generateFeatureEnum(file);
    const hasFeatures = cluster.features.length > 0;

    // --- Runtime metadata consts (documented) ---

    if (hasAttrs) {
        file.ns
            .atom(`export const attributes: ClusterType.AttributeObjects<Attributes>`)
            .document("Attribute metadata objects keyed by name.");
    }
    if (hasCommands) {
        file.ns
            .atom(`export const commands: ClusterType.CommandObjects<Commands>`)
            .document("Command metadata objects keyed by name.");
    }
    if (hasEvents) {
        file.ns
            .atom(`export const events: ClusterType.EventObjects<Events>`)
            .document("Event metadata objects keyed by name.");
    }
    if (hasFeatures) {
        file.ns
            .atom(`export const features: ClusterType.Features<Features>`)
            .document("Feature metadata objects keyed by name.");
    }

    // --- Deprecated ---

    if (cluster.id !== undefined) {
        // Clusters with features get a pre-PR #3466 compat shim (`.with(Feature.X, ...)`) via
        // ClusterType.WithCompat.  See ClusterType.WithCompat JSDoc; scheduled for removal in 0.18.
        const clusterType = hasFeatures ? `ClusterType.WithCompat<typeof ${name}, ${name}>` : `typeof ${name}`;
        file.ns.atom(`export const Cluster: ${clusterType}`).document(`@deprecated Use {@link ${name}}.`);
    }
    file.ns.atom(`export const Complete: typeof ${name}`).document(`@deprecated Use {@link ${name}}.`);

    // --- Undocumented internals ---

    file.ns.atom(`export const Typing: ${name}`);

    // --- External alias and merge interface (outside namespace) ---

    if (cluster.id !== undefined) {
        file.atom(`export declare const ${file.clusterName}: typeof ${name}`).document(
            `@deprecated Use {@link ${name}}.`,
        );
    }

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
    if (members.length) {
        const body = file.statements(`export interface ${name} extends ClusterTyping {`, "}");
        for (const member of members) {
            body.atom(member);
        }
    } else {
        file.atom(`export interface ${name} extends ClusterTyping {}`);
    }
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
