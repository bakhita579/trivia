#!/usr/bin/env node
'use strict';

/**
 * CLI Trivia Game
 * ---------------
 * A timed, terminal-based quiz. Players answer multiple-choice questions
 * one at a time, get instant feedback, and see a full summary at the end.
 *
 * Usage:
 *   node trivia.js [--questions 5] [--time 15] [--game-time 120]
 *
 * Core JavaScript features used:
 *   - Arrays & objects ........ QUESTION_BANK, results
 *   - Array methods ........... map, filter, reduce, slice, sort
 *   - Functions ............... small, single-purpose, documented
 *   - Loops ................... for...of, while
 *   - Timers .................. setTimeout (question limit, warnings),
 *                               clearTimeout, Date.now (game clock)
 *   - Promises / async-await .. non-blocking input with timeouts
 */

const readline = require('readline');

// ---------------------------------------------------------------------------
// Configuration & constants
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  questionCount: 5, // how many questions per game
  questionTime: 15, // seconds allowed per question
  gameTime: 120,    // seconds allowed for the whole game
});

const POINTS_PER_CORRECT = 10;
const MAX_SPEED_BONUS = 5;
const WARNING_SECONDS = 5; // warn the player when this many seconds remain

const COLORS = Object.freeze({
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
});

/** Wraps text in an ANSI color code (skipped when output is not a terminal). */
const paint = (color, text) =>
  process.stdout.isTTY ? `${COLORS[color]}${text}${COLORS.reset}` : text;

/**
 * Each question is an object:
 *   { category: string, question: string, options: string[], answer: number }
 * `answer` is the index of the correct option inside `options`.
 */
const QUESTION_BANK = [
  {
    category: 'JavaScript',
    question: 'Which keyword declares a block-scoped variable that can be reassigned?',
    options: ['var', 'let', 'const', 'static'],
    answer: 1,
  },
  {
    category: 'JavaScript',
    question: 'What does Array.prototype.map() return?',
    options: ['A single value', 'The original array', 'A new array', 'undefined'],
    answer: 2,
  },
  {
    category: 'JavaScript',
    question: 'What is the result of typeof null?',
    options: ['"null"', '"object"', '"undefined"', '"number"'],
    answer: 1,
  },
  {
    category: 'JavaScript',
    question: 'Which function schedules code to run once after a delay?',
    options: ['setInterval', 'setImmediate', 'setTimeout', 'requestDelay'],
    answer: 2,
  },
  {
    category: 'Science',
    question: 'What is the chemical symbol for gold?',
    options: ['Ag', 'Au', 'Gd', 'Go'],
    answer: 1,
  },
  {
    category: 'Science',
    question: 'Which planet is known as the Red Planet?',
    options: ['Venus', 'Jupiter', 'Mars', 'Mercury'],
    answer: 2,
  },
  {
    category: 'Geography',
    question: 'What is the capital city of Kenya?',
    options: ['Mombasa', 'Nairobi', 'Kisumu', 'Nakuru'],
    answer: 1,
  },
  {
    category: 'Geography',
    question: 'Which is the longest river in Africa?',
    options: ['Congo', 'Niger', 'Zambezi', 'Nile'],
    answer: 3,
  },
  {
    category: 'History',
    question: 'In which year did the first human land on the Moon?',
    options: ['1965', '1969', '1972', '1975'],
    answer: 1,
  },
  {
    category: 'General',
    question: 'How many continents are there on Earth?',
    options: ['5', '6', '7', '8'],
    answer: 2,
  },
  {
    category: 'General',
    question: 'Which ocean is the largest by area?',
    options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
    answer: 3,
  },
  {
    category: 'Technology',
    question: 'What does CSS stand for?',
    options: [
      'Computer Style Sheets',
      'Cascading Style Sheets',
      'Creative Style Syntax',
      'Colorful Style Sheets',
    ],
    answer: 1,
  },
];

// ---------------------------------------------------------------------------
// Pure helper functions (no I/O, easy to test)
// ---------------------------------------------------------------------------

/**
 * Parses command-line arguments into a validated game configuration.
 * @param {string[]} argv - Arguments after the script name.
 * @returns {{questionCount:number, questionTime:number, gameTime:number}}
 * @throws {Error} If a flag is unknown or a value is not a positive integer.
 */
