/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";

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
    describe("basic service management", () => {
        it("creates and retrieves a service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            expect(env.get(TestService)).to.equal(service);
        });

        it("has() returns true for existing service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            expect(env.has(TestService)).to.be.true;
        });

        it("has() returns false for non-existing service", () => {
            const env = new Environment("test");

            expect(env.has(TestService)).to.be.false;
        });

        it("owns() returns true for directly owned service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            expect(env.owns(TestService)).to.be.true;
        });

        it("owns() returns false for inherited service", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            expect(child.has(TestService)).to.be.true;
            expect(child.owns(TestService)).to.be.false;
        });

        it("deletes a service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            env.delete(TestService);

            expect(env.has(TestService)).to.be.false;
        });

        it("closes a service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            env.close(TestService);

            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });
    });

    describe("dependent tracking - get()", () => {
        it("tracks a single dependent and returns same instance", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();

            const retrieved = dependent1.get(TestService);

            expect(retrieved).to.equal(service);
            expect(retrieved).to.be.instanceOf(TestService);
        });

        it("tracks multiple dependents and returns same instance for each", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();

            const retrieved1 = dependent1.get(TestService);
            const retrieved2 = dependent2.get(TestService);

            // Both should return the exact same instance
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(env.has(TestService)).to.be.true;
        });

        it("allows getting service without dependent and returns same instance", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const retrieved = env.get(TestService);

            expect(retrieved).to.equal(service);
            expect(retrieved).to.be.instanceOf(TestService);
        });

        it("allows mixing dependent and non-dependent access", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();

            // Access without dependent
            const retrieved1 = env.get(TestService);
            expect(retrieved1).to.equal(service);

            // Access with dependent - should work fine
            const retrieved2 = dependent1.get(TestService);
            expect(retrieved2).to.equal(service);
        });

        it("returns same instance on repeated get with same dependent", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();

            const retrieved1 = dependent1.get(TestService);
            const retrieved2 = dependent1.get(TestService);
            const retrieved3 = dependent1.get(TestService);

            // All should return the exact same instance
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(retrieved3).to.equal(service);
        });

        it("returns same instance when getting without dependent multiple times", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const retrieved1 = env.get(TestService);
            const retrieved2 = env.get(TestService);
            const retrieved3 = env.get(TestService);

            // All should return the exact same instance
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(retrieved3).to.equal(service);
        });
    });

    describe("dependent tracking - delete()", () => {
        it("does not delete service when dependents remain", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();

            dependent1.get(TestService);
            dependent2.get(TestService);

            // Delete for one dependent
            dependent1.delete(TestService);

            // Service should still exist (dependent2 still using it)
            expect(env.has(TestService)).to.be.true;
            expect(service.closed).to.be.false;
        });

        it("deletes service when last dependent is removed", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();

            dependent1.get(TestService);
            dependent2.get(TestService);

            // Delete both dependents
            dependent1.delete(TestService);
            dependent2.delete(TestService);

            // Service should be deleted
            expect(env.has(TestService)).to.be.false;
        });

        it("deletes service immediately without dependent tracking", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            env.delete(TestService);

            expect(env.has(TestService)).to.be.false;
        });

        it("blocks service but doesn't emit event if instance doesn't match", () => {
            const env = new Environment("test");
            const service = new TestService();
            const otherService = new TestService();
            let deletedEmitted = false;

            env.set(TestService, service);

            env.deleted.on(() => {
                deletedEmitted = true;
            });

            // Try to delete with wrong instance
            env.delete(TestService, otherService);

            // Service is blocked (has() returns false) but deleted event not emitted
            expect(env.has(TestService)).to.be.false;
            expect(deletedEmitted).to.be.false;
            expect(service.closed).to.be.false; // Service not actually closed
        });

        it("deletes and emits event with correct instance", () => {
            const env = new Environment("test");
            const service = new TestService();
            let deletedEmitted = false;

            env.set(TestService, service);

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

    describe("dependent tracking - close()", () => {
        it("does not close service when dependents remain", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();

            dependent1.get(TestService);
            dependent2.get(TestService);

            // Close for one dependent
            dependent1.close(TestService);

            // Service should still exist and not be closed (dependent2 still using it)
            expect(env.has(TestService)).to.be.true;
            expect(service.closed).to.be.false;
        });

        it("closes service when last dependent is removed", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();

            dependent1.get(TestService);
            dependent2.get(TestService);

            // Close both dependents
            dependent1.close(TestService);
            dependent2.close(TestService);

            // Service should be closed and deleted
            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });

        it("closes service immediately without dependent tracking", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

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

            const env = new Environment("test");
            const service = new SimpleService();
            env.set(SimpleService, service);

            // Should not throw
            env.close(SimpleService);

            expect(env.has(SimpleService)).to.be.false;
        });
    });

    describe("dependent tracking - mixed scenarios", () => {
        it("handles dependent getting service multiple times", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();

            // Get same service multiple times from same dependent
            dependent1.get(TestService);
            dependent1.get(TestService);
            dependent1.get(TestService);

            // Should only need to close once
            dependent1.close(TestService);

            expect(service.closed).to.be.true;
        });

        it("handles closing service not tracked by dependent", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const dependent1 = env.asDependent();

            // Try to close service that dependent never used
            dependent1.delete(TestService);

            // Service should still exist (no dependent was using it)
            expect(env.has(TestService)).to.be.true;
        });

        it("tracks dependents across multiple services independently", () => {
            const env = new Environment("test");
            const service1 = new TestService();
            const service2 = new AnotherService();
            env.set(TestService, service1);
            env.set(AnotherService, service2);

            const dependent1 = env.asDependent();

            dependent1.get(TestService);
            dependent1.get(AnotherService);

            // Close service1 for dependent1
            dependent1.close(TestService);

            // service1 should be closed, service2 should not
            expect(service1.closed).to.be.true;
            expect(service2.closed).to.be.false;
            expect(env.has(TestService)).to.be.false;
            expect(env.has(AnotherService)).to.be.true;
        });

        it("dependent.close() closes all services used by dependent", () => {
            const env = new Environment("test");
            const service1 = new TestService();
            const service2 = new AnotherService();
            env.set(TestService, service1);
            env.set(AnotherService, service2);

            const dependent1 = env.asDependent();

            dependent1.get(TestService);
            dependent1.get(AnotherService);

            // Close all services for dependent1
            dependent1.close();

            // Both services should be closed
            expect(service1.closed).to.be.true;
            expect(service2.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
            expect(env.has(AnotherService)).to.be.false;
        });
    });

    describe("service events", () => {
        it("emits added event when service is set", () => {
            const env = new Environment("test");
            const service = new TestService();
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
            const env = new Environment("test");
            const service = new TestService();
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
            const env = new Environment("test");
            const service = new TestService();
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
        it("inherits services from parent and returns same instance", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const retrieved = child.get(TestService);

            expect(retrieved).to.equal(service);
            expect(retrieved).to.be.instanceOf(TestService);
        });

        it("tracks dependents in parent service and returns same instance", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const dependent1 = child.asDependent();
            const dependent2 = child.asDependent();

            // Get from child with dependents - tracked at root
            const retrieved1 = dependent1.get(TestService);
            const retrieved2 = dependent2.get(TestService);

            // Should return the same instance from parent
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(retrieved1).to.equal(retrieved2);

            // Delete from first dependent - service remains (second still using it)
            dependent1.delete(TestService);
            expect(parent.has(TestService)).to.be.true;

            // Delete from second dependent - service is now deleted (no more dependents)
            dependent2.delete(TestService);
            expect(parent.has(TestService)).to.be.false;
        });

        it("returns same instance when child and parent both get service", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const fromParent1 = parent.get(TestService);
            const fromChild1 = child.get(TestService);
            const fromParent2 = parent.get(TestService);
            const fromChild2 = child.get(TestService);

            // All should return the exact same instance
            expect(fromParent1).to.equal(service);
            expect(fromChild1).to.equal(service);
            expect(fromParent2).to.equal(service);
            expect(fromChild2).to.equal(service);
            expect(fromParent1).to.equal(fromChild1);
            expect(fromChild1).to.equal(fromParent2);
            expect(fromParent2).to.equal(fromChild2);
        });

        it("child can override parent service with different instance", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const parentService = new TestService();
            const childService = new TestService();

            parent.set(TestService, parentService);
            child.set(TestService, childService);

            const fromParent = parent.get(TestService);
            const fromChild = child.get(TestService);

            // Each environment should return its own instance
            expect(fromParent).to.equal(parentService);
            expect(fromChild).to.equal(childService);
            expect(fromParent).to.not.equal(fromChild);
        });

        it("shared services always operate at root level", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const parentService = new TestService();
            const childService = new TestService();

            parent.set(TestService, parentService);
            child.set(TestService, childService);

            const parentDependent = parent.asDependent();
            const childDependent = child.asDependent();

            const fromParent = parentDependent.get(TestService);
            const fromChild = childDependent.get(TestService);

            // Both shared instances operate at root, so both get root's service
            expect(fromParent).to.equal(parentService);
            expect(fromChild).to.equal(parentService); // Also gets root's service

            // Direct access still gets child's service
            expect(child.get(TestService)).to.equal(childService);

            // Closing one shared instance doesn't close service (other still using it)
            childDependent.close(TestService);
            expect(parentService.closed).to.be.false; // Still in use by parentDependent

            // Closing the other releases the service
            parentDependent.close(TestService);
            expect(parentService.closed).to.be.true;

            // Child's service unaffected (never accessed via shared)
            expect(childService.closed).to.be.false;
            expect(child.get(TestService)).to.equal(childService);
        });

        it("child dependents DO control parent-owned inherited services", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const dependent1 = child.asDependent();
            const dependent2 = child.asDependent();

            // Get from child with multiple dependents - tracked at root
            const retrieved1 = dependent1.get(TestService);
            const retrieved2 = dependent2.get(TestService);

            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);

            // Close from first dependent - service remains (second still using it)
            dependent1.close(TestService);
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            // Close from second dependent - NOW service closes (no more dependents)
            dependent2.close(TestService);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("services registered via shared are accessible directly from child environments", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);

            // Create service and register at root via shared instance
            const service = new TestService();
            parent.set(TestService, service);

            const shared = parent.asDependent();
            const serviceViaShared = shared.get(TestService);
            expect(serviceViaShared).to.equal(service);

            // Service should be accessible directly from child environment (inherits from root)
            const directFromChild = child.get(TestService);
            expect(directFromChild).to.equal(service);

            // Also accessible directly from parent
            const directFromParent = parent.get(TestService);
            expect(directFromParent).to.equal(service);

            // All references point to same instance
            expect(directFromChild).to.equal(directFromParent);
            expect(serviceViaShared).to.equal(directFromChild);
        });

        it("closes inherited service only when dependents from all environments are removed", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const parentDependent = parent.asDependent();
            const childDependent1 = child.asDependent();
            const childDependent2 = child.asDependent();

            // Get from both parent and child with dependents
            parentDependent.get(TestService);
            childDependent1.get(TestService);
            childDependent2.get(TestService);

            // Close from child for first dependent
            childDependent1.close(TestService);
            expect(service.closed).to.be.false; // Still has other dependents
            expect(parent.has(TestService)).to.be.true;

            // Close from child for second dependent
            childDependent2.close(TestService);
            expect(service.closed).to.be.false; // Still has parent dependent
            expect(parent.has(TestService)).to.be.true;

            // Close from parent for last dependent - now it should close
            parentDependent.close(TestService);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("allows closing inherited service from child without affecting parent dependent tracking", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const parentDependent = parent.asDependent();
            const childDependent = child.asDependent();

            // Get from both environments
            parentDependent.get(TestService);
            const fromChild = childDependent.get(TestService);

            expect(fromChild).to.equal(service);

            // Close from child with its dependent
            childDependent.close(TestService);

            // Service should not be closed (parent still has dependent)
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            // Parent can still access it
            const stillAvailable = parentDependent.get(TestService);
            expect(stillAvailable).to.equal(service);
        });

        it("properly tracks dependents when getting from multiple child environments", () => {
            const parent = new Environment("parent");
            const child1 = new Environment("child1", parent);
            const child2 = new Environment("child2", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const parentDependent = parent.asDependent();
            const child1Dependent = child1.asDependent();
            const child2Dependent = child2.asDependent();

            // Get from different environments with different dependents
            parentDependent.get(TestService);
            child1Dependent.get(TestService);
            child2Dependent.get(TestService);

            // Close from child1
            child1Dependent.close(TestService);
            expect(service.closed).to.be.false; // Still has other dependents
            expect(parent.has(TestService)).to.be.true;

            // Close from child2
            child2Dependent.close(TestService);
            expect(service.closed).to.be.false; // Still has parent dependent
            expect(parent.has(TestService)).to.be.true;

            // Close from parent - now it should close
            parentDependent.close(TestService);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("keeps service available when some dependents remain", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const dependent1 = child.asDependent();
            const dependent2 = child.asDependent();

            // Get from child with dependents
            dependent1.get(TestService);
            dependent2.get(TestService);

            // Close from child for one dependent
            dependent1.close(TestService);

            // Service not closed yet (still has dependent2)
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            // Child still has it via remaining dependent
            expect(child.has(TestService)).to.be.true;
            const stillAvailable = dependent2.get(TestService);
            expect(stillAvailable).to.equal(service);
        });
    });

    describe("dependent and non-dependent access mixing", () => {
        it("allows mixing dependent and non-dependent access to same service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            // Access without dependent
            const directAccess = env.get(TestService);
            expect(directAccess).to.equal(service);

            // Access with dependent - should work fine
            const dependent = env.asDependent();
            const dependentAccess = dependent.get(TestService);
            expect(dependentAccess).to.equal(service);
        });

        it("non-dependent close is blocked when dependents exist", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent = env.asDependent();
            dependent.get(TestService);

            // Direct close is blocked by dependent (tracked at root)
            env.close(TestService);

            // Service not closed because dependent is still using it
            expect(service.closed).to.be.false;
            // Service remains available (not blocked) because dependent is using it
            expect(env.has(TestService)).to.be.true;
        });

        it("dependent close closes service and removes it", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent = env.asDependent();
            dependent.get(TestService);

            // Dependent close closes the service (no other dependents)
            dependent.close(TestService);

            // Service is closed and removed
            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });

        it("allows full lifecycle with mixed access patterns", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();

            // Mixed access
            env.get(TestService);
            dependent1.get(TestService);
            dependent2.get(TestService);

            // Close first dependent - service remains (dependent2 still using)
            dependent1.close(TestService);
            expect(service.closed).to.be.false;
            expect(env.has(TestService)).to.be.true;

            // Close second dependent - service now closes (no more dependents)
            dependent2.close(TestService);
            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });

        it("dependent throws error when used after close()", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent = env.asDependent();
            dependent.get(TestService);

            // Close the dependent
            dependent.close();

            // Try to use it again - should throw
            expect(() => dependent.get(TestService)).to.throw("Dependent environment is closed");
        });

        it("dependent can be reused for multiple get calls before close", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent = env.asDependent();

            // Multiple gets should work
            const access1 = dependent.get(TestService);
            const access2 = dependent.get(TestService);
            const access3 = dependent.get(TestService);

            expect(access1).to.equal(service);
            expect(access2).to.equal(service);
            expect(access3).to.equal(service);

            // Single close should be enough
            dependent.close(TestService);
            expect(service.closed).to.be.true;
        });
    });

    describe("dependent advanced use cases", () => {
        it("supports 3-level hierarchy with dependent bubbling to root", () => {
            const root = new Environment("root");
            const child = new Environment("child", root);
            const grandchild = new Environment("grandchild", child);
            const service = new TestService();
            root.set(TestService, service);

            // Create dependents at different levels
            const rootDependent = root.asDependent();
            const childDependent = child.asDependent();
            const grandchildDependent = grandchild.asDependent();

            // All get the same service from root
            rootDependent.get(TestService);
            childDependent.get(TestService);
            grandchildDependent.get(TestService);

            // Close from deepest level - service remains (others still using)
            grandchildDependent.close(TestService);
            expect(service.closed).to.be.false;
            expect(root.has(TestService)).to.be.true;

            // Close from middle level - service remains (root still using)
            childDependent.close(TestService);
            expect(service.closed).to.be.false;
            expect(root.has(TestService)).to.be.true;

            // Close from root level - now service closes (no more dependents)
            rootDependent.close(TestService);
            expect(service.closed).to.be.true;
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

            const env = new Environment("test");
            const asyncService = new AsyncLoadService();
            env.set(AsyncLoadService, asyncService);

            const dependent = env.asDependent();

            // Load asynchronously - waits for construction promise
            const service = await dependent.load(AsyncLoadService);
            expect(service).to.equal(asyncService);

            // Dependent should track it
            dependent.close(AsyncLoadService);
            expect(asyncService.closed).to.be.true;
        });

        it("can close empty dependent without using any services", () => {
            const env = new Environment("test");
            const dependent = env.asDependent();

            // Should not throw
            expect(() => dependent.close()).to.not.throw();
        });

        it("maybeGet returns undefined for missing service via dependent", () => {
            class NonExistentService {
                static [Environmental.create](environment: Environment) {
                    return environment.get(NonExistentService);
                }
            }

            const env = new Environment("test");
            const dependent = env.asDependent();

            const result = dependent.maybeGet(NonExistentService);
            expect(result).to.be.undefined;
        });

        it("delete() removes from environment but does NOT close service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent = env.asDependent();
            dependent.get(TestService);

            // Delete removes from environment but doesn't call service.close()
            dependent.delete(TestService);
            expect(service.closed).to.be.false; // Service instance not closed
            expect(env.has(TestService)).to.be.false; // But removed from environment
        });

        it("close() both untracks AND closes the service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent = env.asDependent();
            dependent.get(TestService);

            // Close untracks AND closes
            dependent.close(TestService);
            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });

        it("multiple dependents: delete() vs close() semantics", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const dependent1 = env.asDependent();
            const dependent2 = env.asDependent();

            dependent1.get(TestService);
            dependent2.get(TestService);

            // dependent1 deletes (untracks only)
            dependent1.delete(TestService);
            expect(service.closed).to.be.false; // Not closed (dependent2 still using)
            expect(env.has(TestService)).to.be.true;

            // dependent2 closes (untracks and closes)
            dependent2.close(TestService);
            expect(service.closed).to.be.true; // Now closed (no more dependents)
            expect(env.has(TestService)).to.be.false;
        });
    });
});
