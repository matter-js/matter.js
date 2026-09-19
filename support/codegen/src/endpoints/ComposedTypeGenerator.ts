/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger } from "#general";
import { RequirementElement, RequirementModel } from "#model";
import { serialize } from "../util/string.js";
import { Block } from "../util/TsFile.js";
import { EndpointFile } from "./EndpointFile.js";

const logger = Logger.get("ComposedTypeGenerator");

/**
 * Set when a requirement the specification states reaches no generated artifact.
 *
 * Logging alone is what let eighty-seven requirements go missing for a release: the log line was there every build
 * and nobody read it. The run's exit status is the part a script can act on.
 */
export let requirementsLost = false;

export function reportRequirementLost(message: string) {
    logger.error(message);
    requirementsLost = true;
}

/**
 * Requirement kinds that describe a cluster on this endpoint, handled by {@link RequirementGenerator}.
 */
const CLUSTER_KINDS = new Set<string>([
    RequirementElement.ElementType.ServerCluster,
    RequirementElement.ElementType.ClientCluster,
]);

/**
 * Requirement kinds that describe another device type this one composes.
 */
const COMPOSED_KINDS = new Set<string>([
    RequirementElement.ElementType.DeviceType,
    RequirementElement.ElementType.Condition,
]);

/**
 * Emits the device types a device type requires of its child endpoints.
 *
 * The specification states these alongside cluster requirements, and until now codegen kept only the cluster ones. The
 * rest reached the model and stopped there, so a device-type requirement such as "a Smoke CO Alarm has a Power Source
 * device type" existed in no artifact anything could act on.
 */
export class ComposedTypeGenerator {
    #deviceTypes = Array<RequirementModel>();
    #conditions = Array<RequirementModel>();

    constructor(private file: EndpointFile) {
        for (const requirement of file.model.requirements) {
            switch (requirement.element) {
                case RequirementElement.ElementType.DeviceType:
                    this.#deviceTypes.push(requirement);
                    break;

                case RequirementElement.ElementType.Condition:
                    this.#conditions.push(requirement);
                    break;
            }
        }
    }

    generate() {
        this.#generateSet("deviceTypes", this.#deviceTypes, [
            "The device types this device type requires of its child endpoints per the Matter specification.",
        ]);

        this.#generateSet("conditions", this.#conditions, [
            "Conditions this device type's requirements are stated against, keyed by condition name, per the Matter",
            "specification.",
        ]);
    }

    #generateSet(name: string, requirements: RequirementModel[], documentation: string[]) {
        const usable = requirements.filter(requirement => {
            if (requirement.isDisallowed) {
                return false;
            }

            if (requirement.id === undefined && requirement.type === undefined) {
                reportRequirementLost(
                    `Skipping ${this.file.model.name} ${requirement.element} requirement ${requirement.name} because it names neither a device type ID nor a type`,
                );
                return false;
            }

            return true;
        });

        if (!usable.length) {
            return;
        }

        const block = this.file.requirements.expressions(`export const ${name} = {`, "}");
        block.document(documentation.join("\n"));

        // Partition before emitting so mandatory always precedes optional, whatever order the requirements arrive in
        const mandatory = usable.filter(requirement => requirement.isMandatory);
        const optional = usable.filter(requirement => !requirement.isMandatory);

        if (mandatory.length) {
            this.#generateEntries(block.expressions("mandatory: {", "}"), mandatory);
        }

        if (optional.length) {
            this.#generateEntries(block.expressions("optional: {", "}"), optional);
        }
    }

    #generateEntries(target: Block, requirements: RequirementModel[]) {
        for (const requirement of requirements) {
            // A device type may require several endpoints of the same type, each configured differently.
            // instanceNumber rather than instance: it is the reading the model validators use, and it rejects a
            // value that counts no instance.
            const { instanceNumber } = requirement;
            const key = instanceNumber === undefined ? requirement.name : `${requirement.name}${instanceNumber}`;

            const entry = target.expressions(`${key}: {`, "}");

            if (requirement.id !== undefined) {
                entry.atom("deviceType", `0x${requirement.id.toString(16)}`);
            }

            // The model qualifies a condition as "<declarer>.<condition>", and the key already carries the condition
            const declaredBy = requirement.type?.split(".")[0];
            if (declaredBy !== undefined && declaredBy !== "") {
                entry.atom("declaredBy", serialize(declaredBy));
            }

            this.#describe(entry, requirement);
            this.#generateNested(entry, requirement);
        }
    }

    #describe(entry: Block, requirement: RequirementModel) {
        const conformance = requirement.conformance.toString();
        if (conformance && conformance !== "M" && conformance !== "O") {
            entry.atom("conformance", serialize(conformance));
        }

        if (requirement.constraint && !requirement.constraint.isEmpty) {
            entry.atom("constraint", serialize(requirement.constraint.toString()));
        }
    }

    /**
     * Emit what the specification requires of a composed device type beyond its identity.
     *
     * Without this the entries for two instances of one device type are identical, and what the specification says
     * distinguishes them — Battery Storage's AC and DC Electrical Sensors differ only here — reaches nothing.
     */
    #generateNested(entry: Block, requirement: RequirementModel) {
        const nested = requirement.requirements;
        if (!nested.length) {
            return;
        }

        const list = entry.expressions("requires: [", "]");

        for (const child of nested) {
            const item = list.expressions("{", "}");
            item.atom("element", serialize(child.element));
            item.atom("name", serialize(child.name));
            if (child.id !== undefined) {
                item.atom("id", `0x${child.id.toString(16)}`);
            }
            this.#describe(item, child);
            this.#generateNested(item, child);
        }
    }

    /**
     * Fail on a requirement kind nothing claims.
     *
     * A silent drop here is what let eighty-seven requirements go missing for a whole release, so a new member of
     * {@link RequirementElement.ElementType} stops the build until something handles it.
     */
    static assertAllKindsHandled(file: EndpointFile) {
        for (const requirement of file.model.requirements) {
            const { element } = requirement;
            if (CLUSTER_KINDS.has(element) || COMPOSED_KINDS.has(element)) {
                continue;
            }

            throw new InternalError(
                `${file.model.name} states a ${element} requirement (${requirement.name}) that no generator claims`,
            );
        }
    }
}
