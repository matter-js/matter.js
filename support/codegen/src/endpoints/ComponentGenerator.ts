/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeModel,
    CommandModel,
    conditionToBitmaps,
    DatatypeModel,
    EventModel,
    FeatureBitmap,
    InferredComponent,
    Metatype,
    ValueModel,
    VarianceCondition,
} from "#model";
import type { ClusterFile } from "../clusters/ClusterFile.js";
import { asObjectKey, camelize } from "../util/string.js";
import type { Block } from "../util/TsFile.js";
import { TypeGenerator } from "./TypeGenerator.js";

/**
 * Generates per-cluster typed interfaces: Attributes, Commands, Events, Features.
 *
 * Each has a `Components` tuple that maps feature flags to subsets of the interface, allowing composition
 * via `Pick` / `Partial<Pick>`.
 */
export class ComponentGenerator {
    #components = Array<ComponentInfo>();
    #referencedTypes = new Map<string, ValueModel>();
    #definedNames = new Set<string>();
    #scopeTypeNames: Set<string>;
    types;

    constructor(private file: ClusterFile) {
        this.types = new TypeGenerator(file);

        // Pre-collect all type names in the scope so we can detect collisions with component names
        this.#scopeTypeNames = new Set<string>();
        const scope = file.scope;
        if (scope) {
            for (const child of file.cluster.children) {
                if (child instanceof DatatypeModel) {
                    try {
                        this.#scopeTypeNames.add(scope.nameFor(child));
                    } catch {
                        // Model may not be in scope
                    }
                }
            }
        }

        // Track local types that are referenced so we can generate definitions
        this.types.onReference = model => {
            const scope = file.scope;
            if (scope) {
                model = scope.canonicalModelFor(model);
                const location = scope.locationOf(model);
                if (location.isLocal) {
                    const name = scope.nameFor(model);
                    if (!this.#referencedTypes.has(name)) {
                        this.#referencedTypes.set(name, model);
                    }
                }
            }
        };
    }

