/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDeepEqual, Logger } from "#general";
import {
    AnyElement,
    AttributeModel,
    ClusterModel,
    CommandModel,
    DatatypeModel,
    ElementTag,
    FieldModel,
    MatterModel,
    Metatype,
    Model,
    SemanticNamespaceModel,
    status as statusType,
    ValidateModel,
    ValueModel,
} from "#model";

const logger = Logger.get("create-model");

/**
 * Create and validate the final model for export
 **/
export function finalizeModel(matter: MatterModel) {
    const scopedDatatypes = collectScopedDatatypes(matter);

    const semanticNamespaces = new Array<SemanticNamespaceModel>();

    for (const child of matter.children) {
        if (child instanceof ClusterModel) {
            patchIllegalCrossClusterReferences(child, scopedDatatypes);
            patchClusterTypes(child);
            patchOptionsTypes(child);
            patchStatusTypes(child);
        } else if (child instanceof SemanticNamespaceModel) {
            semanticNamespaces.push(child);
        }
    }

    updateSemanticNamespaces(semanticNamespaces, matter);
    ejectZigbee(matter);
    deleteRedundantXrefs(matter);

    logger.info(`validate ${matter.name}`);

    return Logger.nest(() => {
        return ValidateModel(matter);
    });
}

export type ScopedDatatypes = Record<string, Model | undefined>;

function updateSemanticNamespaces(semanticNamespaces: SemanticNamespaceModel[], matter: MatterModel) {
    const namespace = matter.get(DatatypeModel, "namespace");
    if (!namespace) {
        throw new Error("Namespace datatype not found in model. This should never happen");
    }

    namespace.children = semanticNamespaces
        .map(
            ns =>
                new FieldModel({
                    id: ns.id,
                    name: ns.name,
                    details: ns.details,
                }),
        )
        .filter(({ id }) => id !== undefined)
        .sort((a, b) => a.id! - b.id!);
}

function collectScopedDatatypes(matter: MatterModel) {
    const scopedDatatypes = {} as ScopedDatatypes;

    for (const cluster of matter.children) {
        for (const child of cluster.children) {
            if (child.tag !== ElementTag.Datatype) {
                continue;
            }

            if (child.name in scopedDatatypes) {
                scopedDatatypes[child.name] = undefined;
                continue;
            }

            scopedDatatypes[child.name] = child;
        }
    }

    return scopedDatatypes;
}

/**
 * Get the properties of children without xrefs so we can compare types using isDeepEqual
 */
function childrenIdentity(model: ValueModel) {
    return model.children.map(child => {
        const properties = child.valueOf();
        delete properties.xref;
        delete (properties as any).conformance;
        return properties;
    });
}

/**
 * CHIP defines datatypes in a global scope.  This is not how the specification actually works but the behavior
 * continually leaks into cluster definitions where clusters reference datatypes defined in other clusters.
 *
 * Repair this by identifying missing datatypes that have a corresponding datatype definition of the same name in
 * exactly one other cluster.  When detected, replace the datatype name with a qualified name referencing the other
 * cluster.
 */
function patchIllegalCrossClusterReferences(cluster: ClusterModel, scopedDatatypes: ScopedDatatypes) {
    cluster.visit(model => {
        // Only applies to models with a defined type
        if (model.type === undefined) {
            return;
        }

        // If there is a base the type name is already valid
        const base = model.base;
        if (base !== undefined) {
            return;
        }

        // Look for the datatype in other clusters
        const datatype = scopedDatatypes[model.type];
        if (datatype === undefined) {
            return;
        }

        // Add qualified name
        model.type = `${datatype.parent!.name}.${datatype.name}`;
    });
}

/**
 * Some enum definitions are left hanging that we can fix with a quick scan comparing names.  I believe this only
 * affects enums in ColorControlCluster from the spec but the logic is generic and safe so applying to all clusters
 */