function parseArgs(argv) {
  const flagToKey = {
    '--questions': 'questionCount',
    '--time': 'questionTime',
    '--game-time': 'gameTime',
  };
  const config = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 2) {
    const key = flagToKey[argv[i]];
    if (!key) {
      throw new Error(`Unknown option "${argv[i]}".`);
    }
    const value = Number(argv[i + 1]);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${argv[i]} needs a positive whole number.`);
    }
    config[key] = value;
  }
  return config;
}

/**
 * Returns a shuffled copy of an array (Fisher-Yates). Original is untouched.
 * @param {Array} items
 * @returns {Array}
 */
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks `count` random questions (never more than the bank holds).
 * @param {Array} bank
 * @param {number} count
 * @returns {Array}
 */
function selectQuestions(bank, count) {
  return shuffle(bank).slice(0, count);
}

/**
 * Builds the text shown for one question.
 * @param {object} question - A question object from the bank.
 * @param {number} number - 1-based position of this question.
 * @param {number} total - Total questions in this game.
 * @returns {string}
 */
function formatQuestion(question, number, total) {
  const optionLines = question.options.map(
    (option, index) => `   ${String.fromCharCode(65 + index)}) ${option}`
  );
  return [
    '',
    paint('bold', `Question ${number}/${total}`) + paint('dim', `  [${question.category}]`),
    paint('cyan', question.question),
    ...optionLines,
  ].join('\n');
}

/**
 * Converts raw input ("b", "B", "2") into an option index.
 * @param {string} input
 * @param {number} optionCount
 * @returns {number} Option index, or -1 if the input is invalid.
 */
function parseAnswer(input, optionCount) {
  const text = String(input).trim().toUpperCase();
  const fromLetter = text.charCodeAt(0) - 65; // A=0, B=1, ...
  const fromNumber = Number(text) - 1;        // 1=0, 2=1, ...

  if (text.length === 1 && fromLetter >= 0 && fromLetter < optionCount) {
    return fromLetter;
  }
  if (Number.isInteger(fromNumber) && fromNumber >= 0 && fromNumber < optionCount) {
    return fromNumber;
  }
  return -1;
}

/**
 * Speed bonus: the faster the correct answer, the more bonus points (0-MAX).
 * @param {number} secondsTaken
 * @param {number} secondsAllowed
 * @returns {number}
 */
function calculateSpeedBonus(secondsTaken, secondsAllowed) {
  const fractionLeft = Math.max(0, 1 - secondsTaken / secondsAllowed);
  return Math.round(MAX_SPEED_BONUS * fractionLeft);
}

/**
 * Builds the record stored for each answered (or timed-out) question.
 * @param {object} question
 * @param {number|null} choice - Chosen option index, or null on timeout.
 * @param {number} secondsTaken
 * @param {number} secondsAllowed
 * @returns {object} Result record.
 */
function buildResult(question, choice, secondsTaken, secondsAllowed) {
  const status =
    choice === null ? 'timeout' : choice === question.answer ? 'correct' : 'incorrect';
  const points =
    status === 'correct'
      ? POINTS_PER_CORRECT + calculateSpeedBonus(secondsTaken, secondsAllowed)
      : 0;

  return { question, choice, status, secondsTaken, points };
}

/**
 * Summarises a list of result records using filter/reduce.
 * @param {object[]} results
 * @returns {object} Totals, accuracy (0-100), score and average time.
 */
function buildSummary(results) {
  const countStatus = (status) => results.filter((r) => r.status === status).length;
  const answered = results.length;
  const correct = countStatus('correct');

  return {
    answered,
    correct,
    incorrect: countStatus('incorrect'),
    timedOut: countStatus('timeout'),
    score: results.reduce((sum, r) => sum + r.points, 0),
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    averageTime:
      answered === 0
        ? 0
        : results.reduce((sum, r) => sum + r.secondsTaken, 0) / answered,
  };
}

/**
 * Returns an encouraging message for a given accuracy percentage.
 * @param {number} accuracy
 * @returns {string}
 */
function getRating(accuracy) {
  if (accuracy === 100) return 'Perfect score! Trivia master!';
  if (accuracy >= 80) return 'Excellent work!';
  if (accuracy >= 60) return 'Good job, keep practising!';
  if (accuracy >= 40) return 'Not bad - room to improve.';
  return 'Keep going, you will get there!';
}

// ---------------------------------------------------------------------------
// Asynchronous input handling (timers + promises)
// ---------------------------------------------------------------------------

/**
 * Wraps a readline interface so lines are never lost between questions,
 * even when input arrives faster than we ask for it (e.g. piped input).
 * @param {readline.Interface} rl
 * @returns {{next: function(): Promise<string|null>, cancel: function(): void}}
 *          next() resolves with the next line, or null if input has closed.
 */
function createLineReader(rl) {
  const queue = [];
  let waiting = null;
  let closed = false;

  rl.on('line', (line) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else {
      queue.push(line);
    }
  });

  rl.on('close', () => {
    closed = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  });

  return {
    next() {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    cancel() {
      waiting = null; // stop a timed-out prompt from swallowing the next line
    },
  };
}

/**
 * Waits for a valid answer, but gives up when time runs out.
 * Invalid input re-prompts without resetting the clock.
 *
 * @param {object} reader - From createLineReader.
 * @param {readline.Interface} rl
 * @param {number} seconds - Time allowed.
 * @param {number} optionCount - Number of answer options.
 * @returns {Promise<{status: 'answered'|'timeout'|'closed', choice?: number}>}
 */
async function readAnswer(reader, rl, seconds, optionCount) {
  let timeoutId;
  let warningId;

  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: 'timeout' }), seconds * 1000);
  });

  if (seconds > WARNING_SECONDS + 2) {
    warningId = setTimeout(() => {
      console.log(paint('yellow', `\n   ${WARNING_SECONDS} seconds left!`));
      rl.prompt(true);
    }, (seconds - WARNING_SECONDS) * 1000);
  }

  try {
    while (true) {
      rl.prompt();
      const lineOrTimeout = await Promise.race([
        reader.next().then((line) => ({ status: 'line', line })),
        timeout,
      ]);

      if (lineOrTimeout.status === 'timeout') {
        reader.cancel();
        if (process.stdin.isTTY) rl.write(null, { ctrl: true, name: 'u' }); // clear half-typed text
        return { status: 'timeout' };
      }
      if (lineOrTimeout.line === null) {
        return { status: 'closed' };
      }

      const choice = parseAnswer(lineOrTimeout.line, optionCount);
      if (choice !== -1) {
        return { status: 'answered', choice };
      }
      console.log(paint('yellow', '   Please enter a letter (A-D) or number (1-4).'));
    }
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(warningId);
  }
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

/** Prints the welcome banner and the rules for this game. */
function showWelcome(config, questionTotal) {
  console.log(paint('bold', '\n=============================='));
  console.log(paint('bold', '       CLI TRIVIA CHALLENGE'));
  console.log(paint('bold', '==============================\n'));
  console.log(`  Questions    : ${questionTotal}`);
  console.log(`  Per question : ${config.questionTime}s`);
  console.log(`  Whole game   : ${config.gameTime}s`);
  console.log(`  Scoring      : ${POINTS_PER_CORRECT} pts + up to ${MAX_SPEED_BONUS} speed bonus`);
  console.log('  Answer with a letter (A-D) or a number (1-4).\n');
}

/** Prints immediate feedback after a question. */
function showFeedback(result, totalScore) {
  const { question, status, points, secondsTaken } = result;
  const correctText = `${String.fromCharCode(65 + question.answer)}) ${question.options[question.answer]}`;

  if (status === 'correct') {
    console.log(paint('green', `   Correct! +${points} pts (${secondsTaken.toFixed(1)}s)`));
  } else if (status === 'incorrect') {
    console.log(paint('red', `   Incorrect. The answer was ${correctText}`));
  } else {
    console.log(paint('red', `   Time's up! The answer was ${correctText}`));
  }
  console.log(paint('dim', `   Score: ${totalScore}`));
}

