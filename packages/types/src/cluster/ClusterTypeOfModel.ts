/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Priority } from "#globals/Priority.js";
import { camelize } from "@matter/general";
import { Access, AccessLevel, ClusterModel, DefaultValue, EventElement, GLOBAL_IDS } from "@matter/model";
import { AttributeId } from "../datatype/AttributeId.js";
import { CommandId } from "../datatype/CommandId.js";
import { EventId } from "../datatype/EventId.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvOfModel } from "../tlv/TlvOfModel.js";
import { TlvVoid } from "../tlv/TlvVoid.js";
import { ClusterType } from "./ClusterType.js";

const PRIORITY_MAP: Record<string, Priority> = {
    [EventElement.Priority.Debug]: Priority.Debug,
    [EventElement.Priority.Info]: Priority.Info,
    [EventElement.Priority.Critical]: Priority.Critical,
};

function mapPrivilege(priv: Access.Privilege | undefined, fallback: AccessLevel): AccessLevel {
    if (priv === undefined) {
        return fallback;
    }
    return Access.PrivilegeLevel[priv] ?? fallback;
}

/**
 * Given a {@link ClusterModel}, produce a runtime {@link ClusterType} structurally equivalent to the
 * codegen-produced "Complete" cluster.
 */
export function ClusterTypeOfModel(model: ClusterModel): ClusterType {
    // Revision — use scope-resolved ClusterRevision attribute (0xfffd) which traverses inheritance
    const revisionAttr = model.attributes(0xfffd);
    const revision = typeof revisionAttr?.default === "number" ? revisionAttr.default : 1;

    // Features
    const features = {} as Record<string, any>;
    for (const f of model.features) {
        const key = camelize(f.title ?? f.name);
        if (typeof f.constraint.value === "number") {
            features[key] = BitFlag(f.constraint.value);
        }
    }

    // Attributes — include all (conformant + conditional + deprecated-with-type), skip globals and disallowed.
    // Deprecated attributes without a type (e.g. WindowCovering VelocityLift) are excluded since they have no
    // schema and the codegen also omits them.
    const attributes = {} as Record<string, ClusterType.Attribute>;
    for (const attr of model.attributes) {
        if (GLOBAL_IDS.has(attr.id) || attr.isDisallowed || attr.effectiveMetatype === undefined) {
            continue;
        }

        const key = attr.propertyName;
        const access = attr.effectiveAccess;
        const quality = attr.effectiveQuality;
        const writable = attr.writable;

        const entry: ClusterType.Attribute = {
            id: AttributeId(attr.id),
            schema: TlvOfModel(attr),
            optional: !attr.mandatory,
            writable,
            fixed: attr.fixed,
            fabricScoped: attr.fabricScoped,
            scene: quality.scene ?? false,
            persistent: writable || attr.fabricScoped ? (quality.nonvolatile ?? true) : (quality.nonvolatile ?? false),
            omitChanges: quality.changesOmitted ?? false,
            timed: access.timed ?? false,
            readAcl: mapPrivilege(access.readPriv, AccessLevel.View),
            default: DefaultValue(model.scope, attr, true),
            isConditional: false,
            mandatoryIf: [],
            optionalIf: [],
            unknown: false,
        };

        if (writable) {
            entry.writeAcl = mapPrivilege(access.writePriv, AccessLevel.View);
        }

        attributes[key] = entry;
    }

    // Commands — include all (conformant + conditional), skip disallowed and type-less
    const commands = {} as Record<string, ClusterType.Command>;
    for (const cmd of model.commands) {
        if (!cmd.isRequest || cmd.isDisallowed) {
            continue;
        }

        const key = cmd.propertyName;
        const access = cmd.effectiveAccess;
        const responseModel = cmd.responseModel;

        commands[key] = {
            optional: !cmd.mandatory,
            requestId: CommandId(cmd.id),
            requestSchema: TlvOfModel(cmd),
            responseId: responseModel ? CommandId(responseModel.id) : CommandId(cmd.id),
            responseSchema: responseModel ? TlvOfModel(responseModel) : TlvVoid,
            invokeAcl: mapPrivilege(access.writePriv, AccessLevel.Operate),
            timed: access.timed ?? false,
            isConditional: false,
            mandatoryIf: [],
            optionalIf: [],
        };
    }

    // Events — include all (conformant + conditional), skip disallowed and type-less
    const events = {} as Record<string, ClusterType.Event>;
    for (const evt of model.events) {
        if (evt.isDisallowed) {
            continue;
        }
        const key = evt.propertyName;
        const access = evt.effectiveAccess;

        events[key] = {
            id: EventId(evt.id),
            schema: evt.members.length ? TlvOfModel(evt) : TlvNoArguments,
            priority: PRIORITY_MAP[evt.priority ?? EventElement.Priority.Debug] ?? Priority.Debug,
            optional: !evt.mandatory,
            readAcl: mapPrivilege(access.readPriv, AccessLevel.View),
            isConditional: false,
            mandatoryIf: [],
            optionalIf: [],
            unknown: false,
        };
    }

    return ClusterType({
        id: model.id ?? 0,
        name: model.name,
        revision,
        features,
        attributes,
        commands,
        events,
    });
}
