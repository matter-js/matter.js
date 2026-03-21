/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelBounds } from "#common/ModelBounds.js";
import { TlvAttributeId } from "#datatype/AttributeId.js";
import { TlvClusterId } from "#datatype/ClusterId.js";
import { TlvCommandId } from "#datatype/CommandId.js";
import { TlvDeviceTypeId } from "#datatype/DeviceTypeId.js";
import { TlvEndpointNumber } from "#datatype/EndpointNumber.js";
import { TlvEventId } from "#datatype/EventId.js";
import { TlvFabricId } from "#datatype/FabricId.js";
import { TlvFabricIndex } from "#datatype/FabricIndex.js";
import { TlvGroupId } from "#datatype/GroupId.js";
import { TlvNodeId } from "#datatype/NodeId.js";
import { TlvSubjectId } from "#datatype/SubjectId.js";
import { TlvVendorId } from "#datatype/VendorId.js";
import { BitField, BitFlag } from "#schema/BitmapSchema.js";
import { camelize, ImplementationError, InternalError } from "@matter/general";
import {
    attribId,
    clusterId,
    ClusterModel,
    commandId,
    devtypeId,
    ElementTag,
    endpointNo,
    epochS,
    epochUs,
    eventId,
    fabricId,
    fabricIdx,
    groupId,
    int16,
    int32,
    int64,
    int8,
    map16,
    map32,
    map8,
    Metatype,
    nodeId,
    percent,
    percent100ths,
    posixMs,
    Scope,
    subjectId,
    systimeMs,
    systimeUs,
    uint16,
    uint24,
    uint32,
    uint64,
    uint8,
    ValueModel,
    vendorId,
} from "@matter/model";
import { TlvAny } from "./TlvAny.js";
import { TlvArray } from "./TlvArray.js";
import { TlvBoolean } from "./TlvBoolean.js";
import { TlvNullable } from "./TlvNullable.js";
import {
    TlvBitmap,
    TlvDouble,
    TlvEnum,
    TlvEpochS,
    TlvEpochUs,
    TlvFloat,
    TlvInt16,
    TlvInt32,
    TlvInt64,
    TlvInt8,
    TlvNumberSchema,
    TlvPercent,
    TlvPercent100ths,
    TlvPosixMs,
    TlvSysTimeMS,
    TlvSysTimeUs,
    TlvUInt16,
    TlvUInt24,
    TlvUInt32,
    TlvUInt64,
    TlvUInt8,
} from "./TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "./TlvObject.js";
import { TlvSchema } from "./TlvSchema.js";
import { TlvByteString, TlvString } from "./TlvString.js";

const cache = new WeakMap<ClusterModel | ValueModel, TlvSchema<unknown>>();

/**
 * Obtain the TLV schema for a model or namespace element.
 *
 * Accepts a {@link ClusterModel}, {@link ValueModel}, or an object with a `schema` property (e.g. a
 * {@link ClusterNamespace.Attribute}).
 */
export function TlvOfModel(source: ClusterModel | ValueModel | { schema: ClusterModel | ValueModel }) {
    const model = "schema" in source && !(source instanceof ValueModel) ? source.schema : source;
    let result = cache.get(model);
    if (result === undefined) {
        result = generateTlv(model);
        cache.set(model, result);
    }
    return result;
}

const NumberMapping: Record<string, TlvSchema<unknown>> = {
    // Signed int
    [int8.name]: TlvInt8,
    [int16.name]: TlvInt16,
    [int32.name]: TlvInt32,
    [int64.name]: TlvInt64,

    // Unsigned int
    [uint8.name]: TlvUInt8,
    [uint16.name]: TlvUInt16,
    [uint24.name]: TlvUInt24,
    [uint32.name]: TlvUInt32,
    [uint64.name]: TlvUInt64,

    // Bitmap
    [map8.name]: TlvUInt8,
    [map16.name]: TlvUInt16,
    [map32.name]: TlvUInt32,

    // ID
    [attribId.name]: TlvAttributeId,
    [clusterId.name]: TlvClusterId,
    [commandId.name]: TlvCommandId,
    [devtypeId.name]: TlvDeviceTypeId,
    [endpointNo.name]: TlvEndpointNumber,
    [eventId.name]: TlvEventId,
    [fabricId.name]: TlvFabricId,
    [fabricIdx.name]: TlvFabricIndex,
    [groupId.name]: TlvGroupId,
    [nodeId.name]: TlvNodeId,
    [subjectId.name]: TlvSubjectId,
    [vendorId.name]: TlvVendorId,

    // Percent
    [percent.name]: TlvPercent,
    [percent100ths.name]: TlvPercent100ths,

    // Time
    [epochUs.name]: TlvEpochUs,
    [epochS.name]: TlvEpochS,
    [posixMs.name]: TlvPosixMs,
    [systimeUs.name]: TlvSysTimeUs,
    [systimeMs.name]: TlvSysTimeMS,

    // The following are defined in the specification but have no corresponding TlvSchema
    //[int24.name]: TlvInt24,
    //[int40.name]: TlvInt40,
    //[int48.name]: TlvInt48,
    //[uint40.name]: TlvUInt40,
    //[uint48.name]: TlvUInt48,
    //[map64.name]: TlvUInt64,
};

