/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "#index.js";
import { SecretRedaction } from "#logic/SecretRedaction.js";
import { AttributeModel, ClusterModel, CommandModel, DatatypeModel, FieldModel, MatterModel } from "#models/index.js";
import { Logger } from "@matter/general";

const { PLACEHOLDER } = SecretRedaction;

function commandOf(cluster: string, command: string) {
    return Matter.clusters.require(cluster).commands.require(command);
}

/**
 * A copy of the standard model with {@link clusters} added, so the clusters resolve standard types and base clusters.
 */
function standardWith(...clusters: ClusterModel[]) {
    const matter = new MatterModel({ name: "Test" }, ...Matter.children.map(child => child.clone()));
    matter.children.push(...clusters);
    return matter;
}

describe("SecretRedaction", () => {
    it("replaces a secret field and keeps the others", () => {
        const dataset = new Uint8Array([1, 2, 3]);

        expect(
            SecretRedaction.redact(commandOf("NetworkCommissioning", "AddOrUpdateThreadNetwork"), {
                operationalDataset: dataset,
                breadcrumb: 5,
            }),
        ).deep.equals({ operationalDataset: PLACEHOLDER, breadcrumb: 5 });
    });

    it("replaces a secret in a response", () => {
        expect(
            SecretRedaction.redact(commandOf("WiFiNetworkManagement", "NetworkPassphraseResponse"), {
                passphrase: new Uint8Array([1]),
            }),
        ).deep.equals({ passphrase: PLACEHOLDER });
    });

    it("replaces a secret inside a struct and keeps a null secret", () => {
        expect(
            SecretRedaction.redact(commandOf("GroupKeyManagement", "KeySetWrite"), {
                groupKeySet: { groupKeySetId: 1, epochKey0: new Uint8Array(16), epochKey1: null },
            }),
        ).deep.equals({ groupKeySet: { groupKeySetId: 1, epochKey0: PLACEHOLDER, epochKey1: null } });
    });

    it("replaces secrets in list entries of a type from another cluster", () => {
        expect(
            SecretRedaction.redact(commandOf("WebRtcTransportProvider", "SolicitOffer"), {
                streamUsage: 1,
                iceServers: [{ urls: ["stun:example"], username: "user", credential: "password" }],
            }),
        ).deep.equals({
            streamUsage: 1,
            iceServers: [{ urls: ["stun:example"], username: "user", credential: PLACEHOLDER }],
        });
    });

    it("does not modify its input", () => {
        const input = { operationalDataset: new Uint8Array([1]), breadcrumb: 5 };

        SecretRedaction.redact(commandOf("NetworkCommissioning", "AddOrUpdateThreadNetwork"), input);

        expect(input.operationalDataset).deep.equals(new Uint8Array([1]));
    });

    it("returns its input for a model without secrets", () => {
        const input = { effectIdentifier: 0, effectVariant: 1 };

        expect(SecretRedaction.redact(commandOf("OnOff", "OffWithEffect"), input)).equals(input);
    });

    it("returns its input without a model", () => {
        const input = { operationalDataset: new Uint8Array([1]) };

        expect(SecretRedaction.redact(undefined, input)).equals(input);
    });

    it("replaces a field a derived cluster redefines without marking it", () => {
        const derived = new ClusterModel(
            { name: "DerivedNetworkCommissioning", type: "NetworkCommissioning", id: 0x31 },
            new CommandModel(
                { name: "AddOrUpdateThreadNetwork", id: 3, direction: "request" },
                new FieldModel({ name: "OperationalDataset", id: 0 }),
            ),
        );
        standardWith(derived);
        const command = derived.commands.require("AddOrUpdateThreadNetwork");

        expect(command.fields.require("OperationalDataset").isSecret).undefined;
        expect(SecretRedaction.redact(command, { operationalDataset: new Uint8Array([1]), breadcrumb: 1 })).deep.equals(
            { operationalDataset: PLACEHOLDER, breadcrumb: 1 },
        );
    });

    it("replaces a field a custom cluster marks secret", () => {
        const custom = new ClusterModel(
            { name: "Custom", id: 0xfff1fc00 },
            new CommandModel(
                { name: "Login", id: 0, direction: "request" },
                new FieldModel({ name: "User", id: 0, type: "string" }),
                new FieldModel({ name: "Token", id: 1, type: "octstr", isSecret: true }),
            ),
        );
        standardWith(custom);

        expect(
            SecretRedaction.redact(custom.commands.require("Login"), { user: "me", token: new Uint8Array([1]) }),
        ).deep.equals({ user: "me", token: PLACEHOLDER });
    });

    it("replaces a secret in a self-referencing struct", () => {
        const custom = new ClusterModel(
            { name: "Tree", id: 0xfff1fc03 },
            new DatatypeModel(
                { name: "NodeStruct", type: "struct" },
                new FieldModel({ name: "Key", id: 0, type: "octstr", isSecret: true }),
                new FieldModel({ name: "Child", id: 1, type: "NodeStruct" }),
            ),
            new AttributeModel({ name: "Root", id: 0, type: "NodeStruct" }),
        );
        standardWith(custom);

        expect(
            SecretRedaction.redact(custom.attributes.require("Root"), {
                key: new Uint8Array([1]),
                child: { key: new Uint8Array([2]) },
            }),
        ).deep.equals({ key: PLACEHOLDER, child: { key: PLACEHOLDER } });
    });

    it("reports no secret in a self-referencing struct without one", () => {
        const custom = new ClusterModel(
            { name: "PlainTree", id: 0xfff1fc04 },
            new DatatypeModel(
                { name: "NodeStruct", type: "struct" },
                new FieldModel({ name: "Child", id: 1, type: "NodeStruct" }),
            ),
            new AttributeModel({ name: "Root", id: 0, type: "NodeStruct" }),
        );
        standardWith(custom);

        expect(SecretRedaction.containsSecret(custom.attributes.require("Root"))).false;
    });

    it("returns its input while redaction is off", () => {
        const input = { operationalDataset: new Uint8Array([1]), breadcrumb: 5 };
        const doorLockState = { aliroGroupResolvingKey: new Uint8Array(16) };

        const redactSecrets = Logger.redactSecrets;
        Logger.redactSecrets = false;
        try {
            expect(SecretRedaction.redact(commandOf("NetworkCommissioning", "AddOrUpdateThreadNetwork"), input)).equals(
                input,
            );
            expect(SecretRedaction.redactAttributes(Matter.clusters.require("DoorLock"), doorLockState)).equals(
                doorLockState,
            );
        } finally {
            Logger.redactSecrets = redactSecrets;
        }
    });

    it("keeps the mark in elemental form", () => {
        expect(new FieldModel({ name: "Key", type: "octstr", isSecret: true }).toElement().isSecret).true;
    });

    describe("redactAttributes", () => {
        const doorLock = Matter.clusters.require("DoorLock");

        it("replaces a secret attribute value and keeps the others", () => {
            expect(
                SecretRedaction.redactAttributes(doorLock, {
                    aliroGroupResolvingKey: new Uint8Array(16),
                    numberOfTotalUsersSupported: 10,
                }),
            ).deep.equals({ aliroGroupResolvingKey: PLACEHOLDER, numberOfTotalUsersSupported: 10 });
        });

        it("returns its input for a cluster without secrets", () => {
            const state = { onOff: true };
            expect(SecretRedaction.redactAttributes(Matter.clusters.require("OnOff"), state)).equals(state);
        });
    });

    describe("redactEntry", () => {
        const list = new ClusterModel(
            { name: "Lists", id: 0xfff1fc02 },
            new AttributeModel(
                { name: "SecretList", id: 0, type: "list", isSecret: true },
                new FieldModel({ name: "entry", type: "octstr" }),
            ),
            new AttributeModel(
                { name: "ListOfSecrets", id: 1, type: "list" },
                new FieldModel({ name: "entry", type: "octstr", isSecret: true }),
            ),
            new AttributeModel(
                { name: "PlainList", id: 2, type: "list" },
                new FieldModel({ name: "entry", type: "octstr" }),
            ),
        );
        standardWith(list);

        it("replaces an entry of a secret list", () => {
            expect(SecretRedaction.redactEntry(list.attributes.require("SecretList"), new Uint8Array([1]))).equals(
                PLACEHOLDER,
            );
        });

        it("replaces a secret entry", () => {
            expect(SecretRedaction.redactEntry(list.attributes.require("ListOfSecrets"), new Uint8Array([1]))).equals(
                PLACEHOLDER,
            );
        });

        it("keeps a null entry of a secret list", () => {
            expect(SecretRedaction.redactEntry(list.attributes.require("SecretList"), null)).equals(null);
        });

        it("keeps an entry of a secret list while redaction is off", () => {
            const entry = new Uint8Array([1]);
            const redactSecrets = Logger.redactSecrets;
            Logger.redactSecrets = false;
            try {
                expect(SecretRedaction.redactEntry(list.attributes.require("SecretList"), entry)).equals(entry);
            } finally {
                Logger.redactSecrets = redactSecrets;
            }
        });

        it("keeps an entry of a list without secrets", () => {
            const entry = new Uint8Array([1]);
            expect(SecretRedaction.redactEntry(list.attributes.require("PlainList"), entry)).equals(entry);
        });
    });
});
