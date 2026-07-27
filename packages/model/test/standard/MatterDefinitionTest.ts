/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterDefinition, MatterModel, ValidateModel } from "#index.js";

let matterModel: MatterModel;
let validationResult: ValidateModel.Result | undefined;

function instantiate() {
    if (!matterModel) {
        matterModel = new MatterModel(MatterDefinition);
    }
    return matterModel;
}

function validate() {
    if (!validationResult) {
        validationResult = ValidateModel(instantiate());
    }
    return validationResult;
}

describe("MatterDefinition", () => {
    it("instantiates model", () => {
        expect(() => {
            instantiate();
        }).not.throw();
    });

    it("validates", function () {
        expect(() => {
            validate();
        }).not.throw();
    });

    it("has not increased in errors", () => {
        validate().report();
        expect(validationResult?.errors.length).most(16);
    });

    it("has not decreased in scope", () => {
        expect(validate().elementCount).least(3582);
    });

    // Commands are not fabric-scoped data (Core § 7.5.3) so their structs must never carry the implicit global
    // FabricIndex field (id 0xfe, Core § 7.13.6); the accessing fabric is derived from the command invocation context.
    it("does not add the implicit FabricIndex field to commands", () => {
        const offenders = new Array<string>();
        for (const cluster of instantiate().clusters) {
            for (const command of cluster.commands) {
                if (command.children.some(field => field.id === 0xfe)) {
                    offenders.push(`${cluster.name}.${command.name}`);
                }
            }
        }
        expect(offenders).deep.equal([]);
    });

    // A cluster's own feature table never enables a feature.  Feature selection comes from device type requirements or
    // an explicit implementation decision, so the standard model must not carry the spec's feature fallback values
    it("enables no cluster feature by default", () => {
        const offenders = new Array<string>();
        for (const cluster of instantiate().clusters) {
            for (const feature of cluster.features) {
                if (feature.default !== undefined) {
                    offenders.push(`${cluster.name}.${feature.name}`);
                }
            }
        }
        expect(offenders).deep.equal([]);
    });
});
