/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger } from "#general";
import { Specification } from "#model";
import { camelize } from "../../util/string.js";
import { ScanDirective, repairIncomingHtml } from "./repairs/cluster-html-repairs.js";
import { scanDocument } from "./scan-document.js";
import { ClusterReference, GlobalReference, HtmlReference } from "./spec-types.js";

const logger = Logger.get("load-clusters");

const FAKE_CLUSTER_NAMES = ["New", "Sample", "Disco Ball", "Super Disco Ball"];

const GlobalTypeSections: Partial<Record<Specification, Record<string, GlobalReference["format"]>>> = {
    core: {
        "Base Data Types": "datatypes",
        "Derived Data Types": "datatypes",
        "Global Elements": "elements",
        "Time of Day": "standalone",
        "Status Code Table": "statusCodes",
    },
};

/**
 * As we scan the document we maintain a stack of "collectors" that ingest sections.
 */
interface SubsectionCollector {
    /**
     * The collector is active until it returns false for a section.
     */
    collects(ref: HtmlReference): boolean;

    /**
     * Adds a section for which the collector has asserted ownership via {@link collects}.
     */
    collect(ref: HtmlReference): void;
}

/**
 * Collect the bits that define a cluster.  Here we are just building a tree of HTML nodes.  Conversion to Matter
 * elements happens in translate-cluster.
 *
 * The primary purpose of this function is to load clusters but it also loads bare "global" types when encountered.
 * There are not many global types and this allows us to process specs in a single pass.
 */
