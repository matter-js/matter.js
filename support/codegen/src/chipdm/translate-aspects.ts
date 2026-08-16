/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access, Quality } from "#model";
import { DataModelSyntaxError } from "./errors.js";
import { bool, child, str, type XmlElement } from "./xml.js";

const PRIVILEGES: Record<string, Access.Privilege> = {
    view: Access.Privilege.View,
    operate: Access.Privilege.Operate,
    manage: Access.Privilege.Manage,
    admin: Access.Privilege.Administer,
};

const QUALITIES: Record<string, Quality.Field> = {
    nullable: Quality.Field.nullable,
    scene: Quality.Field.scene,
    changeOmitted: Quality.Field.changesOmitted,
    quieterReporting: Quality.Field.quieter,
    largeMessage: Quality.Field.largeMessage,
    singleton: Quality.Field.singleton,
    diagnostics: Quality.Field.diagnostics,
    atomicWrite: Quality.Field.atomic,
};

const PERSISTENCE: Record<string, Quality.Field> = {
    nonVolatile: Quality.Field.nonvolatile,
    fixed: Quality.Field.fixed,
};

/**
 * Translate the access of a CHIP data model element.
 *
 * CHIP has no equivalent of our optional write ("R[W]") and omits the fabric flag on elements it considers implicitly
 * fabric scoped, so those differences require interpretation by the comparator.
 */
export function translateAccess(node: XmlElement) {
    const definition = child(node, "access");
    if (definition === undefined) {
        return;
    }

    const parts = new Array<string>();

    const read = bool(definition, "read");
    const write = str(definition, "write");
    if (read && write === "optional") {
        parts.push(Access.Rw.ReadWriteOption);
    } else if (read && write === "true") {
        parts.push(Access.Rw.ReadWrite);
    } else if (read) {
        parts.push(Access.Rw.Read);
    } else if (write === "true") {
        parts.push(Access.Rw.Write);
    } else if (write !== undefined) {
        throw new DataModelSyntaxError(`Unsupported write access "${write}"`);
    }

    if (bool(definition, "fabricSensitive")) {
        parts.push(Access.Fabric.Sensitive);
    } else if (bool(definition, "fabricScoped")) {
        parts.push(Access.Fabric.Scoped);
    }

    const readPrivilege = privilegeOf(definition, "readPrivilege") ?? privilegeOf(definition, "invokePrivilege");
    const writePrivilege = privilegeOf(definition, "writePrivilege");
    if (readPrivilege !== undefined && writePrivilege !== undefined) {
        parts.push(`${readPrivilege}${writePrivilege}`);
    } else if (readPrivilege !== undefined) {
        parts.push(readPrivilege);
    } else if (writePrivilege !== undefined) {
        parts.push(writePrivilege);
    }

    if (bool(definition, "timed")) {
        parts.push(Access.Timed.Required);
    }

    return new Access(parts.join(" "));
}

/**
 * Translate the quality of a CHIP data model element.
 *
 * CHIP does not express our "P" (reportable) quality so the comparator ignores it.
 */
export function translateQuality(node: XmlElement) {
    const definition = child(node, "quality");
    if (definition === undefined) {
        return;
    }

    const flags = new Array<Quality.Field>();

    for (const [attribute, flag] of Object.entries(QUALITIES)) {
        if (bool(definition, attribute)) {
            flags.push(flag);
        }
    }

    const persistence = str(definition, "persistence");
    if (persistence !== undefined) {
        const flag = PERSISTENCE[persistence];
        if (flag === undefined) {
            throw new DataModelSyntaxError(`Unsupported quality persistence "${persistence}"`);
        }
        flags.push(flag);
    }

    return new Quality(flags.join(" "));
}

function privilegeOf(node: XmlElement, attribute: string) {
    const name = str(node, attribute);
    if (name === undefined) {
        return;
    }

    const privilege = PRIVILEGES[name];
    if (privilege === undefined) {
        throw new DataModelSyntaxError(`Unsupported privilege "${name}"`);
    }

    return privilege;
}
