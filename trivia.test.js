'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULTS,
  QUESTION_BANK,
  parseArgs,
  shuffle,
  selectQuestions,
  parseAnswer,
  calculateSpeedBonus,
  buildResult,
  buildSummary,
  getRating,
} = require('../trivia');

const sampleQuestion = {
  category: 'Test',
  question: 'Pick B',
  options: ['a', 'b', 'c', 'd'],
  answer: 1,
};

test('question bank is well formed', () => {
  QUESTION_BANK.forEach((q) => {
    assert.ok(q.question.length > 0);
    assert.ok(q.options.length >= 2);
    assert.ok(Number.isInteger(q.answer) && q.answer < q.options.length);
  });
});

test('parseArgs returns defaults with no arguments', () => {
  assert.deepEqual(parseArgs([]), DEFAULTS);
});

test('parseArgs reads custom values', () => {
  const config = parseArgs(['--questions', '3', '--time', '10', '--game-time', '60']);
  assert.deepEqual(config, { questionCount: 3, questionTime: 10, gameTime: 60 });
});

test('parseArgs rejects bad input', () => {
  assert.throws(() => parseArgs(['--questions', 'abc']));
  assert.throws(() => parseArgs(['--time', '-5']));
  assert.throws(() => parseArgs(['--nope', '1']));
});

test('shuffle keeps all items and does not mutate the original', () => {
  const original = [1, 2, 3, 4, 5];
  const result = shuffle(original);
  assert.deepEqual(original, [1, 2, 3, 4, 5]);
  assert.deepEqual([...result].sort(), original);
});

test('selectQuestions respects count and bank size', () => {
  assert.equal(selectQuestions(QUESTION_BANK, 3).length, 3);
  assert.equal(selectQuestions(QUESTION_BANK, 999).length, QUESTION_BANK.length);
});

test('parseAnswer accepts letters and numbers, rejects the rest', () => {
  assert.equal(parseAnswer('a', 4), 0);
  assert.equal(parseAnswer(' C ', 4), 2);
  assert.equal(parseAnswer('4', 4), 3);
  assert.equal(parseAnswer('E', 4), -1);
  assert.equal(parseAnswer('5', 4), -1);
  assert.equal(parseAnswer('', 4), -1);
  assert.equal(parseAnswer('AB', 4), -1);
});

test('calculateSpeedBonus scales with speed', () => {
  assert.equal(calculateSpeedBonus(0, 10), 5);
  assert.equal(calculateSpeedBonus(5, 10), 3);
  assert.equal(calculateSpeedBonus(10, 10), 0);
  assert.equal(calculateSpeedBonus(20, 10), 0);
});

test('buildResult marks correct, incorrect and timeout', () => {
  assert.equal(buildResult(sampleQuestion, 1, 5, 10).status, 'correct');
  assert.equal(buildResult(sampleQuestion, 2, 5, 10).status, 'incorrect');
  assert.equal(buildResult(sampleQuestion, null, 10, 10).status, 'timeout');
  assert.equal(buildResult(sampleQuestion, 2, 5, 10).points, 0);
  assert.equal(buildResult(sampleQuestion, 1, 10, 10).points, 10);
});

test('buildSummary totals the results', () => {
  const results = [
    buildResult(sampleQuestion, 1, 0, 10), // 15 pts
    buildResult(sampleQuestion, 0, 4, 10), // wrong
    buildResult(sampleQuestion, null, 10, 10), // timeout
  ];
  const summary = buildSummary(results);
  assert.equal(summary.correct, 1);
  assert.equal(summary.incorrect, 1);
  assert.equal(summary.timedOut, 1);
  assert.equal(summary.score, 15);
  assert.equal(summary.accuracy, 33);
});

test('buildSummary handles an empty game', () => {
  const summary = buildSummary([]);
  assert.equal(summary.score, 0);
  assert.equal(summary.accuracy, 0);
});

test('getRating returns a message for each band', () => {
  assert.match(getRating(100), /Perfect/);
  assert.match(getRating(85), /Excellent/);
  assert.match(getRating(10), /Keep going/);
});