export function* loadClusters(clusters: HtmlReference): Generator<ClusterReference | GlobalReference> {
    // The definition we are building
    let definition: ClusterReference | GlobalReference | undefined;

    // A stack of functions that ingest subsections
    const collectors = Array<SubsectionCollector>();

    for (const subref of scanDocument(clusters)) {
        if (definition) {
            const directive = repairIncomingHtml(subref, definition);

            switch (directive) {
                case ScanDirective.IGNORE:
                    continue;

                case ScanDirective.POP:
                    collectors.pop();
                    break;

                case ScanDirective.POP2:
                    collectors.pop();
                    collectors.pop();
                    break;

                case ScanDirective.NAMESPACE:
                    if (definition?.type === "cluster") {
                        if (!definition.namespace) {
                            definition.namespace = [];
                        }
                        definition.namespace.push(subref);
                    }
                    break;
            }
        }

        while (collectors.length && !collectors[collectors.length - 1].collects(subref)) {
            collectors.pop();
        }

        if (!collectors.length) {
            if (definition) {
                yield definition;
            }

            definition = identifyCluster(subref);
            if (definition) {
                collect(definition.xref.section, clusterCollector);
            } else {
                definition = identifyGlobal(subref);
                if (definition) {
                    collectDetails(definition);
                }
            }
        }

        if (collectors.length) {
            collectors[collectors.length - 1].collect(subref);
        }
    }

    if (definition) {
        yield definition;
    }

    function identifyCluster(ref: HtmlReference): ClusterReference | undefined {
        // Core spec (and cluster spec >= 1.2) convention for clusters is heading suffixed with "Cluster"
        if (ref.name.endsWith(" Cluster")) {
            if (ref.xref.document === Specification.Core && Number.parseInt(ref.xref.section) < 3) {
                // There's some noise in early sections of core spec
                return;
            }

            const name = ref.name.slice(0, ref.name.length - 8);
            if (FAKE_CLUSTER_NAMES.indexOf(name) !== -1) {
                collect(ref.xref.section, () => {});
                return;
            }

            return {
                type: "cluster",
                ...ref,
                name: ref.name.slice(0, ref.name.length - 8),
                path: ref.path,
            };
        }

        // Cluster spec convention is one cluster per sub-section except the first sub-section which summarizes the
        // section
        if (ref.xref.document === Specification.Cluster) {
            const sectionPath = ref.xref.section.split(".");
            if (sectionPath.length === 2 && sectionPath[1] !== "1") {
                return { type: "cluster", ...ref };
            }
        }
    }

    function collect(
        subsection: string,
        collect: (ref: HtmlReference) => void,
        collects?: (ref: HtmlReference) => boolean,
    ) {
        if (collects === undefined) {
            collects = ref => isSubsectionOf(subsection, ref);
        }
        collectors.push({ collect, collects });
    }

    function isSubsectionOf(section: string, ref: HtmlReference) {
        return ref.xref.section.startsWith(section);
    }

    function clusterCollector(subref: HtmlReference) {
        if (definition?.type !== "cluster") {
            throw new InternalError(`Cluster collector invoked without an active cluster definition`);
        }

        if (subref.xref.section === definition.xref.section) {
            definition.prose = subref.prose;
        }

        const name = camelize(subref.name).toLowerCase();
        switch (name) {
            case "clusterid":
            case "clusterids":
            case "clusteridentifiers":
                defineElement("ids", subref);
                break;

            case "features":
                defineElement("features", subref);
                break;

            case "revisionhistory":
                defineElement("revisions", subref);
                break;

            case "classification":
                defineElement("classifications", subref);
                break;

            case "attributes":
                defineElement("attributes", subref);
                break;

            case "commands":
                defineElement("commands", subref);
                break;

            case "events":
                defineElement("events", subref);
                break;

            case "statuscodes":
                if (subref.tables) {
                    // Until 1.3 status codes were in a specialized table in the "status codes" sections
                    defineElement("statusCodes", subref);
                } else {
                    // After 1.3 the people that wanted it to be a proper datatype won halfway and it was moved into a
                    // "StatusCodeEnum Type" section, but still nested under a "Status Codes" section that only has a
                    // single subsection.  Mmm committees
                    collectDatatypes(definition, subref);
                }
                break;

            case "datatypes":
                // Datatypes are different than other sections.  The types themselves are defined in subsections
                collectDatatypes(definition, subref);
                break;

            case "derivedclusternamespace":
                // The cluster "namespaces" seem to be a collection of enum definitions and misc. prose describing
                // behavioral definitions.  We collect all of the sections here that appear to define values and sort
                // out semantics during translation
                collectNamespace(definition, subref);
                break;

            default:
                // "Attribute Set" is suffixed to sections containing a subset of attributes
                if (name.endsWith("attributeset")) {
                    if (!definition.attributeSets) {
                        definition.attributeSets = [];
                    }
                    logger.debug(`attribute set ${subref.name} § ${subref.xref.section}`);
                    definition.attributeSets.push(subref);
                    if (subref.tables) {
                        collectDetails(subref);
                    }
                    break;
                }
        }
    }

    function collectDatatypes(definition: ClusterReference, subref: HtmlReference) {
        collect(subref.xref.section, datatypeRef => {
            if (!definition.datatypes) {
                definition.datatypes = [];
            }
            datatypeRef.name = datatypeRef.name.replace(/\s+type$/i, "");
            logger.debug(`datatype ${datatypeRef.name} § ${datatypeRef.xref.section}`);
            definition.datatypes.push(datatypeRef);
            if (datatypeRef.tables) {
                // Probably a struct, enum or bitmap.  These are sometimes followed with sections that
                // detail individual items
                collectDetails(datatypeRef, other => {
                    // A field in the "datatypes" section following a datatype is a spec bug and should have been part
                    // of the previous section.  Detect this and treat as if it is a proper subsection
                    if (other.name.endsWith(" Field")) {
                        return true;
                    }
                    if (other.prose?.[0]?.textContent?.match(/^This field /)) {
                        return true;
                    }

                    return false;
                });
            }
        });
    }

    function collectNamespace(definition: ClusterReference, subref: HtmlReference) {
        collect(subref.xref.section, ref => {
            // Only collect namespace sections that appear to have a defining table
            if (!ref.tables || !ref.tables[0].fields.includes("name")) {
                return;
            }

            if (!definition.namespace) {
                definition.namespace = [];
            }
            logger.debug(`namespace section ${ref.name} § ${ref.xref.section}`);
            definition.namespace.push(ref);
            collectDetails(ref);
        });
    }

    function collectDetails(ref: HtmlReference, memberDetector?: (ref: HtmlReference) => boolean) {
        const section = ref.detailSection ?? ref.xref.section;
        collect(
            ref.detailSection ?? ref.xref.section,
            subref => {
                if (!ref.details) {
                    ref.details = [];
                }
                ref.details.push(subref);

                // Attempt to collect sub-details if the new section is more specific than the current section
                if (subref.xref.section > ref.xref.section) {
                    collectDetails(subref);
                }
            },
            other => {
                const isSubsection = isSubsectionOf(section, other);
                if (isSubsection) {
                    return true;
                }

                // Support specialized detection of sections that *should* be subsections but are not
                if (memberDetector?.(other)) {
                    return true;
                }

                return false;
            },
        );
    }

    function defineElement(
        name:
            | "ids"
            | "features"
            | "attributes"
            | "commands"
            | "events"
            | "revisions"
            | "classifications"
            | "statusCodes",
        ref: HtmlReference,
    ) {
        if (definition?.type !== "cluster") {
            throw new InternalError(`Cannot define element ${name} because there is no active cluster definition`);
        }

        if (!ref.tables) {
            // Sometimes there's a section with no table to indicate no elements
            if (ref.prose?.[0]?.textContent?.match(/this cluster has no|no cluster specific/i)) {
                return;
            }
            logger.warn("no defining table in definition of", name, "for", ref.name, `(${ref.path})`);
            return;
        }

        // Sometimes there's an empty table to indicate no elements
        if (!ref.tables[0].rows.length) {
            return;
        }

        if (definition[name]?.tables) {
            logger.warn("ignoring tertiary definition of", name, "for", ref.name);
            return;
        }

        logger.debug(`${name} § ${ref.xref.section}`);

        collectDetails((definition[name] = ref));
    }

    function identifyGlobal(ref: HtmlReference): GlobalReference | undefined {
        const format = GlobalTypeSections[ref.xref.document]?.[ref.name];
        if (
            // Lists
            format ||
            // Most standalone types are designated like this
            ref.name.endsWith(" Type") ||
            // Some don't have the "Type" suffix
            ref.name.match(/\S+(?:Bitmap|Enum|Struct)$/i)
        ) {
            return {
                type: "global",
                format: format ?? "standalone",
                ...ref,
                name: ref.name.replace(/\s+type$/i, ""),
            };
        }
    }
}
