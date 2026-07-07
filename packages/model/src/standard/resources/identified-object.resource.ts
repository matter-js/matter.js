/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "IdentifiedObject", xref: "namespace§28",

    details: "This section contains the standard semantic tag namespace for identifiable objects to be exposed by " +
        "some detection or sensing implementation." +
        "\n" +
        "Thus, the tags contained in this namespace are intended to be used to identify a specific detected " +
        "object for a common use." +
        "\n" +
        "Regarding pet object identification, if an implementation enables a further specific pet " +
        "identification such as a \"Dog\" or a \"Cat\", then the specific pet object identification tag shall be " +
        "used instead of a generalized \"Pet\" object identification tag. If a client cannot recognize the " +
        "specific pet identification tag, then, the client SHOULD recognize it either as a pet or an animal " +
        "identification tag based on its recognition capability." +
        "\n" +
        "Similarly, if an implementation enables a further specific person/human identification such as an " +
        "\"Adult\" or a \"Child\", then the specific person/human object identification tag shall be used instead " +
        "of a generalized \"Person\" object identification tag. If a client cannot recognize the specific " +
        "person/human object identification tag, then, the client SHOULD recognize it either as a person or a " +
        "human identification tag based on its recognition capability.\"",

    children: [
        { tag: "semanticTag", name: "Unknown", description: "Unknown object is detected." },
        { tag: "semanticTag", name: "Adult", description: "Human adult is detected." },
        { tag: "semanticTag", name: "Child", description: "Human child is detected." },
        { tag: "semanticTag", name: "Person", description: "Person is detected." },
        { tag: "semanticTag", name: "RVC", description: "Robot Vacuum Cleaner is detected." },
        { tag: "semanticTag", name: "Pet", description: "Pet animal is detected." },
        { tag: "semanticTag", name: "Dog", description: "Dog is detected." },
        { tag: "semanticTag", name: "Cat", description: "Cat is detected." },
        { tag: "semanticTag", name: "Animal", description: "Animal is detected." },
        { tag: "semanticTag", name: "Car", description: "Car is detected." },
        { tag: "semanticTag", name: "Vehicle", description: "Vehicle is detected." },
        { tag: "semanticTag", name: "Package", description: "Package is detected." },
        { tag: "semanticTag", name: "Clothes", description: "Clothes are detected." }
    ]
});
