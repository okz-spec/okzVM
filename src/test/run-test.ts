import { TestHarness } from './TestHarness';
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  name: string;
  source: string;
  expectWarnings?: number;
  expectStatus?: 'ok' | 'halted' | 'error' | 'timeout';
}

const TEST_PROGRAMS: TestCase[] = [
  {
    name: 'arithmetic',
    source: `
      a = 10 + 20
      b = a * 2
      c = b / 5
      d = c - 1
      print(d)
    `,
    expectStatus: 'halted',
  },
  {
    name: 'index-assign-no-leak',
    source: `
      level = {}
      i = 0
      while i < 100 do
        level[i] = 0
        i = i + 1
      end
      print("done")
    `,
    expectStatus: 'halted',
    expectWarnings: 0,
  },
  {
    name: 'string-concat',
    source: `
      msg = "hello " .. "world"
      print(msg)
    `,
    expectStatus: 'halted',
  },
  {
    name: 'function-call',
    source: `
      function add(a, b)
        return a + b
      end
      
      result = add(5, 7)
      print(result)
    `,
    expectStatus: 'halted',
  },
  {
    name: 'nested-loops',
    source: `
      sum = 0
      i = 0
      while i < 10 do
        j = 0
        while j < 10 do
          sum = sum + 1
          j = j + 1
        end
        i = i + 1
      end
      print(sum)
    `,
    expectStatus: 'halted',
  },
  {
    name: 'for-loop',
    source: `
      sum = 0
      for i = 0, 9 do
        sum = sum + i
      end
      print(sum)
    `,
    expectStatus: 'halted',
  },
  {
    name: 'table-array-access',
    source: `
      t = {10, 20, 30}
      print(t[0])
      print(t[1])
      print(t[2])
      
      t[1] = 99
      print(t[1])
    `,
    expectStatus: 'halted',
  },
  {
    name: 'native-api-calls',
    source: `
      screen.color(255, 0, 0)
      screen.rect(10, 10, 100, 100)
      screen.sync()
      
      pos = math.vec2(100, 200)
      print(pos)
      print(math.vec2Length(pos))
    `,
    expectStatus: 'halted',
  },
  {
    name: 'screen-render',
    source: `
      function draw()
        screen.color(0, 100, 200)
        screen.rect(50, 50, 200, 150)
        screen.sync()
      end
      
      while true do
        draw()
      end
    `,
    expectStatus: 'timeout',
  },
  {
    name: 'halt-no-sync-warning',
    source: `
      while true do
        x = x + 1
        if x > 1000 then
          print("reached 1000")
          break
        end
      end
    `,
    expectStatus: 'halted',
  },
];

function runAllTests(): void {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const test of TEST_PROGRAMS) {
    const harness = new TestHarness(false);
    const report = harness.compile(test.source);
    if (report.status === 'error') {
      console.log(`✗ ${test.name}: COMPILE ERROR`);
      failed++;
      continue;
    }

    harness.setupDefaultNatives();
    const result = harness.execute(50000);

    const hasCritical = result.warnings.some(w => w.severity === 'critical');
    const hasHigh = result.warnings.some(w => w.severity === 'high');

    let statusOk = true;
    if (test.expectStatus && result.status !== test.expectStatus) {
      statusOk = false;
      failures.push(`  ${test.name}: expected status ${test.expectStatus}, got ${result.status}`);
    }

    if (test.expectWarnings !== undefined && result.warnings.length !== test.expectWarnings) {
      statusOk = false;
      failures.push(`  ${test.name}: expected ${test.expectWarnings} warnings, got ${result.warnings.length}`);
    }

    if (statusOk) {
      console.log(`✓ ${test.name}${result.warnings.length > 0 ? ` (${result.warnings.length} warnings)` : ''}`);
      passed++;
    } else {
      console.log(`✗ ${test.name}`);
      failed++;
    }

    if (hasCritical || hasHigh) {
      for (const w of result.warnings) {
        if (w.severity === 'critical' || w.severity === 'high') {
          console.log(`    ${w.severity}: ${w.message}`);
        }
      }
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) {
      console.log(f);
    }
  }
  console.log('='.repeat(50));
}

function runSingleTest(name: string, trace?: boolean): void {
  const test = TEST_PROGRAMS.find(t => t.name === name);
  if (!test) {
    console.error(`Test "${name}" not found. Available tests:`);
    for (const t of TEST_PROGRAMS) {
      console.log(`  ${t.name}`);
    }
    process.exit(1);
  }

  const harness = new TestHarness(trace ?? false);
  const report = harness.compile(test.source);
  if (report.status === 'error') {
    console.error('Compilation failed');
    process.exit(1);
  }

  harness.setupDefaultNatives();
  const result = harness.execute(50000);

  console.log(harness.formatReport(result));
}

function runCustomSource(source: string, trace?: boolean): void {
  const harness = new TestHarness(trace ?? false);
  const report = harness.compile(source);
  if (report.status === 'error') {
    console.error('Compilation failed');
    process.exit(1);
  }

  harness.setupDefaultNatives();
  const result = harness.execute(100000);

  console.log(harness.formatReport(result));
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  runAllTests();
} else if (args[0] === '--trace' && args[1]) {
  runSingleTest(args[1], true);
} else if (args[0] === '--file' && args[1]) {
  const source = fs.readFileSync(path.resolve(args[1]), 'utf-8');
  runCustomSource(source, args.includes('--trace'));
} else if (args[0]) {
  runSingleTest(args[0], args.includes('--trace'));
}