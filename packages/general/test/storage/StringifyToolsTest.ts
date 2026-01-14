/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fromJson, toJson } from "#storage/StringifyTools.js";
import { BigintId, NumberId } from "../util/fake-brands.js";

describe("JsonConverter", () => {
    describe("encode/decode", () => {
        it("encode/decode object with primitives", () => {
            const obj = {
                aNumber: 1,
                aNumberString: "2",
                aString: "hello",
                aBoolean: true,
                aNull: null,
                anObject: { a: 1, b: 2, c: 3 },
                anNumberArray: [1, 2, 3],
                anStringArray: ["a", "b", "c"],
                anObjectArray: [{ a: 1 }, { b: 2 }, { c: 3 }],
            };

            const json = toJson(obj);

            expect(json).equal(
                `{"aNumber":1,"aNumberString":"2","aString":"hello","aBoolean":true,"aNull":null,"anObject":{"a":1,"b":2,"c":3},"anNumberArray":[1,2,3],"anStringArray":["a","b","c"],"anObjectArray":[{"a":1},{"b":2},{"c":3}]}`,
            );

            const decodedObj = fromJson(json);

            expect(decodedObj).deep.equal(obj);
        });

        it("encode/decode BigInt", () => {
            const obj = BigInt("12345678901234567890");

            const json = toJson(obj);

            expect(json).equal(`"{\\"__object__\\":\\"BigInt\\",\\"__value__\\":\\"12345678901234567890\\"}"`);

            const decodedObj = fromJson(json);

            expect(decodedObj).deep.equal(obj);
            expect(typeof decodedObj).equal("bigint");
        });

        it("encode/decode Uint8Array", () => {
            const obj = new Uint8Array([1, 2, 3]);

            const json = toJson(obj);

            expect(json).equal(`"{\\"__object__\\":\\"Uint8Array\\",\\"__value__\\":\\"010203\\"}"`);

            const decodedObj = fromJson(json);

            expect(decodedObj).deep.equal(obj);
            expect(decodedObj instanceof Uint8Array).ok;
        });

        it("encode/decode Node.js Buffer", () => {
            if (typeof Buffer === "undefined") {
                //Buffers do not exist in the browser
                return;
            }
            const obj = Buffer.from([1, 2, 3]);

            const json = toJson(obj);

            expect(json).equal(`"{\\"__object__\\":\\"Uint8Array\\",\\"__value__\\":\\"010203\\"}"`);

            const decodedObj = fromJson(json);

            expect(decodedObj instanceof Uint8Array).ok;
        });

        it("encode/decode Map", () => {
            const obj = new Map([
                ["a", 1],
                ["b", 2],
                ["c", 3],
            ]);

            const json = toJson(obj);

            expect(json).equal(
                `"{\\"__object__\\":\\"Map\\",\\"__value__\\":\\"[[\\\\\\"a\\\\\\",1],[\\\\\\"b\\\\\\",2],[\\\\\\"c\\\\\\",3]]\\"}"`,
            );

            const decodedObj = fromJson(json);

            expect(decodedObj).deep.equal(obj);
            expect(decodedObj instanceof Map).ok;
            expect((decodedObj as Map<any, any>).get("a")).equal(1);
        });

        it("encode/decide Map of Maps", () => {
            const obj = new Map([
                [1, new Map([["a", 1]])],
                [2, new Map([["b", 2]])],
            ]);

            const json = toJson(obj);

            expect(json).equal(
                `"{\\"__object__\\":\\"Map\\",\\"__value__\\":\\"[[1,\\\\\\"{\\\\\\\\\\\\\\"__object__\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"Map\\\\\\\\\\\\\\",\\\\\\\\\\\\\\"__value__\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"[[\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"a\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\",1]]\\\\\\\\\\\\\\"}\\\\\\"],[2,\\\\\\"{\\\\\\\\\\\\\\"__object__\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"Map\\\\\\\\\\\\\\",\\\\\\\\\\\\\\"__value__\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"[[\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"b\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\",2]]\\\\\\\\\\\\\\"}\\\\\\"]]\\"}"`,
            );

            const decodedObj = fromJson(json);

            expect(decodedObj).deep.equal(obj);

            expect(decodedObj).instanceof(Map);
            if (!(decodedObj instanceof Map)) return;

            const map1 = decodedObj?.get(1);
            const map2 = decodedObj?.get(2);
            expect(map1).instanceof(Map);
            expect(map2).instanceof(Map);
            if (!(map1 instanceof Map) || !(map2 instanceof Map)) return;

            expect(map1.get("a")).equal(1);
            expect(map2.get("b")).equal(2);
        });

        it("encode/decode object with matter.js datatypes", () => {
            const obj = {
                number: NumberId(1),
                bigint: BigintId(BigInt(2)),
            };

            const json = toJson(obj);

            expect(json).equal(`{"number":1,"bigint":"{\\"__object__\\":\\"BigInt\\",\\"__value__\\":\\"2\\"}"}`);

            const decodedObj = fromJson(json);

            expect(decodedObj).deep.equal(obj);
        });
    });
});
