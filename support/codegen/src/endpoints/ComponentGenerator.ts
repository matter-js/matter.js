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
 * Generates per-cluster typed interfaces: component namespaces, flat Attributes/Commands/Events interfaces,
 * unified Components tuple, and Features.
 *
 * Component namespaces contain per-component Attributes/Commands/Events interfaces with native TS modifiers
 * (readonly for non-writable, ? for optional).  Flat interfaces extend component interfaces.  The unified
 * Components tuple references component interfaces directly.
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

        // Component naming: "Base" keeps its name, others get "Component" suffix.
        // Also disambiguate names that collide with type names in the scope.
        let interfaceName = name;
        if (name !== "Base") {
            interfaceName = `${name}Component`;
        }
        if (this.#scopeTypeNames.has(interfaceName)) {
            interfaceName = `${interfaceName}Component`;
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
     * Generate per-component namespaces with Attributes/Commands/Events interfaces, flat interfaces that
     * extend them, and a unified Components tuple.
     *
     * @returns object indicating which element types were emitted
     */
    generateAll(): { hasAttrs: boolean; hasCommands: boolean; hasEvents: boolean } {
        const result = { hasAttrs: false, hasCommands: false, hasEvents: false };

        // Determine which element types have content across all components
        for (const comp of this.#components) {
            if (comp.mandatoryAttrs.length || comp.optionalAttrs.length) {
                result.hasAttrs = true;
            }
            if (comp.commands.length) {
                result.hasCommands = true;
            }
            if (comp.mandatoryEvents.length || comp.optionalEvents.length) {
                result.hasEvents = true;
            }
        }

        if (!result.hasAttrs && !result.hasCommands && !result.hasEvents) {
            return result;
        }

        // Generate per-component namespaces
        for (const comp of this.#components) {
            this.#generateComponentNamespace(comp);
        }

        // Generate flat interfaces
        if (result.hasAttrs) {
            this.#generateFlatAttributesInterface();
        }
        if (result.hasCommands) {
            this.#generateFlatExtendsInterface("Commands", comp => comp.commands.length > 0);
        }
        if (result.hasEvents) {
            this.#generateFlatEventsInterface();
        }

        // Generate unified Components tuple
        this.#generateUnifiedComponents();

        return result;
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
     * Generate a per-component namespace containing Attributes, Commands, and/or Events interfaces.
     */
    #generateComponentNamespace(comp: ComponentInfo) {
        const hasAttrs = comp.mandatoryAttrs.length > 0 || comp.optionalAttrs.length > 0;
        const hasCommands = comp.commands.length > 0;
        const hasEvents = comp.mandatoryEvents.length > 0 || comp.optionalEvents.length > 0;

        if (!hasAttrs && !hasCommands && !hasEvents) {
            return;
        }

        const ns = this.file.interfaces.statements(`export namespace ${comp.name} {`, "}");
        ns.document(this.#componentDescription(comp.displayName, comp.condition));

        if (hasAttrs) {
            const intf = ns.statements("export interface Attributes {", "}");
            intf.shouldDelimit = false;
            for (const attr of comp.mandatoryAttrs) {
                const key = camelize(attr.name);
                const readonlyPrefix = !attr.writable ? "readonly " : "";
                intf.atom(`${readonlyPrefix}${key}: ${this.#attrType(attr)}`).document(attr);
            }
            for (const attr of comp.optionalAttrs) {
                const key = camelize(attr.name);
                const readonlyPrefix = !attr.writable ? "readonly " : "";
                intf.atom(`${readonlyPrefix}${key}?: ${this.#attrType(attr)}`).document(attr);
            }
        }

        if (hasCommands) {
            const intf = ns.statements("export interface Commands {", "}");
            intf.shouldDelimit = false;
            this.#generateCommandMethods(intf, comp.commands);
        }

        if (hasEvents) {
            const intf = ns.statements("export interface Events {", "}");
            intf.shouldDelimit = false;
            for (const evt of comp.mandatoryEvents) {
                const key = camelize(evt.name);
                intf.atom(`${key}: ${this.#eventPayloadType(evt)}`).document(evt);
            }
            for (const evt of comp.optionalEvents) {
                const key = camelize(evt.name);
                intf.atom(`${key}?: ${this.#eventPayloadType(evt)}`).document(evt);
            }
        }
    }

    /**
     * Generate a flat Attributes interface with all properties listed directly.
     *
     * We can't use `extends` because the same attribute may appear in multiple components with
     * different optionality (mandatory in one, optional in another), which causes TS2320 conflicts.
     * Instead, we list all properties directly with `readonly` where appropriate, all required.
     */
    #generateFlatAttributesInterface() {
        const allAttrs = new Map<string, AttributeModel>();
        for (const comp of this.#components) {
            for (const attr of [...comp.mandatoryAttrs, ...comp.optionalAttrs]) {
                const key = camelize(attr.name);
                if (!allAttrs.has(key)) {
                    allAttrs.set(key, attr);
                }
            }
        }

        if (!allAttrs.size) {
            return;
        }

        this.file.interfaces.undefine("Attributes");
        const intf = this.file.interfaces.statements("export interface Attributes {", "}");
        intf.shouldDelimit = false;

        const hasOptional = this.#components.some(c => c.optionalAttrs.length > 0);
        const hasFeatures = this.file.cluster.features.length > 0;
        const clusterName = this.file.cluster.name;
        const description = `Attributes that may appear in {@link ${clusterName}}.`;
        let details: string | undefined;
        if (hasOptional) {
            details = `Optional properties represent attributes that devices are not required to support.`;
        }
        if (hasFeatures) {
            details =
                (details ?? "") +
                ` Device support for attributes may ${hasOptional ? "also " : ""}be affected by a device's supported {@link Features}.`;
            details = details.trimStart();
        }
        intf.document({ description, details });

        for (const [key, attr] of allAttrs) {
            const readonlyPrefix = !attr.writable ? "readonly " : "";
            intf.atom(`${readonlyPrefix}${key}: ${this.#attrType(attr)}`).document(attr);
        }
    }

    /**
     * Generate a flat Events interface with all properties listed directly.
     *
     * Same rationale as Attributes — same event may be mandatory in one component and optional in another.
     */
    #generateFlatEventsInterface() {
        const allEvents = new Map<string, EventModel>();
        for (const comp of this.#components) {
            for (const evt of [...comp.mandatoryEvents, ...comp.optionalEvents]) {
                const key = camelize(evt.name);
                if (!allEvents.has(key)) {
                    allEvents.set(key, evt);
                }
            }
        }

        if (!allEvents.size) {
            return;
        }

        this.file.interfaces.undefine("Events");
        const intf = this.file.interfaces.statements("export interface Events {", "}");
        intf.shouldDelimit = false;

        const hasOptional = this.#components.some(c => c.optionalEvents.length > 0);
        const hasFeatures = this.file.cluster.features.length > 0;
        const clusterName = this.file.cluster.name;
        const description = `Events that may appear in {@link ${clusterName}}.`;
        let details: string | undefined;
        if (hasOptional) {
            details = `Devices may not support all of these events.`;
        }
        if (hasFeatures) {
            details =
                (details ?? "") +
                ` Device support for events may ${hasOptional ? "also " : ""}be affected by a device's supported {@link Features}.`;
            details = details.trimStart();
        }
        intf.document({ description, details });

        for (const [key, evt] of allEvents) {
            intf.atom(`${key}: ${this.#eventPayloadType(evt)}`).document(evt);
        }
    }

    /**
     * Generate a flat interface that extends all component interfaces of the given kind.
     *
     * Used for Commands where there's no optionality conflict.
     */
    #generateFlatExtendsInterface(kind: "Commands", filter: (comp: ComponentInfo) => boolean) {
        const components = this.#components.filter(filter);
        if (!components.length) {
            return;
        }

        this.file.interfaces.undefine(kind);
        const extendsClause = components.map(c => `${c.name}.${kind}`).join(", ");
        this.file.interfaces.atom(`export interface ${kind} extends ${extendsClause} {}`);
    }

    /**
     * Generate the unified Components tuple with entries referencing component interfaces.
     */
    #generateUnifiedComponents() {
        const tuple = this.file.interfaces.expressions("export type Components = [", "]");
        for (const comp of this.#components) {
            const hasAttrs = comp.mandatoryAttrs.length > 0 || comp.optionalAttrs.length > 0;
            const hasCommands = comp.commands.length > 0;
            const hasEvents = comp.mandatoryEvents.length > 0 || comp.optionalEvents.length > 0;

            if (!hasAttrs && !hasCommands && !hasEvents) {
                continue;
            }

            const bitmaps = this.#conditionBitmaps(comp.condition);
            for (const bitmap of bitmaps) {
                const obj = tuple.expressions("{", "}");
                obj.value(bitmap, "flags: ");
                if (hasAttrs) {
                    obj.atom("attributes", `${comp.name}.Attributes`);
                }
                if (hasCommands) {
                    obj.atom("commands", `${comp.name}.Commands`);
                }
                if (hasEvents) {
                    obj.atom("events", `${comp.name}.Events`);
                }
            }
        }
    }

    /**
     * Convert a variance condition to feature bitmaps.
     */
    #conditionBitmaps(condition: VarianceCondition): FeatureBitmap[] {
        if (Object.keys(condition).length === 0) {
            return [{}];
        }
        return conditionToBitmaps(condition, this.file.cluster);
    }

    #componentDescription(name: string, condition: VarianceCondition): string {
        const clusterName = this.file.cluster.name;
        if (Object.keys(condition).length === 0) {
            return `{@link ${clusterName}} always supports these elements.`;
        }
        return `{@link ${clusterName}} supports these elements if it supports feature "${name}".`;
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
