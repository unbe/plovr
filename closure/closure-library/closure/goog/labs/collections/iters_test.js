/**
 * @license
 * Copyright The Closure Library Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Tests for goog.labs.iterable
 */

goog.module('goog.labs.iterableTest');
goog.setTestOnly('goog.labs.iterableTest');

const iters = goog.require('goog.labs.collections.iters');
const recordFunction = goog.require('goog.testing.recordFunction');
const testSuite = goog.require('goog.testing.testSuite');


/**
 * Create an Iterator starting at start and increments up to
 * (but not including) stop.
 * @param {number} start
 * @param {number} stop
 * @return {!Iterator<number>}
 */
function createRangeIterator(start, stop) {
  let value = start;
  const next = () => {
    if (value < stop) {
      return {value: value++, done: false};
    }

    return {value: undefined, done: true};
  };

  return /** @type {!Iterator<number>} */ ({next});
}

/**
 * Creates an Iterable starting at start and increments up to (but not
 * including) stop.
 * @param {number} start
 * @param {number} stop
 * @return {!Iterable<number>}
 */
function createRangeIterable(start, stop) {
  const obj = {};

  // Refer to goog.global['Symbol'] because otherwise this
  // is a parse error in earlier IEs.
  obj[goog.global['Symbol'].iterator] = () => createRangeIterator(start, stop);
  return /** @type {!Iterable<number>} */ (obj);
}

/**
 * Creates a Generator object that yields the values start to stop-1 and returns
 * the value stop.
 * @param {number} start
 * @param {number} stop
 * @return {!Iterable<number>}
 */
function* rangeGeneratorWithReturn(start, stop) {
  for (let i = start; i < stop; i++) {
    yield i;
  }
  return stop;
}

/** @return {boolean} */
function isSymbolDefined() {
  return !!goog.global['Symbol'];
}

testSuite({
  testCreateRangeIterable() {
    // Do not run if Symbol does not exist in this browser.
    if (!isSymbolDefined()) {
      return;
    }

    const rangeIterator = createRangeIterator(0, 3);

    for (let i = 0; i < 3; i++) {
      assertObjectEquals({value: i, done: false}, rangeIterator.next());
    }

    for (let i = 0; i < 3; i++) {
      assertObjectEquals({value: undefined, done: true}, rangeIterator.next());
    }
  },

  testForEach() {
    // Do not run if Symbol does not exist in this browser.
    if (!isSymbolDefined()) {
      return;
    }

    const range = createRangeIterable(0, 3);

    const callback = recordFunction();
    iters.forEach(range, callback);

    callback.assertCallCount(3);

    const calls = callback.getCalls();
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      assertArrayEquals([i], call.getArguments());
    }
  },

  testMap() {
    // Do not run if Symbol does not exist in this browser.
    if (!isSymbolDefined()) {
      return;
    }

    const range = createRangeIterable(0, 3);

    function addTwo(i) {
      return i + 2;
    }

    const newIterable = iters.map(range, addTwo);
    const newIterator = iters.getIterator(newIterable);

    let nextObj = newIterator.next();
    assertEquals(2, nextObj.value);
    assertFalse(nextObj.done);

    nextObj = newIterator.next();
    assertEquals(3, nextObj.value);
    assertFalse(nextObj.done);

    nextObj = newIterator.next();
    assertEquals(4, nextObj.value);
    assertFalse(nextObj.done);

    // Check that the iterator repeatedly signals done.
    for (let i = 0; i < 3; i++) {
      nextObj = newIterator.next();
      assertUndefined(nextObj.value);
      assertTrue(nextObj.done);
    }
  },

  testFilter() {
    function isEven(val) {
      return val % 2 == 0;
    }

    const range = createRangeIterable(0, 6);
    const newIterable = iters.filter(range, isEven);
    const newIterator = iters.getIterator(newIterable);

    let nextObj = newIterator.next();
    assertEquals(0, nextObj.value);
    assertFalse(nextObj.done);

    nextObj = newIterator.next();
    assertEquals(2, nextObj.value);
    assertFalse(nextObj.done);

    nextObj = newIterator.next();
    assertEquals(4, nextObj.value);
    assertFalse(nextObj.done);

    // Check that the iterator repeatedly signals done.
    for (let i = 0; i < 3; i++) {
      nextObj = newIterator.next();
      assertUndefined(nextObj.value);
      assertTrue(nextObj.done);
    }
  },

  testConcat_2Iterators() {
    const iter1 = createRangeIterable(0, 3);
    const iter2 = createRangeIterable(3, 6);
    const concatIter = iters.concat(iter1, iter2);

    assertObjectEquals({value: 0, done: false}, concatIter.next());
    assertObjectEquals({value: 1, done: false}, concatIter.next());
    assertObjectEquals({value: 2, done: false}, concatIter.next());
    assertObjectEquals({value: 3, done: false}, concatIter.next());
    assertObjectEquals({value: 4, done: false}, concatIter.next());
    assertObjectEquals({value: 5, done: false}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
  },

  testConcat_3Iterators() {
    const iter1 = createRangeIterable(0, 3);
    const iter2 = createRangeIterable(3, 6);
    const iter3 = createRangeIterable(6, 9);
    const concatIter = iters.concat(iter1, iter2, iter3);

    assertObjectEquals({value: 0, done: false}, concatIter.next());
    assertObjectEquals({value: 1, done: false}, concatIter.next());
    assertObjectEquals({value: 2, done: false}, concatIter.next());
    assertObjectEquals({value: 3, done: false}, concatIter.next());
    assertObjectEquals({value: 4, done: false}, concatIter.next());
    assertObjectEquals({value: 5, done: false}, concatIter.next());
    assertObjectEquals({value: 6, done: false}, concatIter.next());
    assertObjectEquals({value: 7, done: false}, concatIter.next());
    assertObjectEquals({value: 8, done: false}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
  },

  testConcat_generatorReturnValuesAreIgnored() {
    // These generators will return 3 and 6. If the generator return values are
    // not ignored, we'll see the sequence 0 1 2 3 3 4 5 6. In other words we're
    // testing that 3 is only present once, and that 6 is not present at all.
    const iter1 = rangeGeneratorWithReturn(0, 3);
    const iter2 = rangeGeneratorWithReturn(3, 6);
    const concatIter = iters.concat(iter1, iter2);

    assertObjectEquals({value: 0, done: false}, concatIter.next());
    assertObjectEquals({value: 1, done: false}, concatIter.next());
    assertObjectEquals({value: 2, done: false}, concatIter.next());
    assertObjectEquals({value: 3, done: false}, concatIter.next());
    assertObjectEquals({value: 4, done: false}, concatIter.next());
    assertObjectEquals({value: 5, done: false}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
    assertObjectEquals({done: true}, concatIter.next());
  },

  // Ensure that concat behaves the same as if you had used the array spread
  // operator to concatenate the iterators (i.e. that generator return values
  // are ignored). Also ensures that the Symbol.iterator property is present.
  testConcat_arraySpread() {
    const concat1 = rangeGeneratorWithReturn(0, 3);
    const concat2 = rangeGeneratorWithReturn(3, 6);
    const concatIter = iters.concat(concat1, concat2);

    const array1 = rangeGeneratorWithReturn(0, 3);
    const array2 = rangeGeneratorWithReturn(3, 6);

    assertArrayEquals([...array1, ...array2], [...concatIter]);
  },
});
