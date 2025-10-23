/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "attribute", name: "FeatureMap", xref: "core§7.13.2",

    details: "Each instance of a cluster shall support this attribute." +
        "\n" +
        "The FeatureMap attribute shall indicate whether the server supports zero or more optional cluster " +
        "features. A cluster feature is a set of cluster elements that are mandatory or optional for a " +
        "defined feature of the cluster. If a cluster feature is supported by the cluster instance, then the " +
        "corresponding bit shall be set to 1, otherwise the bit shall be set to 0 (zero). All undefined bits " +
        "in this attribute shall be set to 0 (zero)." +
        "\n" +
        "The set of cluster elements that are designated as mandatory (M) are implicitly part of the " +
        "mandatory cluster feature set, and do not have a bit in the FeatureMap attribute." +
        "\n" +
        "A cluster specification shall support this attribute if the cluster supports features. If a cluster " +
        "specification is revised to support features (and so this attribute), each bit in the FeatureMap " +
        "attribute shall have a defined default value (1 or 0), to conform with the previous revision of the " +
        "cluster specification, that did not support the FeatureMap attribute. The value of 1 means the " +
        "feature elements were mandatory (M) in the previous revision. The value of 0 (zero) means the " +
        "elements were optional in the previous revision." +
        "\n" +
        "Any newly created feature set of a cluster shall be dependent on that cluster." +
        "\n" +
        "Feature sets are revision controlled as part of a cluster using the ClusterRevision attribute. The " +
        "cluster specification is the independent element that is revision controlled. A remote application " +
        "reading the FeatureMap and ClusterRevision attribute will then know exactly what features are " +
        "supported in the cluster instance." +
        "\n" +
        "Each feature set shall be well defined within the cluster specification. Each feature shall be " +
        "mapped to a short capitalized code name for the feature set to be referenced as a conformance tag in " +
        "the cluster specification text, including the Conformance columns defining the elements of the " +
        "cluster." +
        "\n" +
        "If a cluster defines more than 32 feature sets, then it will be necessary to add another feature " +
        "bitmap attribute. Any client trying to reference the new feature set will know about the new bitmap, " +
        "because it knows about the new feature set(s). Legacy products will not know about the new feature " +
        "set nor the new bitmap." +
        "\n" +
        "For a cluster whose definition which does not define a FeatureMap, the server shall set this " +
        "attribute to 0 (zero)." +
        "\n" +
        "See Section 7.3.16, “Feature Conformance” for details on conformance."
});