function generateTlv(model: ClusterModel | ValueModel): TlvSchema<unknown> {
    const metatype = model.effectiveMetatype;

    // Structs can be ClusterModel or ValueModel; handle separately since they don't require metabase
    if (metatype === Metatype.object) {
        if (!(model instanceof ValueModel)) {
            return generateStruct(model);
        }

        let tlv: TlvSchema<unknown> = generateStruct(model);

        if (model.quality.nullable) {
            tlv = TlvNullable(tlv);
        }

        return tlv;
    }

    if (!(model instanceof ValueModel)) {
        throw new InternalError(`Inappropriate use of ${model.tag} model as datatype`);
    }

    const metabase = model.metabase;
    if (metabase === undefined) {
        throw new InternalError(`No metabase for model ${model.name}`);
    }

    let tlv: TlvSchema<unknown>;

    switch (metatype) {
        case Metatype.any:
            tlv = TlvAny;
            break;

        case Metatype.boolean:
            tlv = TlvBoolean;
            break;

        case Metatype.bitmap:
            tlv = generateBitmap(model);
            break;

        case Metatype.array:
            tlv = generateList(model);
            break;

        case Metatype.bytes:
            tlv = generateString(TlvByteString, model);
            break;

        case Metatype.string:
            tlv = generateString(TlvString, model);
            break;

        case Metatype.enum:
            // Enum enforcement at TLV level is apparently type-only
            tlv = TlvEnum();
            break;

        case Metatype.float:
            if (metabase.name === "single") {
                tlv = TlvFloat;
            } else {
                tlv = TlvDouble;
            }
            break;

        case Metatype.integer:
            tlv = generateInteger(model);
            break;

        default:
            throw new InternalError(`No TLV mapping for model ${model.name}`);
    }

    if (model.quality.nullable) {
        tlv = TlvNullable(tlv);
    }

    return tlv;
}

function generateStruct(model: ClusterModel | ValueModel) {
    // TODO - opportunity to deduplicate struct schemas: when a model extends a defining model without changing
    // conformant fields, we could reuse the TlvSchema from the defining model via definingModel lookup

    const fields = {} as Record<string, any>;
    for (const p of model.conformant.properties) {
        const schema = TlvOfModel(p);
        const id = p.id ?? 0;
        fields[p.propertyName] = p.mandatory ? TlvField(id, schema) : TlvOptionalField(id, schema);
    }
    return TlvObject(fields);
}

function generateBitmap(model: ValueModel) {
    // Use all fields without conformance filtering — bitmap entries represent physical bit positions that must always
    // be present in the TLV schema regardless of conformance (which is a logical constraint, not a wire-format one)
    const fields = Scope(model).membersOf(model, { tags: [ElementTag.Field] });

    const entries = fields.map(field => {
        const name = camelize(field.title ?? field.name);
        const { constraint } = field;

        if (typeof constraint.value === "number") {
            return [name, BitFlag(constraint.value)];
        }

        if (typeof constraint.min === "number" && typeof constraint.max === "number") {
            return [name, BitField(constraint.min, constraint.max - constraint.min + 1)];
        }

        throw new ImplementationError(`Bit field ${field.path} is not properly constrained`);
    });

    const metabaseName = model.metabase?.name;
    const num = metabaseName ? NumberMapping[metabaseName] : undefined;
    if (!num) {
        throw new ImplementationError(`Could not determine numeric type for bitmap ${model.path} type "${model.type}"`);
    }

    return TlvBitmap(num as TlvNumberSchema, Object.fromEntries(entries));
}

function generateList(model: ValueModel) {
    const entry = model.conformant.fields("entry");

    const bounds = ModelBounds.createLengthBounds(model);

    if (entry === undefined) {
        return TlvArray(TlvAny, bounds);
    }

    return TlvArray(TlvOfModel(entry), bounds);
}

function generateString(base: typeof TlvByteString | typeof TlvString, model: ValueModel) {
    const bounds = ModelBounds.createLengthBounds(model);
    if (bounds) {
        return base.bound(bounds);
    }
    return base;
}

function generateInteger(model: ValueModel): TlvSchema<unknown> {
    // Walk the type chain checking each ancestor against NumberMapping.
    // This finds specialized types like epoch-us before reaching the
    // root primitive (uint64).  Mirrors the codegen approach in
    // specializedNumberTypeFor() (NumberConstants.ts).
    let tlv: TlvSchema<unknown> | undefined;
    for (let base: ValueModel | undefined = model; base; base = base.base as ValueModel | undefined) {
        tlv = NumberMapping[base.name];
        if (tlv !== undefined) {
            break;
        }
    }

    if (tlv === undefined) {
        throw new InternalError(`No numeric TLV mapping for model ${model.path} type ${model.type}`);
    }

    if ("bound" in tlv) {
        const bounds = ModelBounds.createNumberBounds(model);
        if (bounds) {
            return (tlv as TlvNumberSchema).bound(bounds);
        }
    }

    return tlv;
}
