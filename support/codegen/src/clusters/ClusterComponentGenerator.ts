/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Access,
    AttributeModel,
    CommandModel,
    ElementTag,
    EventElement,
    EventModel,
    InferredComponent,
    Model,
    NamedComponent,
    ValueModel,
} from "#model";
import { Block } from "../util/TsFile.js";
import { camelize } from "../util/string.js";
import { ClusterFile } from "./ClusterFile.js";
import { DefaultValueGenerator } from "./DefaultValueGenerator.js";
import { TlvGenerator } from "./TlvGenerator.js";

function hex(n: number) {
    return `0x${n.toString(16)}`;
}

/** Generates cluster attributes, commands and events */
export class ClusterComponentGenerator {
    tlv: TlvGenerator;
    private defaults: DefaultValueGenerator;
    private file: ClusterFile;

    constructor(private target: Block) {
        this.file = target.file as ClusterFile;
        this.tlv = new TlvGenerator(this.file, this.file.types);
        this.defaults = new DefaultValueGenerator(this.tlv);
    }

    defineComponent(component: NamedComponent) {
        const name = `${component.name}Component`;
        const block = this.target
            .expressions(`export const ${name} = MutableCluster.Component({`, `})`)
            .document(component.documentation);
        return this.populateComponent(component, block);
    }

    populateComponent(component: InferredComponent, block: Block) {
        const mandatory = new Set(component.mandatory);

        const elements = [...component.optional, ...component.mandatory].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

        this.defineTypedElements(AttributeModel, elements, block, (model, add) => {
            const factoryParts = Array<string>("Attribute");
            if (model.fixed) {
                factoryParts.unshift("Fixed");
            }
            if (model.fabricScoped) {
                factoryParts.unshift("FabricScoped");
            }
            if (model.writable) {
                factoryParts.unshift("Writable");
            }
            if (!mandatory.has(model)) {
                factoryParts.unshift("Optional");
            }

            const factory = factoryParts.join("");
            this.file.addImport("!types/cluster/Cluster.js", factory);

            const tlvType = this.tlv.reference(model);

            const block = add(factory);
            block.atom(hex(model.id));
            block.atom(tlvType);

            const options = block.expressions("{", "}");
            const quality = model.effectiveQuality;
            if (quality.scene) {
                options.atom("scene", true);
            }
            if (quality.nonvolatile) {
                options.atom("persistent", true);
            }
            if (quality.changesOmitted) {
                options.atom("omitChanges", true);
            }

            // TODO - don't currently have a way to express "this field should default to the value of another field" as
            // indicated by model.default.reference
            const def = this.defaults.create(model);
            if (def !== undefined) {
                options.value(def, "default: ");
            }

            // View is the default
            const access = model.effectiveAccess;
            if (access.readPriv && access.readPriv != Access.Privilege.View) {
                options.atom("readAcl", this.mapPrivilege(access.readPriv));
            }

            // Operate is the default
            if (access.writePriv && access.writePriv != Access.Privilege.Operate) {
                options.atom("writeAcl", this.mapPrivilege(access.writePriv));
            }

            if (access.timed) {
                options.atom("timed", true);
            }

            if (!options.length) {
                options.remove();
            }
        });

        this.defineTypedElements(CommandModel, elements, block, (model, add) => {
            if (!model.isRequest) {
                return;
            }

            let factory;
            if (mandatory.has(model)) {
                factory = "Command";
            } else {
                factory = "OptionalCommand";
            }
            this.file.addImport("!types/cluster/Cluster.js", factory);

            const block = add(factory);
            block.atom(hex(model.id));
            block.atom(this.tlv.reference(model));

            // Note - we end up mapping "status" response type to TlvNoResponse. Technically "no response" and "status
            // response" are different things but there's currently only a single place in the specification where it
            // makes a difference and neither we nor CHIP implement it yet
            const responseModel = model.responseModel;
            if (responseModel) {
                block.atom(hex(responseModel.id));
                block.atom(this.tlv.reference(responseModel));
            } else {
                this.file.addImport("!types/cluster/Cluster.js", "TlvNoResponse");
                block.atom(hex(model.id));
                block.atom("TlvNoResponse");
            }

            const options = block.expressions("{", "}");
            const access = model.effectiveAccess;
            if (access.writePriv && access.writePriv !== Access.Privilege.Operate) {
                options.atom("invokeAcl", this.mapPrivilege(access.writePriv));
            }

            if (access.timed) {
                options.atom("timed", true);
            }

            if (!options.length) {
                options.remove();
            }
        });

        this.defineTypedElements(EventModel, elements, block, (model, add) => {
            let factory;
            if (mandatory.has(model)) {
                factory = "Event";
            } else {
                factory = "OptionalEvent";
            }
            this.file.addImport("!types/cluster/Cluster.js", factory);
            this.file.addImport("!types/globals/Priority.js", "Priority");

            const priority = camelize(model.priority ?? EventElement.Priority.Debug, true);

            const block = add(factory);
            block.atom(hex(model.id));
            block.atom(`Priority.${priority}`);
            block.atom(this.tlv.reference(model));

            const options = block.expressions("{", "}");
            const access = model.effectiveAccess;
            if (access.readPriv && access.readPriv !== Access.Privilege.View) {
                options.atom("readAcl", this.mapPrivilege(access.readPriv));
            }

            if (!options.length) {
                options.remove();
            }
        });

        return block;
    }

    private mapPrivilege(privilege: Access.Privilege) {
        this.file.addImport("#model", "AccessLevel");
        return `AccessLevel.${Access.PrivilegeName[privilege]}`;
    }

    private defineTypedElements<T extends (new (...args: any[]) => Model) & { Tag: ElementTag }>(
        type: T,
        elements: ValueModel[],
        target: Block,
        define: (model: InstanceType<T>, add: (factory: string) => Block) => void,
    ) {
        const typed = elements.filter(e => e instanceof type && (e.type || !e.isDeprecated));

        const definitions = target.expressions(`${type.Tag}s: {`, "}");
        for (const model of typed) {
            define(model as InstanceType<T>, factory =>
                definitions.expressions(`${camelize(model.name)}: ${factory}(`, ")").document(model),
            );
        }
        if (!definitions.length) {
            definitions.remove();
        }
    }
}
