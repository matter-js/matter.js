/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
import { camelize, ImplementationError, InternalError } from "#general";
import {
    attribId,
    clusterId,
    ClusterModel,
    commandId,
    devtypeId,
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
    subjectId,
    systimeMs,
    systimeUs,
    uint16,
    uint32,
    uint64,
    uint8,
    ValueModel,
    vendorId,
} from "#model";
import { BitField, BitFlag } from "#schema/BitmapSchema.js";
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
    TlvUInt32,
    TlvUInt64,
    TlvUInt8,
} from "./TlvNumber.js";
import { TlvObject } from "./TlvObject.js";
import { TlvSchema } from "./TlvSchema.js";
import { TlvByteString, TlvString } from "./TlvString.js";

const cache = new WeakMap<ClusterModel | ValueModel, TlvSchema<unknown>>();

export function TlvOfModel(model: ClusterModel | ValueModel) {
    let tlv = cache.get(model);
    if (tlv === undefined) {
        tlv = generateTlv(model);
        cache.set(model, tlv);
    }
    return tlv;
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

    // The following are defined in the specification but we don't support them so they're apparently unused
    //[int24.name]: TlvInt24,
    //[int40.name]: TlvInt40,
    //[int48.name]: TlvInt48,
    //[uint24.name]: TlvInt24,
    //[uint40.name]: TlvInt40,
    //[uint48.name]: TlvInt48,
    //[map64.name]: TlvUInt64,
};

function generateTlv(model: ClusterModel | ValueModel): TlvSchema<unknown> {
    const metatype = model.effectiveMetatype;

    // Handle structs first because then we can exclude ClusterModel as type
    if (metatype === Metatype.object) {
        return generateStruct(model);
    }

    if (!(model instanceof ValueModel)) {
        throw new InternalError(`Inappropriate use of ${model.tag} model as datatype`);
    }

    let tlv: TlvSchema<unknown>;

    const metabase = model.metabase;
    if (metabase === undefined) {
        throw new InternalError(`No metabase for model ${model.name}`);
    }

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
    const entries = model.conformant.properties.map(p => [camelize(p.name), TlvOfModel(model)]);
    const fields = Object.fromEntries(entries);
    return TlvObject(fields);
}

function generateBitmap(model: ValueModel) {
    const { fields } = model.conformant;
    if (!fields.length) {
        return primitiveFallbackOf(model);
    }

    const entries = fields.map(field => {
        const name = camelize(field.name);
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
    const entry = model.conformant.fields.for("entry");

    const bounds = ModelBounds.createLengthBounds(model);

    if (entry === undefined) {
        return TlvArray(TlvAny, bounds);
    }

    return TlvArray(TlvOfModel(model), bounds);
}

function generateString(base: typeof TlvByteString | typeof TlvString, model: ValueModel) {
    const bounds = ModelBounds.createLengthBounds(model);
    if (bounds) {
        return base.bound(bounds);
    }
    return base;
}

function generateInteger(model: ValueModel): TlvSchema<unknown> {
    const base = model.metabase;
    if (base === undefined) {
        throw new InternalError(`No metabase for model ${model.path} type ${model.type}`);
    }

    const tlv = NumberMapping[base.name];
    if (tlv === undefined) {
        throw new InternalError(`No mapping for model ${model.path} metabase ${base.name}`);
    }

    if ("bound" in tlv) {
        const bounds = ModelBounds.createNumberBounds(model);
        if (bounds) {
            return (tlv as TlvNumberSchema).bound(bounds);
        }
    }

    return tlv;
}

/**
 * For bitmaps, if we have no fields defined, the element would be useless from matter.js if so constrained. So instead
 * revert to the primitive type.
 */
function primitiveFallbackOf(model: ValueModel) {
    const primitive = model.metabase?.primitiveBase;

    if (primitive === undefined) {
        throw new ImplementationError(`Could not determine primitive base for ${model.path}`);
    }

    return TlvOfModel(primitive);
}