    generateComponent(name: string, component: InferredComponent) {
        const commands = [
            ...component.mandatory.filter(model => model instanceof CommandModel && model.isRequest),
            ...component.optional.filter(model => model instanceof CommandModel && model.isRequest),
        ] as CommandModel[];

        const mandatoryAttrs = component.mandatory.filter(
            model => model instanceof AttributeModel && !AttributeModel.isGlobal(model),
        ) as AttributeModel[];

        const optionalAttrs = component.optional.filter(
            model => model instanceof AttributeModel && !AttributeModel.isGlobal(model),
        ) as AttributeModel[];

        const mandatoryEvents = component.mandatory.filter(model => model instanceof EventModel) as EventModel[];

        const optionalEvents = component.optional.filter(model => model instanceof EventModel) as EventModel[];

        const hasCommands = commands.length > 0;
        const hasAttrs = mandatoryAttrs.length > 0 || optionalAttrs.length > 0;
        const hasEvents = mandatoryEvents.length > 0 || optionalEvents.length > 0;

        // If no elements at all, skip
        if (!hasCommands && !hasAttrs && !hasEvents) {
            return;
        }

        // Disambiguate component names that collide with type names in the scope
        let interfaceName = name;
        if (this.#scopeTypeNames.has(name)) {
            interfaceName = `${name}Component`;
        }

        this.#components.push({
            name: interfaceName,
            displayName: name,
            condition: component.condition ?? {},
            commands,
            mandatoryAttrs,
            optionalAttrs,
            mandatoryEvents,
            optionalEvents,
        });
    }

    /**
     * Generate the Attributes interface + namespace with Components tuple.
     *
     * @returns true if an Attributes interface was emitted
     */
    generateAttributes(): boolean {
        const allAttrs = new Map<string, AttributeModel>();
        const componentEntries = Array<{
            name: string;
            condition: VarianceCondition;
            mandatory: string[];
            optional: string[];
        }>();

        for (const comp of this.#components) {
            if (!comp.mandatoryAttrs.length && !comp.optionalAttrs.length) {
                continue;
            }

            const mandatory = Array<string>();
            const optional = Array<string>();

            for (const attr of comp.mandatoryAttrs) {
                const key = camelize(attr.name);
                allAttrs.set(key, attr);
                mandatory.push(key);
            }

            for (const attr of comp.optionalAttrs) {
                const key = camelize(attr.name);
                allAttrs.set(key, attr);
                optional.push(key);
            }

            componentEntries.push({ name: comp.name, condition: comp.condition, mandatory, optional });
        }

        if (!allAttrs.size) {
            return false;
        }

        // Generate the interface with all attribute properties (no optionality — driven by Components)
        this.file.interfaces.undefine("Attributes");
        const intf = this.file.interfaces.statements("export interface Attributes {", "}");
        intf.shouldDelimit = false;

        const hasOptionalAttrs = componentEntries.some(e => e.optional.length > 0);
        const hasFeatures = this.file.cluster.features.length > 0;
        const clusterName = this.file.cluster.name;

        const attrDescription = `Attributes that may appear in {@link ${clusterName}}.`;
        let attrDetails: string | undefined;
        if (hasOptionalAttrs) {
            attrDetails = `Optional properties represent attributes that devices are not required to support.`;
        }
        if (hasFeatures) {
            attrDetails =
                (attrDetails ?? "") +
                ` Device support for attributes may ${hasOptionalAttrs ? "also " : ""}be affected by a device's supported {@link Features}.`;
            attrDetails = attrDetails.trimStart();
        }
        intf.document({ description: attrDescription, details: attrDetails });

        for (const [key, attr] of allAttrs) {
            intf.atom(`${key}: ${this.#attrType(attr)}`).document(attr);
        }

        // Generate the Components tuple inside a namespace
        const ns = this.file.interfaces.statements("export namespace Attributes {", "}");
        const tuple = ns.expressions("export type Components = [", "]");
        for (const entry of componentEntries) {
            this.#emitFlagEntries(tuple, entry.condition, obj => {
                if (entry.mandatory.length) {
                    obj.atom("mandatory", entry.mandatory.map(s => `"${s}"`).join(" | "));
                }
                if (entry.optional.length) {
                    obj.atom("optional", entry.optional.map(s => `"${s}"`).join(" | "));
                }
            });
        }

        return true;
    }

    /**
     * Generate per-component command interfaces and the Commands type alias + namespace with Components tuple.
     *
     * @returns true if a Commands type was emitted
     */
    generateCommands(): boolean {
        const componentEntries = Array<{ interfaceName: string; condition: VarianceCondition }>();

        for (const comp of this.#components) {
            if (!comp.commands.length) {
                continue;
            }

            componentEntries.push({ interfaceName: comp.name, condition: comp.condition });
        }

        if (!componentEntries.length) {
            return false;
        }

        // Generate per-component command interfaces inside the Commands namespace
        // We need to generate them first so the type alias can reference them
        const interfaceNames = Array<string>();

        // Build the type alias as intersection of all component interfaces
        for (const comp of this.#components) {
            if (!comp.commands.length) {
                continue;
            }
            interfaceNames.push(comp.name);
        }

        // Generate Commands interface extending all component interfaces
        this.file.interfaces.undefine("Commands");
        const extendsClause = interfaceNames.map(n => `Commands.${n}`).join(", ");
        this.file.interfaces.atom(`export interface Commands extends ${extendsClause} {}`);

        // Generate Commands namespace with per-component interfaces and Components tuple
        const ns = this.file.interfaces.statements("export namespace Commands {", "}");

        for (const comp of this.#components) {
            if (!comp.commands.length) {
                continue;
            }

            const intf = ns.statements(`export interface ${comp.name} {`, "}");
            intf.shouldDelimit = false;
            intf.document(this.#componentDescription("commands", comp.displayName, comp.condition));
            this.#generateCommandMethods(intf, comp.commands);
        }

        // Components tuple
        const tuple = ns.expressions("export type Components = [", "]");
        for (const comp of this.#components) {
            if (!comp.commands.length) {
                continue;
            }
            this.#emitFlagEntries(tuple, comp.condition, obj => {
                obj.atom("methods", comp.name);
            });
        }

        return true;
    }

    /**
     * Generate the Events interface + namespace with Components tuple.
     *
     * @returns true if an Events interface was emitted
     */
    generateEvents(): boolean {
        const allEvents = new Map<string, EventModel>();
        const componentEntries = Array<{
            name: string;
            condition: VarianceCondition;
            mandatory: string[];
            optional: string[];
        }>();

        for (const comp of this.#components) {
            if (!comp.mandatoryEvents.length && !comp.optionalEvents.length) {
                continue;
            }

            const mandatory = Array<string>();
            const optional = Array<string>();

            for (const evt of comp.mandatoryEvents) {
                const key = camelize(evt.name);
                allEvents.set(key, evt);
                mandatory.push(key);
            }

            for (const evt of comp.optionalEvents) {
                const key = camelize(evt.name);
                allEvents.set(key, evt);
                optional.push(key);
            }

            componentEntries.push({ name: comp.name, condition: comp.condition, mandatory, optional });
        }

        if (!allEvents.size) {
            return false;
        }

        // Generate the interface with all event properties
        this.file.interfaces.undefine("Events");
        const intf = this.file.interfaces.statements("export interface Events {", "}");
        intf.shouldDelimit = false;

        const hasOptionalEvents = componentEntries.some(e => e.optional.length > 0);
        const hasFeatures = this.file.cluster.features.length > 0;
        const clusterName = this.file.cluster.name;

        const eventDescription = `Events that may appear in {@link ${clusterName}}.`;
        let eventDetails: string | undefined;
        if (hasOptionalEvents) {
            eventDetails = `Devices may not support all of these events.`;
        }
        if (hasFeatures) {
            eventDetails =
                (eventDetails ?? "") +
                ` Device support for events may ${hasOptionalEvents ? "also " : ""}be affected by a device's supported {@link Features}.`;
            eventDetails = eventDetails.trimStart();
        }
        intf.document({ description: eventDescription, details: eventDetails });

        for (const [key, evt] of allEvents) {
            intf.atom(`${key}: ${this.#eventPayloadType(evt)}`).document(evt);
        }

        // Generate the Components tuple inside a namespace
        const ns = this.file.interfaces.statements("export namespace Events {", "}");
        const tuple = ns.expressions("export type Components = [", "]");
        for (const entry of componentEntries) {
            this.#emitFlagEntries(tuple, entry.condition, obj => {
                if (entry.mandatory.length) {
                    obj.atom("mandatory", entry.mandatory.map(s => `"${s}"`).join(" | "));
                }
                if (entry.optional.length) {
                    obj.atom("optional", entry.optional.map(s => `"${s}"`).join(" | "));
                }
            });
        }

        return true;
    }

    /**
     * Generate the Features string union type.
     */
    generateFeatures() {
        const features = this.file.cluster.features;
        if (!features.length) {
            return;
        }

        const names = features.map(f => `"${camelize(f.title ?? f.name, true)}"`);
        this.file.interfaces.atom(`export type Features = ${names.join(" | ")}`);
    }

    /**
     * Generate type definitions (enums, structs, bitmaps) for all types referenced by the component interfaces
     * and any types that TlvGenerator skipped (passed via {@link tlvSkippedTypes}).
     */
    generateTypes(tlvSkippedTypes?: Map<string, ValueModel>) {
        // Seed with types that TlvGenerator encountered but didn't define
        if (tlvSkippedTypes) {
            for (const [name, model] of tlvSkippedTypes) {
                if (!this.#referencedTypes.has(name)) {
                    this.#referencedTypes.set(name, model);
                }
            }
        }

        // Keep generating until stable — type definitions may reference other types
        let remaining = new Map(this.#referencedTypes);
        while (remaining.size > 0) {
            const batch = remaining;
            remaining = new Map<string, ValueModel>();

            for (const [, model] of batch) {
                this.#generateTypeDefinition(model);
            }

            // Check for new references added during generation
            for (const [name, ref] of this.#referencedTypes) {
                if (!this.#definedNames.has(name)) {
                    remaining.set(name, ref);
                }
            }
        }
    }

    /**
     * Convert a variance condition to feature bitmaps and emit one tuple entry per bitmap.
     */
    #emitFlagEntries(tuple: Block, condition: VarianceCondition, extraFields: (obj: Block) => void) {
        const bitmaps = this.#conditionBitmaps(condition);
        for (const bitmap of bitmaps) {
            const obj = tuple.expressions("{", "}");
            obj.value(bitmap, "flags: ");
            extraFields(obj);
        }
    }

    #componentDescription(elementKind: string, name: string, condition: VarianceCondition): string {
        const clusterName = this.file.cluster.name;
        if (Object.keys(condition).length === 0) {
            return `{@link ${clusterName}} always supports these ${elementKind}.`;
        }
        return `{@link ${clusterName}} supports these ${elementKind} if it supports feature "${name}".`;
    }

    #conditionBitmaps(condition: VarianceCondition): FeatureBitmap[] {
        if (Object.keys(condition).length === 0) {
            return [{}];
        }
        return conditionToBitmaps(condition, this.file.cluster);
    }

    #generateCommandMethods(block: Block, commands: CommandModel[]) {
        for (const command of commands) {
            this.file.addImport("@matter/general", "MaybePromise");

            let request = this.#referenceType(command, "");
            if (request.length) {
                request = `request: ${request}`;
            }

            const response = this.#referenceType(command.responseModel, "void");
            const returnType = response === "void" ? "MaybePromise" : `MaybePromise<${response}>`;

            block.atom(`${camelize(command.name)}(${request}): ${returnType}`).document(command);
        }
    }

    #attrType(attr: AttributeModel): string {
        let type = this.#valueType(attr, "any");
        if (attr.nullable) {
            type += " | null";
        }
        return type;
    }

    #eventPayloadType(event: EventModel): string {
        return this.#valueType(event, "void");
    }

    #referenceType(model: ValueModel | undefined, emptyAs: string): string {
        return this.types.reference(model, emptyAs);
    }

    #valueType(model: ValueModel | undefined, emptyAs: string): string {
        return this.types.valueType(model, emptyAs);
    }

    #generateTypeDefinition(model: ValueModel) {
        const scope = this.file.scope;
        if (!scope) {
            return;
        }

        model = scope.canonicalModelFor(model);
        const name = scope.nameFor(model);

        switch (model.effectiveMetatype) {
            case Metatype.enum:
                this.#generateEnum(name, model);
                break;

            case Metatype.object:
                this.#generateStruct(name, model);
                break;

            case Metatype.bitmap:
                this.#generateBitmap(name, model);
                break;
        }
    }

    #generateEnum(name: string, model: ValueModel) {
        if (this.#definedNames.has(name)) {
            return;
        }
        this.#definedNames.add(name);

        this.file.components.undefine(name);
        const enumBlock = this.file.components.expressions(`export enum ${name} {`, "}");
        enumBlock.document(model);

        model.children.forEach(child => {
            let childName = child.name;
            if (childName.match(/^\d+$/)) {
                childName = `E${childName}`;
            }
            enumBlock.atom(`${asObjectKey(childName)} = ${child.id}`).document(child);
        });
    }

    #generateStruct(name: string, model: ValueModel) {
        if (this.#definedNames.has(name)) {
            return;
        }
        this.#definedNames.add(name);

        this.file.components.undefine(name);
        const struct = this.file.components.statements(`export interface ${name} {`, "}");
        struct.document(model);

        model.members.forEach(field => {
            if (field.isDisallowed || (field.isDeprecated && !field.type)) {
                return;
            }

            let fieldType = this.#valueType(field, "any");
            if (field.nullable) {
                fieldType += " | null";
            }
            const optional = !field.mandatory ? "?" : "";
            struct.atom(`${camelize(field.name)}${optional}: ${fieldType}`).document(field);
        });
    }

    #generateBitmap(name: string, model: ValueModel) {
        if (this.#definedNames.has(name)) {
            return;
        }
        this.#definedNames.add(name);

        this.file.components.undefine(name);
        const bitmap = this.file.components.expressions(`export const ${name} = {`, "}");
        bitmap.document(model);

        // Also generate a type interface for the bitmap (declaration merging with the const)
        this.file.components.undefine(name);
        const intf = this.file.components.statements(`export interface ${name} {`, "}");
        intf.shouldDelimit = false;

        for (const child of model.members) {
            let constType: string | undefined;
            let fieldType: string | undefined;

            const constraint = child.effectiveConstraint;
            if (typeof constraint.value === "number") {
                this.file.addImport("!types/schema/BitmapSchema.js", "BitFlag");
                constType = `BitFlag(${constraint.value})`;
                fieldType = "boolean";
            } else if (typeof constraint.min === "number" && typeof constraint.max === "number") {
                if (child.effectiveMetatype === Metatype.enum) {
                    // Enum used in a bit range — ensure its definition is generated
                    const scope = this.file.scope;
                    if (scope) {
                        const defining = scope.definingModelFor(child);
                        if (defining) {
                            const enumName = scope.nameFor(defining);
                            if (!this.#referencedTypes.has(enumName)) {
                                this.#referencedTypes.set(enumName, defining);
                            }
                            this.file.addImport("!types/schema/BitmapSchema.js", "BitFieldEnum");
                            constType = `BitFieldEnum<${enumName}>`;
                            fieldType = enumName;
                        }
                    }
                }

                if (!constType) {
                    this.file.addImport("!types/schema/BitmapSchema.js", "BitField");
                    constType = `BitField`;
                    fieldType = "number";
                }

                constType = `${constType}(${constraint.min}, ${constraint.max - constraint.min + 1})`;
            } else {
                continue;
            }

            const fieldName = camelize(child.name);
            bitmap.atom(fieldName, constType).document(child);
            intf.atom(`${fieldName}?: ${fieldType}`).document(child);
        }
    }
}

interface ComponentInfo {
    name: string;
    displayName: string;
    condition: VarianceCondition;
    commands: CommandModel[];
    mandatoryAttrs: AttributeModel[];
    optionalAttrs: AttributeModel[];
    mandatoryEvents: EventModel[];
    optionalEvents: EventModel[];
}
