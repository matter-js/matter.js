/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterFile } from "#clusters/ClusterFile.js";
import { DefaultValueGenerator } from "#clusters/DefaultValueGenerator.js";
import { TlvGenerator } from "#clusters/TlvGenerator.js";
import { AttributeModel, ClusterModel, MatterModel } from "#model";
import { addProperties } from "#mom/common/element-generation.js";
import { serialize } from "#util/string.js";
import { Block } from "#util/TsFile.js";

const BEYOND_SAFE_INTEGER = 2n ** 62n;

function readBack(source: string | undefined): unknown {
    return new Function(`return ${source};`)();
}

describe("serialize as source", () => {
    it("reads a bigint beyond 2^53 back exactly", () => {
        expect(readBack(serialize(BEYOND_SAFE_INTEGER))).equals(BEYOND_SAFE_INTEGER);
        expect(readBack(serialize(-BEYOND_SAFE_INTEGER))).equals(-BEYOND_SAFE_INTEGER);
    });

    it("reads a small bigint back as a bigint", () => {
        expect(readBack(serialize(11n))).equals(11n);
    });

    it("reads a bigint nested in arrays and objects back exactly", () => {
        const value = { list: [{ min: -BEYOND_SAFE_INTEGER, max: BEYOND_SAFE_INTEGER }], plain: 3, text: "4n" };
        expect(readBack(serialize(value))).deep.equals(value);
    });

    it("leaves numbers, strings and marked source unchanged", () => {
        expect(serialize(42)).equals("42");
        expect(serialize("42")).equals('"42"');
        expect(serialize({ id: serialize.asIs("0x2a") })).equals("{ id: 0x2a }");
    });
});

describe("element properties", () => {
    it("state a bigint default as a bigint literal", () => {
        const block = new Block(undefined);
        addProperties(block, { name: "Measured", default: BEYOND_SAFE_INTEGER });
        expect(block.toString()).equals(`name: "Measured", default: ${BEYOND_SAFE_INTEGER}n;`);
    });
});

describe("block values", () => {
    it("state a nested bigint as a bigint literal", () => {
        const block = new Block(undefined);
        block.value({ max: BEYOND_SAFE_INTEGER });
        expect(block.toString()).contains(`max: ${BEYOND_SAFE_INTEGER}n`);
    });
});

describe("cluster default values", () => {
    function defaultOf(type: string) {
        const attribute = new AttributeModel({ id: 1, name: "Big", type, default: BEYOND_SAFE_INTEGER });
        const cluster = new ClusterModel({ id: 0xfff1_fc01, name: "BigDefault" }, attribute);
        new MatterModel({}, cluster);
        const generator = new DefaultValueGenerator(new TlvGenerator(new ClusterFile(cluster)));
        return serialize(generator.create(attribute));
    }

    it("state a plain bigint default as a bigint literal", () => {
        expect(defaultOf("int64")).equals(`${BEYOND_SAFE_INTEGER}n`);
    });

    it("state a specialized bigint default as a bigint literal", () => {
        expect(defaultOf("node-id")).equals(`NodeId(${BEYOND_SAFE_INTEGER}n)`);
    });
});
