/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, Observable, ObserverGroup } from "#util/Observable.js";

// Observable deserves proper unit tests but is tested heavily via other modules.  Currently this file just tests a
// few spot cases

describe("ObservableGroup", () => {
    // Test for TS bug workaround
    it("supports variable argument lengths", () => {
        const observable = Observable<[foo: string, bar: boolean]>();
        const observers = new ObserverGroup();
        observers.on(observable, foo => {
            if (foo === "four") return;
        });
        observers.on(observable, (foo, bar) => {
            if (foo === "four") return;
            if (bar === true) return;
        });
    });

    it("installs observers", () => {
        const observable = Observable<[foo: string]>();
        const observers = new ObserverGroup();

        let observedValue: string | undefined;
        observers.on(observable, foo => {
            observedValue = foo;
        });

        expect(observable.isObserved).true;

        observable.emit("bar");

        expect(observedValue).equals("bar");
    });

    it("removes observers on close", () => {
        const observable = Observable<[foo: string]>();
        const observers = new ObserverGroup();

        observers.on(observable, () => {});

        expect(observable.isObserved);

        observers.close();

        expect(observable.isObserved).false;
    });
});

describe("AsyncObservable", () => {
    it("emits", async () => {
        const observable = AsyncObservable<[foo: string]>();

        let observedFoo;

        observable.on(async foo => {
            observedFoo = foo;
        });

        await observable.emit("what I expect");

        expect(observedFoo).equals("what I expect");
    });

    it("emits with mix of observers", async () => {
        const observable = AsyncObservable<[foo: string]>();

        const observedFoos = Array<string>();

        for (let i = 0; i < 3; i++) {
            observable.on(async foo => {
                observedFoos.push(foo);
            });

            observable.on(foo => {
                observedFoos.push(foo);
            });
        }

        await observable.emit("asdf");

        expect(observedFoos).deep.equals(["asdf", "asdf", "asdf", "asdf", "asdf", "asdf"]);
    });
});