/** Prints the end-of-game report, including a per-question review. */
function showSummary(results, plannedCount, elapsedSeconds) {
  const summary = buildSummary(results);
  const skipped = plannedCount - results.length;

  const review = results.map((r, i) => {
    const icon =
      r.status === 'correct' ? paint('green', 'OK ') : paint('red', 'X  ');
    return `  ${icon} ${i + 1}. ${r.question.question}`;
  });

  console.log(paint('bold', '\n=============================='));
  console.log(paint('bold', '          GAME OVER'));
  console.log(paint('bold', '==============================\n'));
  console.log(review.join('\n'));
  console.log('');
  console.log(`  Score        : ${paint('bold', summary.score)} pts`);
  console.log(`  Correct      : ${summary.correct}/${summary.answered} (${summary.accuracy}%)`);
  console.log(`  Incorrect    : ${summary.incorrect}`);
  console.log(`  Timed out    : ${summary.timedOut}`);
  if (skipped > 0) {
    console.log(`  Not reached  : ${skipped} (game clock ran out)`);
  }
  console.log(`  Avg. time    : ${summary.averageTime.toFixed(1)}s per question`);
  console.log(`  Total time   : ${elapsedSeconds.toFixed(1)}s`);
  console.log(`\n  ${paint('cyan', getRating(summary.accuracy))}\n`);
}

