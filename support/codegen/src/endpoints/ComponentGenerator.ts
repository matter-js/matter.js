/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { capitalize, decamelize } from "#general";
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
import { asObjectKey, camelize, serialize } from "../util/string.js";
import type { Block } from "../util/TsFile.js";
import { TypeGenerator } from "./TypeGenerator.js";

/**
 * Generates per-cluster typed interfaces: flat Attributes/Commands/Events interfaces, per-component
 * attribute/command/event interfaces, unified Components tuple, and Features.
 *
 * Flat interfaces list ALL elements from ALL components with clean types (all required, no `?`).  Per-component
 * interfaces (`BaseAttributes`, `BaseCommands`, `BaseEvents`, etc.) carry per-property JSDoc and are referenced
 * from the Components tuple so that IDE go-to-definition navigates to readable, documented interfaces.
 */
export class ComponentGenerator {
    #components = Array<ComponentInfo>();
    #referencedTypes = new Map<string, ValueModel>();
    #definedNames = new Set<string>();
    types;

    constructor(private file: ClusterFile) {
        this.types = new TypeGenerator(file);

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

        this.#components.push({
            name,
            condition: component.condition ?? {},
            commands,
            mandatoryAttrs,
            optionalAttrs,
            mandatoryEvents,
            optionalEvents,
        });
    }

    /**
     * Generate flat interfaces, per-component command interfaces, and unified Components tuple.
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

        // Generate flat interfaces listing ALL elements from ALL components.
        // Order: per-component attribute interfaces, flat Attributes, per-component command interfaces,
        // flat Commands, flat Events.
        if (result.hasAttrs) {
            for (const comp of this.#components) {
                if (comp.mandatoryAttrs.length || comp.optionalAttrs.length) {
                    this.#generateAttributeInterface(comp);
                }
            }
            this.#generateFlatAttributesInterface();
        }
        if (result.hasCommands) {
            for (const comp of this.#components) {
                if (comp.commands.length) {
                    this.#generateCommandInterface(comp);
                }
            }
            this.#generateFlatCommandsInterface();
        }
        if (result.hasEvents) {
            for (const comp of this.#components) {
                if (comp.mandatoryEvents.length || comp.optionalEvents.length) {
                    this.#generateEventInterface(comp);
                }
            }
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
     * Generate type definitions (enums, structs, bitmaps) for all types referenced by the component interfaces.
     */
    generateTypes() {
        // Discover standalone compound datatypes that aren't referenced by any interface.  Without this, types
        // not referenced by attributes/commands/events would be silently dropped.
        const scope = this.file.scope;
        if (scope) {
            for (const datatype of this.file.cluster.all(DatatypeModel)) {
                if (!datatype.definesFields || !datatype.children.length) {
                    continue;
                }
                const name = scope.nameFor(datatype);
                if (!this.#referencedTypes.has(name)) {
                    this.#referencedTypes.set(name, datatype);
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
     * Generate a per-component attribute interface (e.g. `BaseAttributes`, `LightingAttributes`).
     *
     * Mandatory attributes are required; optional attributes use `?`.  Full JSDoc on each property.
     * These interfaces are referenced from the Components tuple and composed via recursive intersection
     * in {@link ClusterState} to produce state types with IDE go-to-definition and hover support.
     */
    #generateAttributeInterface(comp: ComponentInfo) {
        const name = `${comp.name}Attributes`;
        const intf = this.file.interfaces.statements(`export interface ${name} {`, "}");
        intf.shouldDelimit = false;
        intf.document(this.#componentDescription(comp.name, comp.condition));

        for (const attr of comp.mandatoryAttrs) {
            intf.atom(`${attr.propertyName}: ${this.#attrType(attr)}`).document(attr);
        }
        for (const attr of comp.optionalAttrs) {
            intf.atom(`${attr.propertyName}?: ${this.#attrType(attr)}`).document(attr);
        }
    }

    /**
     * Generate a per-component command interface (e.g. `BaseCommands`, `FrequencyCommands`).
     */
    #generateCommandInterface(comp: ComponentInfo) {
        const name = `${comp.name}Commands`;
        const intf = this.file.interfaces.statements(`export interface ${name} {`, "}");
        intf.shouldDelimit = false;
        intf.document(this.#componentDescription(comp.name, comp.condition));
        this.#generateCommandMethods(intf, comp.commands);
    }

    /**
     * Generate a per-component event interface (e.g. `BaseEvents`, `MomentarySwitchEvents`).
     *
     * Mandatory events are required; optional events use `?`.  Full JSDoc on each property.
     * These interfaces are referenced from the Components tuple and composed via recursive intersection
     * in {@link ClusterEvents} to produce event observable types with IDE go-to-definition and hover support.
     */
    #generateEventInterface(comp: ComponentInfo) {
        const name = `${comp.name}Events`;
        const intf = this.file.interfaces.statements(`export interface ${name} {`, "}");
        intf.shouldDelimit = false;
        intf.document(this.#componentDescription(comp.name, comp.condition));

        for (const evt of comp.mandatoryEvents) {
            intf.atom(`${evt.propertyName}: ${this.#eventPayloadType(evt)}`).document(evt);
        }
        for (const evt of comp.optionalEvents) {
            intf.atom(`${evt.propertyName}?: ${this.#eventPayloadType(evt)}`).document(evt);
        }
    }

    /**
     * Generate a flat Attributes interface listing ALL attributes from ALL components.
     *
     * All properties are required (no `?`) with clean types.  Writability is not encoded here; it is a
     * runtime/model concern.  Optionality information lives in the Components tuple modifier maps instead.
     */
    #generateFlatAttributesInterface() {
        // Deduplicate: an attribute may appear in multiple components (e.g. minLevel in Lighting and NotLighting)
        const seen = new Set<string>();

        this.file.interfaces.undefine("Attributes");
        const intf = this.file.interfaces.statements("export interface Attributes {", "}");
        intf.shouldDelimit = false;

        const clusterName = this.file.cluster.name;
        const hasOptional = this.#components.some(c => c.optionalAttrs.length > 0);
        const hasFeatures = this.file.cluster.features.length > 0;
        const description = `Attributes that may appear in {@link ${clusterName}}.`;
        let details: string | undefined;
        if (hasOptional || hasFeatures) {
            details = `Some properties may be optional if device support is not mandatory.`;
        }
        if (hasFeatures) {
            details += ` Device support may also be affected by a device's supported {@link Features}.`;
        }
        intf.document({ description, details });

        for (const comp of this.#components) {
            for (const attr of [...comp.mandatoryAttrs, ...comp.optionalAttrs]) {
                const key = attr.propertyName;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);

                intf.atom(`${key}: ${this.#attrType(attr)}`).document(attr);
            }
        }
    }

    /**
     * Generate a flat Commands interface extending all per-component command interfaces.
     */
    #generateFlatCommandsInterface() {
        const clauses = [] as string[];
        for (const comp of this.#components) {
            if (comp.commands.length) {
                clauses.push(`${comp.name}Commands`);
            }
        }

        if (clauses.length) {
            this.file.interfaces.undefine("Commands");
            const clusterName = this.file.cluster.name;
            this.file.interfaces
                .extendsInterface("Commands", clauses)
                .document(`Commands that may appear in {@link ${clusterName}}.`);
        }
    }

    /**
     * Generate a flat Events interface listing ALL events from ALL components.
     *
     * All properties are required (no `?`) with clean payload types.  This differs from the per-component
     * event interfaces which use `?` for optional events.  The flat interface is used by `ClusterEvents` for
     * `EventObservable<E[K]>` value type extraction where `undefined` contamination must be avoided.
     */
    #generateFlatEventsInterface() {
        const seen = new Set<string>();

        this.file.interfaces.undefine("Events");
        const intf = this.file.interfaces.statements("export interface Events {", "}");
        intf.shouldDelimit = false;

        const clusterName = this.file.cluster.name;
        const hasOptional = this.#components.some(c => c.optionalEvents.length > 0);
        const hasFeatures = this.file.cluster.features.length > 0;
        const description = `Events that may appear in {@link ${clusterName}}.`;
        let details: string | undefined;
        if (hasOptional || hasFeatures) {
            details = `Some properties may be optional if device support is not mandatory.`;
        }
        if (hasFeatures) {
            details += ` Device support may also be affected by a device's supported {@link Features}.`;
        }
        intf.document({ description, details });

        for (const comp of this.#components) {
            for (const evt of [...comp.mandatoryEvents, ...comp.optionalEvents]) {
                const key = evt.propertyName;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);

                intf.atom(`${key}: ${this.#eventPayloadType(evt)}`).document(evt);
            }
        }
    }

    /**
     * Generate the unified Components tuple.
     *
     * Each element type references its per-component interface directly (e.g. `attributes: BaseAttributes`,
     * `commands: BaseCommands`, `events: BaseEvents`).
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
                    obj.atom("attributes", `${comp.name}Attributes`);
                }

                if (hasCommands) {
                    obj.atom("commands", `${comp.name}Commands`);
                }

                if (hasEvents) {
                    obj.atom("events", `${comp.name}Events`);
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

            block.atom(`${command.propertyName}(${request}): ${returnType}`).document(command);
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

        // For cluster status codes, also generate appropriate error classes
        if (model.name === "StatusEnum" || model.name === "StatusCodeEnum") {
            this.#defineErrors(name, model, this.file.components);
        }
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
            struct.atom(`${field.propertyName}${optional}: ${fieldType}`).document(field);
        });
    }

    #generateBitmap(name: string, model: ValueModel) {
        if (this.#definedNames.has(name)) {
            return;
        }
        this.#definedNames.add(name);

        this.file.components.undefine(name);
        const intf = this.file.components.statements(`export interface ${name} {`, "}");
        intf.document(model);

        for (const child of model.members) {
            let fieldType: string | undefined;

            const constraint = child.effectiveConstraint;
            if (typeof constraint.value === "number") {
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
                            fieldType = enumName;
                        }
                    }
                }

                if (!fieldType) {
                    fieldType = "number";
                }
            } else {
                continue;
            }

            const fieldName = child.propertyName;
            intf.atom(`${fieldName}?: ${fieldType}`).document(child);
        }
    }

    #defineErrors(enumName: string, model: ValueModel, block: Block) {
        for (const field of model.fields) {
            let { name: errName } = field;
            if (errName === "Success") {
                continue;
            }

            if (!errName.endsWith("Error")) {
                errName = `${errName}Error`;
            }

            this.file.addImport("!types/common/StatusResponseError.js", "StatusResponseError");
            const globalStatus = this.#importGlobalStatus();

            if (this.file.fileExtension === ".d.ts") {
                // Ambient class declaration — constructor signature only, no body
                const error = block.statements(`export class ${errName} extends StatusResponseError {`, "}");
                const constructor = error.expressions("constructor(", ")");
                constructor.shouldDelimit = false;
                constructor.atom(`message?: string`);
                constructor.atom(`code?: ${globalStatus}`);
                constructor.atom(`clusterCode?: number`);

                const ref = `${enumName}.${field.name}`;
                const description = `Thrown for cluster status code {@link ${ref}}.`;
                error.document({ description, xref: field.effectiveXref });
            } else {
                const error = block.statements(`export class ${errName} extends StatusResponseError {`, "}");
                const constructor = error.expressions(
                    "constructor(",
                    ") {\n            super(message, code, clusterCode);\n        }",
                );
                constructor.shouldDelimit = false;

                let { description: message } = field;
                if (message === undefined) {
                    message = capitalize(decamelize(field.name, " "));
                }
                if (message.endsWith(".")) {
                    message = message.slice(0, message.length - 1);
                }
                constructor.atom(`message = ${serialize(message)}`);
                constructor.atom(`code = ${globalStatus}.Failure`);

                const ref = `${enumName}.${field.name}`;
                constructor.atom(`clusterCode = ${ref}`);

                const description = `Thrown for cluster status code {@link ${ref}}.`;
                error.document({ description, xref: field.effectiveXref });
            }
        }
    }

    #importGlobalStatus() {
        const needsAlias =
            this.file.scope?.owner?.get(DatatypeModel, "Status") ||
            this.file.scope?.owner?.get(DatatypeModel, "StatusEnum");

        if (needsAlias) {
            this.file.addImport("!types/globals/Status.js", "Status as GlobalStatus");
            return "GlobalStatus";
        }

        this.file.addImport("!types/globals/Status.js", "Status");
        return "Status";
    }
}

interface ComponentInfo {
    name: string;
    condition: VarianceCondition;
    commands: CommandModel[];
    mandatoryAttrs: AttributeModel[];
    optionalAttrs: AttributeModel[];
    mandatoryEvents: EventModel[];
    optionalEvents: EventModel[];
}
