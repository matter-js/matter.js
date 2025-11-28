/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";
import { SharedEnvironmentServices } from "#environment/SharedEnvironmentServices.js";

/** Asserts that all provided values are strictly equal to each other */
function expectAllEqual<T>(...values: T[]) {
    if (values.length < 2) return;
    const first = values[0];
    for (let i = 1; i < values.length; i++) {
        expect(values[i]).to.equal(first);
    }
}

class TestService {
    static [Environmental.create](environment: Environment) {
        return environment.get(TestService);
    }

    closed = false;

    close() {
        this.closed = true;
    }
}

class AnotherService {
    static [Environmental.create](environment: Environment) {
        return environment.get(AnotherService);
    }

    closed = false;

    close() {
        this.closed = true;
    }
}

describe("Environment", () => {
    let env: Environment;
    let service: TestService;

    beforeEach(() => {
        env = new Environment("test");
        service = new TestService();
    });

    describe("basic service management", () => {
        it("creates and retrieves a service", () => {
            env.set(TestService, service);

            expect(env.get(TestService)).to.equal(service);
        });

        it("has() returns true for existing service", () => {
            env.set(TestService, service);

            expect(env.has(TestService)).to.be.true;
        });

        it("has() returns false for non-existing service", () => {
            expect(env.has(TestService)).to.be.false;
        });

        it("owns() returns true for directly owned service", () => {
            env.set(TestService, service);

            expect(env.owns(TestService)).to.be.true;
        });

        it("owns() returns false for inherited service", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            parent.set(TestService, service);

            expect(child.has(TestService)).to.be.true;
            expect(child.owns(TestService)).to.be.false;
        });

        it("deletes a service", () => {
            env.set(TestService, service);

            env.delete(TestService);

            expect(env.has(TestService)).to.be.false;
        });

        it("closes a service", () => {
            env.set(TestService, service);

            env.close(TestService);

            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });
    });

    describe("dependent tracking", () => {
        let dependent1: SharedEnvironmentServices;
        let dependent2: SharedEnvironmentServices;

        beforeEach(() => {
            env.set(TestService, service);
            dependent1 = env.asDependent();
            dependent2 = env.asDependent();
        });

        describe("get()", () => {
            it("tracks a single dependent and returns same instance", () => {
                const retrieved = dependent1.get(TestService);

                expect(retrieved).to.equal(service);
            });

            it("tracks multiple dependents and returns same instance for each", () => {
                const retrieved1 = dependent1.get(TestService);
                const retrieved2 = dependent2.get(TestService);

                expectAllEqual(service, retrieved1, retrieved2);
                expect(env.has(TestService)).to.be.true;
            });

            it("allows getting service without dependent and returns same instance", () => {
                const retrieved = env.get(TestService);

                expect(retrieved).to.equal(service);
            });

            it("allows mixing dependent and non-dependent access", () => {
                const retrieved1 = env.get(TestService);
                const retrieved2 = dependent1.get(TestService);

                expectAllEqual(service, retrieved1, retrieved2);
            });

            it("returns same instance on repeated get with same dependent", () => {
                const retrieved1 = dependent1.get(TestService);
                const retrieved2 = dependent1.get(TestService);
                const retrieved3 = dependent1.get(TestService);

                expectAllEqual(service, retrieved1, retrieved2, retrieved3);
            });

            it("returns same instance when getting without dependent multiple times", () => {
                const retrieved1 = env.get(TestService);
                const retrieved2 = env.get(TestService);
                const retrieved3 = env.get(TestService);

                expectAllEqual(service, retrieved1, retrieved2, retrieved3);
            });
        });

        describe("delete()", () => {
            it("does not delete service when dependents remain", () => {
                dependent1.get(TestService);
                dependent2.get(TestService);

                dependent1.delete(TestService);

                expect(env.has(TestService)).to.be.true;
                expect(service.closed).to.be.false;
            });

            it("deletes service when last dependent is removed", () => {
                dependent1.get(TestService);
                dependent2.get(TestService);

                dependent1.delete(TestService);
                dependent2.delete(TestService);

                expect(env.has(TestService)).to.be.false;
            });

            it("deletes service immediately without dependent tracking", () => {
                env.delete(TestService);

                expect(env.has(TestService)).to.be.false;
            });

            it("blocks service but doesn't emit event if instance doesn't match", () => {
                const otherService = new TestService();
                let deletedEmitted = false;

                env.deleted.on(() => {
                    deletedEmitted = true;
                });

                env.delete(TestService, otherService);

                expect(env.has(TestService)).to.be.false;
                expect(deletedEmitted).to.be.false;
                expect(service.closed).to.be.false;
            });

            it("deletes and emits event with correct instance", () => {
                let deletedEmitted = false;

                env.deleted.on((type, instance) => {
                    if (type === TestService && instance === service) {
                        deletedEmitted = true;
                    }
                });

                env.delete(TestService, service);

                expect(env.has(TestService)).to.be.false;
                expect(deletedEmitted).to.be.true;
            });
        });

        describe("close()", () => {
            it("does not close service when dependents remain", () => {
                dependent1.get(TestService);
                dependent2.get(TestService);

                dependent1.close(TestService);

                expect(env.has(TestService)).to.be.true;
                expect(service.closed).to.be.false;
            });

            it("closes service when last dependent is removed", () => {
                dependent1.get(TestService);
                dependent2.get(TestService);

                dependent1.close(TestService);
                dependent2.close(TestService);

                expect(service.closed).to.be.true;
                expect(env.has(TestService)).to.be.false;
            });

            it("closes service immediately without dependent tracking", () => {
                env.close(TestService);

                expect(service.closed).to.be.true;
                expect(env.has(TestService)).to.be.false;
            });

            it("handles closing service without close method", () => {
                class SimpleService {
                    static [Environmental.create](environment: Environment) {
                        return environment.get(SimpleService);
                    }
                }

                const simpleService = new SimpleService();
                env.set(SimpleService, simpleService);

                env.close(SimpleService);

                expect(env.has(SimpleService)).to.be.false;
            });
        });

        describe("mixed scenarios", () => {
            it("handles dependent getting service multiple times", () => {
                dependent1.get(TestService);
                dependent1.get(TestService);
                dependent1.get(TestService);

                dependent1.close(TestService);

                expect(service.closed).to.be.true;
            });

            it("handles closing service not tracked by dependent", () => {
                dependent1.delete(TestService);

                expect(env.has(TestService)).to.be.true;
            });

            it("tracks dependents across multiple services independently", () => {
                const service2 = new AnotherService();
                env.set(AnotherService, service2);

                dependent1.get(TestService);
                dependent1.get(AnotherService);

                dependent1.close(TestService);

                expect(service.closed).to.be.true;
                expect(service2.closed).to.be.false;
                expect(env.has(TestService)).to.be.false;
                expect(env.has(AnotherService)).to.be.true;
            });

            it("dependent.close() closes all services used by dependent", () => {
                const service2 = new AnotherService();
                env.set(AnotherService, service2);

                dependent1.get(TestService);
                dependent1.get(AnotherService);

                dependent1.close();

                expect(service.closed).to.be.true;
                expect(service2.closed).to.be.true;
                expect(env.has(TestService)).to.be.false;
                expect(env.has(AnotherService)).to.be.false;
            });
        });

        describe("dependent and non-dependent access mixing", () => {
            it("non-dependent close is blocked when dependents exist", () => {
                dependent1.get(TestService);

                env.close(TestService);

                expect(service.closed).to.be.false;
                expect(env.has(TestService)).to.be.true;
            });

            it("dependent close closes service and removes it", () => {
                dependent1.get(TestService);

                dependent1.close(TestService);

                expect(service.closed).to.be.true;
                expect(env.has(TestService)).to.be.false;
            });

            it("allows full lifecycle with mixed access patterns", () => {
                env.get(TestService);
                dependent1.get(TestService);
                dependent2.get(TestService);

                dependent1.close(TestService);
                expect(service.closed).to.be.false;
                expect(env.has(TestService)).to.be.true;

                dependent2.close(TestService);
                expect(service.closed).to.be.true;
                expect(env.has(TestService)).to.be.false;
            });

            it("dependent throws error when used after close()", () => {
                dependent1.get(TestService);

                dependent1.close();

                expect(() => dependent1.get(TestService)).to.throw("Dependent environment is closed");
            });

            it("dependent can be reused for multiple get calls before close", () => {
                const access1 = dependent1.get(TestService);
                const access2 = dependent1.get(TestService);
                const access3 = dependent1.get(TestService);

                expectAllEqual(service, access1, access2, access3);

                dependent1.close(TestService);
                expect(service.closed).to.be.true;
            });
        });

        describe("advanced use cases", () => {
            it("supports 3-level hierarchy with dependent bubbling to root", () => {
                const root = new Environment("root");
                const child = new Environment("child", root);
                const grandchild = new Environment("grandchild", child);
                const rootService = new TestService();
                root.set(TestService, rootService);

                const rootDependent = root.asDependent();
                const childDependent = child.asDependent();
                const grandchildDependent = grandchild.asDependent();

                rootDependent.get(TestService);
                childDependent.get(TestService);
                grandchildDependent.get(TestService);

                grandchildDependent.close(TestService);
                expect(rootService.closed).to.be.false;
                expect(root.has(TestService)).to.be.true;

                childDependent.close(TestService);
                expect(rootService.closed).to.be.false;
                expect(root.has(TestService)).to.be.true;

                rootDependent.close(TestService);
                expect(rootService.closed).to.be.true;
                expect(root.has(TestService)).to.be.false;
            });

            it("handles async service loading with dependent.load()", async () => {
                class AsyncLoadService implements Environmental.Service {
                    static [Environmental.create](environment: Environment): AsyncLoadService {
                        return environment.get(AsyncLoadService);
                    }

                    construction = Promise.resolve();
                    closed = false;
                    close() {
                        this.closed = true;
                    }
                }

                const asyncService = new AsyncLoadService();
                env.set(AsyncLoadService, asyncService);

                const loadedService = await dependent1.load(AsyncLoadService);
                expect(loadedService).to.equal(asyncService);

                dependent1.close(AsyncLoadService);
                expect(asyncService.closed).to.be.true;
            });

            it("can close empty dependent without using any services", () => {
                const emptyDependent = env.asDependent();
                expect(() => emptyDependent.close()).to.not.throw();
            });

            it("maybeGet returns undefined for missing service via dependent", () => {
                class NonExistentService {
                    static [Environmental.create](environment: Environment) {
                        return environment.get(NonExistentService);
                    }
                }

                const result = dependent1.maybeGet(NonExistentService);
                expect(result).to.be.undefined;
            });

            it("delete() removes from environment but does NOT close service", () => {
                dependent1.get(TestService);

                dependent1.delete(TestService);
                expect(service.closed).to.be.false;
                expect(env.has(TestService)).to.be.false;
            });

            it("close() both untracks AND closes the service", () => {
                dependent1.get(TestService);

                dependent1.close(TestService);
                expect(service.closed).to.be.true;
                expect(env.has(TestService)).to.be.false;
            });

            it("multiple dependents: delete() vs close() semantics", () => {
                dependent1.get(TestService);
                dependent2.get(TestService);

                dependent1.delete(TestService);
                expect(service.closed).to.be.false;
                expect(env.has(TestService)).to.be.true;

                dependent2.close(TestService);
                expect(service.closed).to.be.true;
                expect(env.has(TestService)).to.be.false;
            });
        });
    });

    describe("service events", () => {
        it("emits added event when service is set", () => {
            let addedEmitted = false;

            env.added.on((type, instance) => {
                if (type === TestService && instance === service) {
                    addedEmitted = true;
                }
            });

            env.set(TestService, service);

            expect(addedEmitted).to.be.true;
        });

        it("emits deleted event when service is deleted", () => {
            let deletedEmitted = false;

            env.set(TestService, service);

            env.deleted.on((type, instance) => {
                if (type === TestService && instance === service) {
                    deletedEmitted = true;
                }
            });

            env.delete(TestService);

            expect(deletedEmitted).to.be.true;
        });

        it("does not emit deleted event when dependents remain", () => {
            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();
            let deletedEmitted = false;

            env.set(TestService, service);
            dependent1.get(TestService);
            dependent2.get(TestService);

            env.deleted.on(() => {
                deletedEmitted = true;
            });

            dependent1.delete(TestService);

            expect(deletedEmitted).to.be.false;
        });
    });

    describe("service inheritance", () => {
        let parent: Environment;
        let child: Environment;

        beforeEach(() => {
            parent = new Environment("parent");
            child = new Environment("child", parent);
            parent.set(TestService, service);
        });

        it("inherits services from parent and returns same instance", () => {
            expect(child.get(TestService)).to.equal(service);
        });

        it("tracks dependents in parent service and returns same instance", () => {
            const dependent1 = child.asDependent();
            const dependent2 = child.asDependent();

            const retrieved1 = dependent1.get(TestService);
            const retrieved2 = dependent2.get(TestService);

            expectAllEqual(service, retrieved1, retrieved2);

            dependent1.delete(TestService);
            expect(parent.has(TestService)).to.be.true;

            dependent2.delete(TestService);
            expect(parent.has(TestService)).to.be.false;
        });

        it("returns same instance when child and parent both get service", () => {
            const fromParent1 = parent.get(TestService);
            const fromChild1 = child.get(TestService);
            const fromParent2 = parent.get(TestService);
            const fromChild2 = child.get(TestService);

            expectAllEqual(service, fromParent1, fromChild1, fromParent2, fromChild2);
        });

        it("child can override parent service with different instance", () => {
            const childService = new TestService();
            child.set(TestService, childService);

            expect(parent.get(TestService)).to.equal(service);
            expect(child.get(TestService)).to.equal(childService);
        });

        it("shared services always operate at root level", () => {
            const childService = new TestService();
            child.set(TestService, childService);

            const parentDependent = parent.asDependent();
            const childDependent = child.asDependent();

            const fromParent = parentDependent.get(TestService);
            const fromChild = childDependent.get(TestService);

            // Both shared instances operate at root, so both get root's service
            expectAllEqual(service, fromParent, fromChild);

            // Direct access still gets child's service
            expect(child.get(TestService)).to.equal(childService);

            childDependent.close(TestService);
            expect(service.closed).to.be.false;

            parentDependent.close(TestService);
            expect(service.closed).to.be.true;

            // Child's service unaffected
            expect(childService.closed).to.be.false;
            expect(child.get(TestService)).to.equal(childService);
        });

        it("child dependents DO control parent-owned inherited services", () => {
            const dependent1 = child.asDependent();
            const dependent2 = child.asDependent();

            expectAllEqual(service, dependent1.get(TestService), dependent2.get(TestService));

            dependent1.close(TestService);
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            dependent2.close(TestService);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("services registered via shared are accessible directly from child environments", () => {
            const shared = parent.asDependent();
            const serviceViaShared = shared.get(TestService);
            const directFromChild = child.get(TestService);
            const directFromParent = parent.get(TestService);

            expectAllEqual(service, serviceViaShared, directFromChild, directFromParent);
        });

        it("closes inherited service only when dependents from all environments are removed", () => {
            const parentDependent = parent.asDependent();
            const childDependent1 = child.asDependent();
            const childDependent2 = child.asDependent();

            parentDependent.get(TestService);
            childDependent1.get(TestService);
            childDependent2.get(TestService);

            childDependent1.close(TestService);
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            childDependent2.close(TestService);
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            parentDependent.close(TestService);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("allows closing inherited service from child without affecting parent dependent tracking", () => {
            const parentDependent = parent.asDependent();
            const childDependent = child.asDependent();

            parentDependent.get(TestService);
            expect(childDependent.get(TestService)).to.equal(service);

            childDependent.close(TestService);

            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;
            expect(parentDependent.get(TestService)).to.equal(service);
        });

        it("properly tracks dependents when getting from multiple child environments", () => {
            const child2 = new Environment("child2", parent);

            const parentDependent = parent.asDependent();
            const child1Dependent = child.asDependent();
            const child2Dependent = child2.asDependent();

            parentDependent.get(TestService);
            child1Dependent.get(TestService);
            child2Dependent.get(TestService);

            child1Dependent.close(TestService);
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            child2Dependent.close(TestService);
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            parentDependent.close(TestService);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("keeps service available when some dependents remain", () => {
            const dependent1 = child.asDependent();
            const dependent2 = child.asDependent();

            dependent1.get(TestService);
            dependent2.get(TestService);

            dependent1.close(TestService);

            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;
            expect(child.has(TestService)).to.be.true;
            expect(dependent2.get(TestService)).to.equal(service);
        });
    });
});