/**
 * Plays one full game.
 * @param {object} config - Validated configuration.
 * @param {readline.Interface} rl
 * @param {object} reader - From createLineReader.
 * @returns {Promise<boolean>} false if input closed (the caller should exit).
 */
async function playGame(config, rl, reader) {
  const questions = selectQuestions(QUESTION_BANK, config.questionCount);
  const results = [];

  showWelcome(config, questions.length);
  console.log('Press Enter to start...');
  if ((await reader.next()) === null) return false;

  const gameStart = Date.now();
  let inputOpen = true;

  for (const [index, question] of questions.entries()) {
    const secondsLeftInGame = config.gameTime - (Date.now() - gameStart) / 1000;
    if (secondsLeftInGame <= 0) {
      console.log(paint('yellow', '\nThe game clock has run out!'));
      break;
    }

    // A question can never outlast the whole game.
    const allowed = Math.min(config.questionTime, Math.ceil(secondsLeftInGame));

    console.log(formatQuestion(question, index + 1, questions.length));
    console.log(paint('dim', `   You have ${allowed} seconds.`));

    const questionStart = Date.now();
    const answer = await readAnswer(reader, rl, allowed, question.options.length);
    const secondsTaken = Math.min(allowed, (Date.now() - questionStart) / 1000);

    if (answer.status === 'closed') {
      inputOpen = false;
      break;
    }

    const choice = answer.status === 'answered' ? answer.choice : null;
    const result = buildResult(question, choice, secondsTaken, allowed);
    results.push(result);

    const totalScore = results.reduce((sum, r) => sum + r.points, 0);
    showFeedback(result, totalScore);
  }

  const elapsed = (Date.now() - gameStart) / 1000;
  showSummary(results, questions.length, elapsed);
  return inputOpen;
}

/** Asks a yes/no question; anything starting with "y" counts as yes. */
async function askPlayAgain(reader, rl) {
  rl.setPrompt('Play again? (y/n) > ');
  rl.prompt();
  const line = await reader.next();
  return line !== null && line.trim().toLowerCase().startsWith('y');
}

/** Program entry point. */
async function main() {
  let config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(paint('red', `Error: ${error.message}`));
    console.error('Usage: node trivia.js [--questions N] [--time SECONDS] [--game-time SECONDS]');
    process.exitCode = 1;
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('Your answer > ');
  const reader = createLineReader(rl);

  let keepPlaying = true;
  while (keepPlaying) {
    const inputOpen = await playGame(config, rl, reader);
    keepPlaying = inputOpen && (await askPlayAgain(reader, rl));
    rl.setPrompt('Your answer > ');
  }

  console.log('Thanks for playing!');
  rl.close();
}

// Only run the game when executed directly (lets tests import the helpers).
if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULTS,
  QUESTION_BANK,
  parseArgs,
  shuffle,
  selectQuestions,
  formatQuestion,
  parseAnswer,
  calculateSpeedBonus,
  buildResult,
  buildSummary,
  getRating,
};