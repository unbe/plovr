// Copyright 2010 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

goog.module('goog.testing.DeferredTestCaseTest');
goog.setTestOnly();

const Deferred = goog.require('goog.async.Deferred');
const DeferredTestCase = goog.require('goog.testing.DeferredTestCase');
const TestCase = goog.require('goog.testing.TestCase');
const TestRunner = goog.require('goog.testing.TestRunner');
const recordFunction = goog.require('goog.testing.recordFunction');
const testSuite = goog.require('goog.testing.testSuite');

const deferredTestCase = DeferredTestCase.createAndInstall(document.title);
let testTestCase;
let runner;

// Optionally, set a longer-than-usual step timeout.
deferredTestCase.stepTimeout = 15 * 1000;  // 15 seconds

// This is the sample code in deferredtestcase.js

function createDeferredTestCase(d) {
  testTestCase = new DeferredTestCase('Foobar TestCase');
  testTestCase.add(new TestCase.Test('Foobar Test', function() {
    this.waitForDeferred(d);
  }, testTestCase));

  const testCompleteCallback = new Deferred();
  testTestCase.addCompletedCallback(() => {
    testCompleteCallback.callback(true);
  });

  // We're not going to use the runner to run the test, but we attach one
  // here anyway because without a runner TestCase throws an exception in
  // finalize().
  const runner = new TestRunner();
  runner.initialize(testTestCase);

  return testCompleteCallback;
}

testSuite({
  testDeferredCallbacks() {
    let callbackTime = goog.now();
    const callbacks = new Deferred();
    deferredTestCase.addWaitForAsync('Waiting for 1st callback', callbacks);
    callbacks.addCallback(() => {
      assertTrue('We\'re going back in time!', goog.now() >= callbackTime);
      callbackTime = goog.now();
    });
    deferredTestCase.addWaitForAsync('Waiting for 2nd callback', callbacks);
    callbacks.addCallback(() => {
      assertTrue('We\'re going back in time!', goog.now() >= callbackTime);
      callbackTime = goog.now();
    });
    deferredTestCase.addWaitForAsync('Waiting for last callback', callbacks);
    callbacks.addCallback(() => {
      assertTrue('We\'re going back in time!', goog.now() >= callbackTime);
      callbackTime = goog.now();
    });

    deferredTestCase.waitForDeferred(callbacks);
  },

  testDeferredWait() {
    const d = new Deferred();
    deferredTestCase.addWaitForAsync('Foobar', d);
    d.addCallback(() => Deferred.succeed(true));
    deferredTestCase.waitForDeferred(d);
  },

  testNonAsync() {
    assertTrue(true);
  },

  testPassWithTestRunner() {
    const d = new Deferred();
    d.addCallback(() => Deferred.succeed(true));

    const testCompleteDeferred = createDeferredTestCase(d);
    testTestCase.execute();

    const deferredCallbackOnPass = new Deferred();
    deferredCallbackOnPass.addCallback(() => testCompleteDeferred);
    deferredCallbackOnPass.addCallback(() => {
      assertTrue('Test case should have succeeded.', testTestCase.isSuccess());
    });

    deferredTestCase.waitForDeferred(deferredCallbackOnPass);
  },

  testFailWithTestRunner() {
    const d = new Deferred();
    d.addCallback(() => Deferred.fail(true));

    createDeferredTestCase(d);

    // Mock doAsyncError to instead let the test completes successfully,
    // but record the failure. The test works as is because the failing
    // deferred is not actually asynchronous.
    const mockDoAsyncError = recordFunction(() => {
      testTestCase.continueTesting();
    });
    testTestCase.doAsyncError = mockDoAsyncError;

    testTestCase.execute();
    assertEquals(1, mockDoAsyncError.getCallCount());
  },
});
