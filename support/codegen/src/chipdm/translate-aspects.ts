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

const QUALITIES: Record<string, keyof Quality.Ast> = {
    nullable: "nullable",
    scene: "scene",
    changeOmitted: "changesOmitted",
    quieterReporting: "quieter",
    largeMessage: "largeMessage",
    singleton: "singleton",
    diagnostics: "diagnostics",
    atomicWrite: "atomic",
};

const PERSISTENCE: Record<string, keyof Quality.Ast> = {
    nonVolatile: "nonvolatile",
    fixed: "fixed",
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

    const read = bool(definition, "read");
    const write = str(definition, "write");

    let rw;
    if (read && write === "optional") {
        rw = Access.Rw.ReadWriteOption;
    } else if (read && write === "true") {
        rw = Access.Rw.ReadWrite;
    } else if (read) {
        rw = Access.Rw.Read;
    } else if (write === "true") {
        rw = Access.Rw.Write;
    } else if (write !== undefined) {
        throw new DataModelSyntaxError(`Unsupported write access "${write}"`);
    }

    let fabric;
    if (bool(definition, "fabricSensitive")) {
        fabric = Access.Fabric.Sensitive;
    } else if (bool(definition, "fabricScoped")) {
        fabric = Access.Fabric.Scoped;
    }

    // Each privilege is stated on its own, so build the access directly; the textual form states them as one token
    // from which read and write can only be inferred
    return new Access({
        rw,
        readPriv: privilegeOf(definition, "readPrivilege") ?? privilegeOf(definition, "invokePrivilege"),
        writePriv: privilegeOf(definition, "writePrivilege") ?? privilegeOf(definition, "invokePrivilege"),
        fabric,
        timed: bool(definition, "timed"),
    });
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

    const ast: Quality.Ast = {};

    for (const [attribute, field] of Object.entries(QUALITIES)) {
        if (bool(definition, attribute)) {
            ast[field] = true;
        }
    }

    const persistence = str(definition, "persistence");
    if (persistence !== undefined) {
        const field = PERSISTENCE[persistence];
        if (field === undefined) {
            throw new DataModelSyntaxError(`Unsupported quality persistence "${persistence}"`);
        }
        ast[field] = true;
    }

    return new Quality(ast);
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
