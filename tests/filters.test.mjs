import test from 'node:test';
import assert from 'node:assert/strict';
import references from './reference_data.json' with { type: 'json' };
import {
  analyze,
  prototype,
  parseValue,
  solveResistors,
  solveCapacitors,
  defaults,
  dbAt,
  cutoff,
  roundPreferred,
  ORDERS,
} from '../lib/filters.ts';
const near = (a, b, tol = 1e-9) =>
  assert.ok(
    Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-20),
    `${a} differs from ${b}`,
  );

test('64 independent SciPy references across both filter kinds and all response families', () => {
  for (const ref of references) {
    const p = prototype(ref.order, ref.response, 1, ref.kind, 0.70710678, 1);
    ref.frequencies.forEach((f, i) =>
      assert.ok(
        Math.abs(dbAt(p, f, ref.kind) - ref.db[i]) < 1e-7,
        `${ref.response} ${ref.order} ${ref.kind} at ${f}`,
      ),
    );
  }
});

test('Engineering values, bank totals, resistor sums, and invalid values', () => {
  near(parseValue('3*100n'), 300e-9);
  near(parseValue('100n + 10n + 10n'), 120e-9);
  near(parseValue('169k + 1.5k'), 170500);
  near(parseValue('2.2 µF'), 2.2e-6);
  near(parseValue('1e+3'), 1000);
  near(parseValue('1e-9 + 2n'), 3e-9);
  near(parseValue('3M'), 3e6);
  near(parseValue('3m'), 0.003);
  for (const invalid of [
    '',
    '0',
    '-1',
    '100x',
    'NaN',
    '1e999',
    '0*100n',
    '10001*10n',
    '2**10',
    '1/2',
    'alert(1)',
  ])
    assert.throws(() => parseValue(invalid));
});
test('Known Butterworth Q values and correct overall order', () => {
  const p = prototype(4, 'butterworth', 40, 'lowpass');
  near(p[0].q, 0.541196100146197);
  near(p[1].q, 1.3065629648763764);
  for (const n of ORDERS)
    for (const kind of ['lowpass', 'highpass']) {
      const p = prototype(n, 'butterworth', 40, kind);
      assert.equal(p.length, n / 2);
      near(dbAt(p, 40, kind), -3.01029995664);
      near(cutoff(p, kind), 40);
    }
});
test('Bessel is magnitude-normalized at -3 dB; HP uses reciprocal pole frequencies', () => {
  for (const n of ORDERS)
    for (const kind of ['lowpass', 'highpass'])
      near(
        dbAt(prototype(n, 'bessel', 0.1, kind), 0.1, kind),
        -3.01029995664,
        1e-8,
      );
  near(prototype(2, 'bessel', 1, 'lowpass')[0].f0, 1.272019649514069);
  near(prototype(2, 'bessel', 1, 'highpass')[0].f0, 1 / 1.272019649514069);
});
test('Linkwitz-Riley gives -6.02 dB, including doubled real-pole orders', () => {
  for (const n of ORDERS)
    for (const kind of ['lowpass', 'highpass']) {
      const p = prototype(n, 'linkwitz', 1000, kind);
      assert.equal(p.length, n / 2);
      near(dbAt(p, 1000, kind), -6.02059991328);
    }
});
test('Chebyshev unity-endpoint normalization and specified passband ripple', () => {
  for (const n of [2, 4, 8, 16])
    for (const kind of ['lowpass', 'highpass']) {
      const p = prototype(n, 'chebyshev', 1, kind, 0.7, 1);
      near(dbAt(p, 1, kind), 0, 1e8);
      assert.ok(Math.abs(dbAt(p, 1, kind)) < 1e-9);
      const peak = Math.max(
        ...Array.from({ length: 10000 }, (_, i) =>
          dbAt(p, kind === 'lowpass' ? (i + 1) / 10000 : 10000 / (i + 1), kind),
        ),
      );
      assert.ok(Math.abs(peak - 1) < 0.001);
    }
});
test('Both solvers recover targets for every topology, kind, order, and response', () => {
  for (const topology of ['sk', 'mfb'])
    for (const kind of ['lowpass', 'highpass'])
      for (const order of ORDERS)
        for (const response of [
          'butterworth',
          'bessel',
          'chebyshev',
          'linkwitz',
          'custom',
        ]) {
          for (const t of prototype(
            order,
            response,
            kind === 'highpass' ? 0.1 : 40,
            kind,
            0.8,
            1,
          )) {
            const d = defaults(topology, kind, t.q),
              caps = {
                c1: parseValue(d.c1),
                c2: parseValue(d.c2),
                c3: parseValue(d.c3),
              };
            const v = solveResistors(topology, kind, t, caps),
              s = analyze(topology, kind, v);
            near(s.f0, t.f0, 1e-8);
            near(s.q, t.q, 1e-8);
            const reverse = analyze(
              topology,
              kind,
              solveCapacitors(topology, kind, t, v),
            );
            near(reverse.f0, t.f0, 1e-8);
            near(reverse.q, t.q, 1e-8);
          }
        }
});
test('Filtering_03 previously validated HP and LP stages', () => {
  const h = analyze('sk', 'highpass', {
    r1: 510e3,
    r2: 1e6,
    r3: 0,
    c1: 2.2e-6,
    c2: 2.2e-6,
    c3: 0,
  });
  near(h.f0, 0.101300680493724);
  near(h.q, 0.700140042014005);
  const l = analyze('sk', 'lowpass', {
    r1: 68e3,
    r2: 240e3,
    r3: 0,
    c1: 100e-9,
    c2: 10e-9,
    c3: 0,
  });
  near(l.f0, 39.39671896375815);
  near(l.q, 1.3116240179691);
});
test('MFB gain follows actual resistor/capacitor ratios', () => {
  const a = analyze('mfb', 'lowpass', {
    r1: 10e3,
    r2: 20e3,
    r3: 30e3,
    c1: 10e-9,
    c2: 100e-9,
    c3: 0,
  });
  near(a.gain, -2);
  const b = analyze('mfb', 'highpass', {
    r1: 10e3,
    r2: 20e3,
    r3: 0,
    c1: 100e-9,
    c2: 50e-9,
    c3: 30e-9,
  });
  near(b.gain, -2);
});
test('Impossible ratios are rejected and rounding uses actual preferred values', () => {
  assert.throws(
    () =>
      solveResistors(
        'sk',
        'lowpass',
        { f0: 40, q: 1 },
        { c1: 100e-9, c2: 100e-9, c3: 0 },
      ),
    /C1\/C2/,
  );
  assert.throws(
    () =>
      solveResistors(
        'mfb',
        'lowpass',
        { f0: 40, q: 1 },
        { c1: 100e-9, c2: 100e-9, c3: 0 },
      ),
    /C2\/C1/,
  );
  assert.throws(
    () =>
      solveCapacitors(
        'sk',
        'highpass',
        { f0: 40, q: 1 },
        { r1: 10000, r2: 10000, r3: 0 },
      ),
    /R2\/R1/,
  );
  near(roundPreferred(36000, 'e96'), 35700);
  near(roundPreferred(36100, 'e24'), 36000);
});
