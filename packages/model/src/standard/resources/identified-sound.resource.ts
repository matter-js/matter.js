/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "IdentifiedSound", xref: "namespace§27",
    details: "This section contains the standard semantic tag namespace for identified sounds or audio context as " +
        "a part of the semantic tag feature." +
        "\n" +
        "The tags contained in this namespace are intended to be used to identify sounds or audio context by " +
        "some detection or sensing implementation.",

    children: [
        { tag: "semanticTag", name: "Unknown", description: "Unidentifiable audio context is detected." },
        { tag: "semanticTag", name: "ObjectFall", description: "Object falling to the floor is detected." },
        { tag: "semanticTag", name: "Snoring", description: "Human snoring sound is detected." },
        { tag: "semanticTag", name: "Coughing", description: "Human coughing sound is detected." },
        { tag: "semanticTag", name: "Barking", description: "Dog barking sound is detected." },
        { tag: "semanticTag", name: "Shattering", description: "Object shattering sound is detected." },
        { tag: "semanticTag", name: "BabyCrying", description: "Baby crying sound is detected." },
        {
            tag: "semanticTag", name: "UtilityAlarm",
            description: "Utility device alarming or warning sound is detected."
        },
        { tag: "semanticTag", name: "UrgentShouting", description: "Urgent shouting sound is detected." },
        { tag: "semanticTag", name: "Doorbell", description: "Doorbell ringing is detected." },
        { tag: "semanticTag", name: "Knocking", description: "Door knocking sound is detected." },
        { tag: "semanticTag", name: "UrgentSiren", description: "Urgent situational siren sound is detected." },
        { tag: "semanticTag", name: "FaucetRunning", description: "Faucet water running sound is detected." },
        { tag: "semanticTag", name: "KettleBoiling", description: "Kettle water boiling sound is detected." },
        { tag: "semanticTag", name: "FanDryer", description: "Hair/hand fan dryer sound is detected." },
        { tag: "semanticTag", name: "Clapping", description: "Hand clapping sound is detected." },
        { tag: "semanticTag", name: "FingerSnapping", description: "Finger snapping sound is detected." },
        { tag: "semanticTag", name: "Meowing", description: "Cat meowing sound is detected." },
        { tag: "semanticTag", name: "Laughing", description: "Human laughing sound is detected." },
        { tag: "semanticTag", name: "GlassBreaking", description: "Glass breaking sound is detected." },
        { tag: "semanticTag", name: "DoorKnocking", description: "Door knocking sound is detected." },
        { tag: "semanticTag", name: "PersonTalking", description: "Person talking sound is detected." }
    ]
});