function patchClusterTypes(cluster: ClusterModel) {
    // First gather existing datatypes so we treat them as canonical
    const datatypes = {} as { [name: string]: ValueModel };
    cluster.all(DatatypeModel).forEach(datatype => (datatypes[datatype.name] = datatype));

    // Now add any element that may be promoted to a datatype
    cluster.visit(model => {
        if (model instanceof ValueModel && model.children.length) {
            switch (model.effectiveMetatype) {
                case Metatype.enum:
                case Metatype.object:
                case Metatype.bitmap:
                    break;

                default:
                    return;
            }

            const existing = datatypes[model.name];
            if (!existing || (existing.parent !== cluster && model.parent === cluster)) {
                datatypes[model.name] = model;
            }
        }
    });

    // Update the type for datatypes that a.) share the name but do not have children, or b.) duplicate this datatype
    const promote = new Set<ValueModel>();
    cluster.visit(model => {
        if (!(model instanceof ValueModel)) {
            return;
        }

        if (model.name === "Status" && model.type === "uint8") {
            model.type = "status";
            return;
        }

        const datatype = datatypes[model.name];
        if (!datatype || datatype === model) {
            return;
        }

        const metabase = datatype.metabase;
        if (!metabase || model.metabase !== metabase) {
            return;
        }

        if (model.children.length) {
            if (isDeepEqual(childrenIdentity(datatype), childrenIdentity(model))) {
                model.type = datatype.name;
                model.children = [];
                promote.add(datatype);
            }
        } else if (model.type === undefined || model.type.startsWith("enum")) {
            model.type = datatype.name;
            promote.add(datatype);
        }
    });

    // Ensure that any referenced datatypes are top-level named datatypes
    promote.forEach(model => {
        if (model.parent === cluster) {
            return;
        }

        if (model.owner(ClusterModel) !== cluster) {
            return;
        }

        cluster.children.push(
            new DatatypeModel({
                name: model.name,
                type: model.type,
                xref: model.xref,
                children: model.children,
            }),
        );

        model.type = model.name;
    });
}

/**
 * The optionsMask/OptionsOverrides pattern defined by LevelControl is used by a number of clusters.  These usually
 * specify their type as "map8" rather than the appropriate type.  This function fixes this.
 *
 * As of 1.4 the types have been corrected, so this code is only applicable to older versions.  Added tests to detect
 * type specified as "map8" that effectively disable this logic when not needed.
 */
function patchOptionsTypes(cluster: ClusterModel) {
    for (const element of cluster.children) {
        if (!(element instanceof CommandModel)) {
            continue;
        }

        if (!cluster.get(AttributeModel, "Options")) {
            return;
        }

        const mask = element.get(FieldModel, "OptionsMask");
        if (mask?.type === "map8") {
            mask.type = "Options";
        }
        const overrides = element.get(FieldModel, "OptionsOverride");
        if (overrides?.type === "map8") {
            overrides.type = "Options";
        }
    }
}

/**
 * Dangling enum8s called "Status" are status codes.
 */
function patchStatusTypes(cluster: ClusterModel) {
    for (const element of cluster.children) {
        if (!(element instanceof CommandModel)) {
            continue;
        }

        const status = element.get(FieldModel, "Status");
        if (!status || status.type !== "enum8") {
            continue;
        }

        const defining = status.definingModel;
        if (defining) {
            continue;
        }

        status.type = statusType.name;
    }
}

/**
 * Remove xrefs from children that are identical to their parent.  They only add bloat.
 */
function deleteRedundantXrefs(model: Model) {
    const toDereference = Array<Model>();

    model.visit(m => {
        if (m !== model && m.xref && m.xref === m.parent?.xref) {
            toDereference.push(m);
        }
    });

    for (const model of toDereference) {
        model.xref = undefined;
    }
}

function isZigbee(model: Model, zigbeeFeatures?: string[]) {
    const conformance = (model as { conformance?: unknown }).conformance?.toString();
    if (conformance === undefined) {
        return;
    }
    if (conformance.match(/\[?[Zz]igbee\]?(?:, D)?/)) {
        return true;
    }

    if (zigbeeFeatures === undefined) {
        return;
    }
    for (const feature of zigbeeFeatures) {
        if (conformance === feature || conformance === `[${feature}]`) {
            return true;
        }
    }
}

/**
 * Eject any element that is zigbee-only.
 *
 * The spec randomly litters elements with the undocumented conformance name "Zigbee".  Assuming this indicates the
 * element is zigbee-only (so, not sure why it is in Matter specification) we do not want it.
 *
 * If an element doesn't mention Zigbee directly it may still be Zigbee if it's dependent on a feature that is
 * Zigbee-only.  So we get rid of these too.  HOWEVER the only place this occurs as of 1.3 is the thermostat SCH
 * features which is marked deprecated too.  We override back to O until we get confirmation to this question:
 *
 *   https://github.com/espressif/esp-matter/issues/923#issuecomment-2105989691
 *
 * ...so the feature components of this code are unnecessary.  Leaving as is for now though.
 */
function ejectZigbee(model: Model, zigbeeFeatures?: string[]) {
    if (model instanceof ClusterModel) {
        for (const feature of model.features) {
            if (isZigbee(feature)) {
                if (!zigbeeFeatures) {
                    zigbeeFeatures = [feature.name];
                } else {
                    zigbeeFeatures.push(feature.name);
                }
            }
        }
    }

    const filtered = [] as Model[];
    for (const child of model.children) {
        if (isZigbee(child, zigbeeFeatures)) {
            continue;
        }
        filtered.push(child);
        ejectZigbee(child, zigbeeFeatures);
    }
    if (filtered.length !== model.children.length) {
        model.children = filtered as AnyElement[];
    }
}
