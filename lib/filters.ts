import bessel from './bessel.json' with { type: 'json' };

export type Kind = 'lowpass' | 'highpass';
export type Topology = 'sk' | 'mfb';
export type Response =
  | 'butterworth'
  | 'bessel'
  | 'chebyshev'
  | 'linkwitz'
  | 'custom';
export type Target = { f0: number; q: number };
export type Values = {
  r1: number;
  r2: number;
  r3: number;
  c1: number;
  c2: number;
  c3: number;
};
export type Stage = Target & { gain: number; values: Values };
export const ORDERS = [2, 4, 6, 8, 10, 12, 14, 16];
export const RESPONSE_NAMES = {
  butterworth: 'Butterworth',
  bessel: 'Bessel',
  chebyshev: 'Chebyshev I',
  linkwitz: 'Linkwitz–Riley',
  custom: 'Custom Q',
};
export const E24 = [
  10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56,
  62, 68, 75, 82, 91,
];
export const E96 = [
  100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140,
  143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200,
  205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287,
  294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412,
  422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590,
  604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845,
  866, 887, 909, 931, 953, 976,
];

export function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive finite number.`);
  return value;
}

// No eval: explicit sums and integer multiples of engineering quantities.
export function parseValue(text: string): number {
  const clean = text
    .trim()
    .replace(/[µμ]/g, 'u')
    .replace(/[×]/g, '*')
    .replace(/\s+/g, '');
  if (!clean) throw new Error('Enter a value. Examples: 100n, 3*100n, or 36k.');
  let total = 0;
  for (const term of clean.split(/(?<![eE])\+/)) {
    // Split ordinary additions, while supporting scientific notation via the regex below.
    const m = term.match(
      /^(?:(\d+)\*)?((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([pnumkKMG]?)(?:[fF]|[oO][hH][mM][sS]?|Ω|[hH][zZ])?$/,
    );
    if (!m)
      throw new Error(
        `Cannot read “${text}”. Use 100n, 3*100n, or 100n + 10n.`,
      );
    const count = m[1] ? Number(m[1]) : 1;
    if (count < 1 || count > 10000)
      throw new Error('Use a part count between 1 and 10,000.');
    const scale: Record<string, number> = {
      '': 1,
      p: 1e-12,
      n: 1e-9,
      u: 1e-6,
      m: 1e-3,
      k: 1e3,
      K: 1e3,
      M: 1e6,
      G: 1e9,
    };
    total += count * positive(Number(m[2]), 'Component value') * scale[m[3]];
  }
  return positive(total, 'Value');
}

export function fmt(v: number, unit = '', digits = 5) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return `0${unit ? ` ${unit}` : ''}`;
  const scales: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  const [scale, prefix] =
    scales.find(([s]) => Math.abs(v) >= s * 0.999999) ??
    scales[scales.length - 1];
  return `${Number((v / scale).toPrecision(digits))} ${prefix}${unit}`.trim();
}
export function raw(v: number) {
  return Number(v.toPrecision(10)).toString();
}

export function prototype(
  order: number,
  response: Response,
  fc: number,
  kind: Kind,
  customQ = 0.7071067811865476,
  ripple = 1,
): Target[] {
  if (!ORDERS.includes(order))
    throw new Error('Choose an even order from 2 to 16.');
  positive(fc, 'Frequency');
  if (fc < 1e-6 || fc > 1e9)
    throw new Error('Use a frequency between 0.000001 Hz and 1 GHz.');
  let pairs: { factor: number; q: number }[] = [];
  if (response === 'butterworth') {
    pairs = Array.from({ length: order / 2 }, (_, k) => ({
      factor: 1,
      q: 1 / (2 * Math.cos(((2 * k + 1) * Math.PI) / (2 * order))),
    }));
  } else if (response === 'bessel') {
    pairs = (bessel as Record<string, { factor: number; q: number }[]>)[
      String(order)
    ];
  } else if (response === 'chebyshev') {
    if (!Number.isFinite(ripple) || ripple < 0.01 || ripple > 3)
      throw new Error('Chebyshev ripple must be 0.01–3 dB.');
    const mu = Math.asinh(1 / Math.sqrt(10 ** (ripple / 10) - 1)) / order;
    for (let k = 1; k <= order / 2; k++) {
      const theta = ((2 * k - 1) * Math.PI) / (2 * order);
      const re = -Math.sinh(mu) * Math.sin(theta),
        im = Math.cosh(mu) * Math.cos(theta);
      const factor = Math.hypot(re, im);
      pairs.push({ factor, q: factor / (-2 * re) });
    }
  } else if (response === 'linkwitz') {
    const half = order / 2;
    for (let k = 0; k < Math.floor(half / 2); k++) {
      const pair = {
        factor: 1,
        q: 1 / (2 * Math.sin(((2 * k + 1) * Math.PI) / (2 * half))),
      };
      pairs.push({ ...pair }, { ...pair });
    }
    if (half % 2) pairs.push({ factor: 1, q: 0.5 });
  } else {
    positive(customQ, 'Q');
    if (customQ < 0.01 || customQ > 100)
      throw new Error('Use a Q between 0.01 and 100.');
    pairs = Array.from({ length: order / 2 }, () => ({
      factor: 1,
      q: customQ,
    }));
  }
  return pairs
    .map((p) => ({
      f0: fc * (kind === 'lowpass' ? p.factor : 1 / p.factor),
      q: p.q,
    }))
    .sort((a, b) => a.q - b.q);
}

export function requiredKeys(topology: Topology, kind: Kind): (keyof Values)[] {
  if (topology === 'sk') return ['c1', 'c2', 'r1', 'r2'];
  return kind === 'lowpass'
    ? ['c1', 'c2', 'r1', 'r2', 'r3']
    : ['c1', 'c2', 'c3', 'r1', 'r2'];
}

function positiveQuadraticRoot(
  a: number,
  b: number,
  c: number,
  message: string,
) {
  if (a === 0) {
    const root = -c / b;
    if (Number.isFinite(root) && root > 0) return root;
    throw new Error(message);
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-12 * Math.max(b * b, Math.abs(4 * a * c)))
    throw new Error(message);
  const sqrt = Math.sqrt(Math.max(0, discriminant));
  const roots = [(-b - sqrt) / (2 * a), (-b + sqrt) / (2 * a)]
    .filter((root) => Number.isFinite(root) && root > 0)
    .sort((x, y) => x - y);
  if (!roots.length) throw new Error(message);
  return roots[0];
}

export function solveResistors(
  topology: Topology,
  kind: Kind,
  target: Target,
  caps: Pick<Values, 'c1' | 'c2' | 'c3'>,
  stageGain = 1,
): Values {
  const { c1, c2, c3 } = caps,
    w = 2 * Math.PI * positive(target.f0, 'Pole frequency'),
    q = positive(target.q, 'Q'),
    gain = positive(stageGain, 'Stage gain');
  if (topology === 'sk' && gain < 1)
    throw new Error('Sallen–Key gain K must be at least 1.');
  positive(c1, 'C1');
  positive(c2, 'C2');
  let r1 = 0,
    r2 = 0,
    r3 = 0;
  if (topology === 'sk' && kind === 'highpass') {
    const product = 1 / (w * w * c1 * c2),
      damping = 1 / (w * q);
    r1 = positiveQuadraticRoot(
      c1 + c2,
      -damping,
      c2 * (1 - gain) * product,
      'This capacitor ratio and gain cannot produce the requested Sallen–Key Q.',
    );
    r2 = product / r1;
  } else if (topology === 'sk') {
    const product = 1 / (w * w * c1 * c2),
      damping = 1 / (w * q);
    r1 = positiveQuadraticRoot(
      c2 + c1 * (1 - gain),
      -damping,
      c2 * product,
      gain === 1
        ? `This Q needs C1/C2 ≥ ${Number((4 * q * q).toPrecision(5))}. Increase feedback C1 or reduce shunt C2.`
        : 'This capacitor ratio and gain cannot produce the requested Sallen–Key Q.',
    );
    r2 = product / r1;
  } else if (kind === 'lowpass') {
    // Unity-magnitude inverting MFB: R1 = R2.
    const p = 1 / (w * w * c1 * c2),
      sum = 1 / (w * q * c1),
      disc = sum * sum - 8 * p;
    if (disc < -1e-10 * sum * sum)
      throw new Error(
        `Unity-gain MFB needs C2/C1 ≥ ${Number((8 * q * q).toPrecision(5))}. Increase shunt C2 or reduce feedback C1.`,
      );
    r2 = (sum + Math.sqrt(Math.max(0, disc))) / 2;
    r3 = p / r2;
    r1 = r2;
  } else {
    positive(c3, 'C3');
    r2 = 1 / (w * q * (c1 + c2 + c3));
    r1 = (q * (c1 + c2 + c3)) / (w * c2 * c3);
  }
  const values = { r1, r2, r3, c1, c2, c3 };
  for (const key of requiredKeys(topology, kind))
    positive(values[key], key.toUpperCase());
  return values;
}

export function analyze(
  topology: Topology,
  kind: Kind,
  values: Values,
  stageGain = 1,
): Stage {
  for (const key of requiredKeys(topology, kind))
    positive(values[key], key.toUpperCase());
  const { r1, r2, r3, c1, c2, c3 } = values;
  let tau = 0,
    damping = 0,
    gain = 1;
  if (topology === 'sk') {
    gain = positive(stageGain, 'Stage gain');
    if (gain < 1) throw new Error('Sallen–Key gain K must be at least 1.');
    tau = Math.sqrt(r1 * r2 * c1 * c2);
    damping =
      kind === 'lowpass'
        ? c2 * (r1 + r2) + c1 * r1 * (1 - gain)
        : r1 * (c1 + c2) + r2 * c2 * (1 - gain);
  } else if (kind === 'lowpass') {
    gain = -r2 / r1;
    tau = Math.sqrt(r2 * r3 * c1 * c2);
    damping = c1 * (r2 + r3 + (r2 * r3) / r1);
  } else {
    gain = -c1 / c2;
    tau = Math.sqrt(r1 * r2 * c2 * c3);
    damping = r2 * (c1 + c2 + c3);
  }
  return {
    f0: positive(1 / (2 * Math.PI * tau), 'Resulting frequency'),
    q: positive(tau / damping, 'Resulting Q'),
    gain,
    values,
  };
}

export function roundPreferred(v: number, series: string) {
  if (series === 'exact') return v;
  const base = series === 'e24' ? E24 : E96,
    divisor = series === 'e24' ? 10 : 100;
  const decade = 10 ** Math.floor(Math.log10(v));
  const candidates = [
    ...base.map((x) => (x / divisor) * decade),
    10 * decade,
    ((base[base.length - 1] / divisor) * decade) / 10,
  ];
  return candidates.reduce((best, x) =>
    Math.abs(Math.log(x / v)) < Math.abs(Math.log(best / v)) ? x : best,
  );
}

export function solveCapacitors(
  topology: Topology,
  kind: Kind,
  target: Target,
  resistors: Pick<Values, 'r1' | 'r2' | 'r3'>,
  stageGain = 1,
): Values {
  const { r1, r2, r3 } = resistors,
    w = 2 * Math.PI * positive(target.f0, 'Pole frequency'),
    q = positive(target.q, 'Q'),
    gain = positive(stageGain, 'Stage gain');
  if (topology === 'sk' && gain < 1)
    throw new Error('Sallen–Key gain K must be at least 1.');
  positive(r1, 'R1');
  positive(r2, 'R2');
  let c1 = 0,
    c2 = 0,
    c3 = 0;
  if (topology === 'sk' && kind === 'lowpass') {
    const product = 1 / (w * w * r1 * r2),
      damping = 1 / (w * q);
    c1 = positiveQuadraticRoot(
      r1 * (1 - gain),
      -damping,
      (r1 + r2) * product,
      'This resistor ratio and gain cannot produce the requested Sallen–Key Q.',
    );
    c2 = product / c1;
  } else if (topology === 'sk') {
    const product = 1 / (w * w * r1 * r2),
      damping = 1 / (w * q);
    c2 = positiveQuadraticRoot(
      r1 + r2 * (1 - gain),
      -damping,
      r1 * product,
      gain === 1
        ? `This Q needs R2/R1 ≥ ${Number((4 * q * q).toPrecision(5))}. Increase R2 or reduce R1.`
        : 'This resistor ratio and gain cannot produce the requested Sallen–Key Q.',
    );
    c1 = product / c2;
  } else if (kind === 'lowpass') {
    positive(r3, 'R3');
    const sum = r2 + r3 + (r2 * r3) / r1;
    c1 = 1 / (w * q * sum);
    c2 = (q * sum) / (w * r2 * r3);
  } else {
    const sum = 1 / (w * q * r2),
      p = 1 / (w * w * r1 * r2),
      disc = sum * sum - 8 * p;
    if (disc < -1e-10 * sum * sum)
      throw new Error(
        `With C1 = C2, this Q needs R1/R2 ≥ ${Number((8 * q * q).toPrecision(5))}. Increase R1 or reduce R2.`,
      );
    c3 = (sum + Math.sqrt(Math.max(0, disc))) / 2;
    c2 = p / c3;
    c1 = c2;
  }
  return { r1, r2, r3, c1, c2, c3 };
}

export function dbAt(stages: Target[], f: number, kind: Kind) {
  let db = 0;
  for (const { f0, q } of stages) {
    const x = f / f0,
      den = Math.hypot(1 - x * x, x / q);
    db += 20 * Math.log10((kind === 'highpass' ? x * x : 1) / den);
  }
  return db;
}

export function cutoff(
  stages: Target[],
  kind: Kind,
  db = -3.01029995664,
): number | null {
  if (!stages.length) return null;
  let a = Math.log10(Math.min(...stages.map((s) => s.f0))) - 6;
  let b = Math.log10(Math.max(...stages.map((s) => s.f0))) + 6;
  if (
    !Number.isFinite(dbAt(stages, 10 ** a, kind)) ||
    !Number.isFinite(dbAt(stages, 10 ** b, kind))
  )
    return null;
  // Outermost stopband crossing: scan from the stopband inward (important for ripple).
  const points = Array.from(
    { length: 2001 },
    (_, i) => a + ((b - a) * i) / 2000,
  );
  if (kind === 'lowpass') points.reverse();
  let prev = points[0];
  for (const next of points.slice(1)) {
    if (
      (dbAt(stages, 10 ** prev, kind) - db) *
        (dbAt(stages, 10 ** next, kind) - db) <=
      0
    ) {
      a = Math.min(prev, next);
      b = Math.max(prev, next);
      for (let j = 0; j < 65; j++) {
        const m = (a + b) / 2;
        if (
          (dbAt(stages, 10 ** a, kind) - db) *
            (dbAt(stages, 10 ** m, kind) - db) <=
          0
        )
          b = m;
        else a = m;
      }
      return 10 ** ((a + b) / 2);
    }
    prev = next;
  }
  return null;
}

export function defaults(
  topology: Topology,
  kind: Kind,
  q: number,
): Record<keyof Values, string> {
  let c1 = '3*100n',
    c2 = '3*100n';
  const c3 = '3*100n';
  if (kind === 'lowpass' && topology === 'sk') {
    c2 = '10n';
    c1 = `${Math.max(3, Math.ceil((4 * q * q * 1.25) / 10))}*100n`;
  } else if (kind === 'lowpass') {
    c1 = '10n';
    c2 = `${Math.max(3, Math.ceil((8 * q * q * 1.25) / 10))}*100n`;
  }
  return { c1, c2, c3, r1: '36k', r2: '36k', r3: '36k' };
}

export function connections(
  topology: Topology,
  kind: Kind,
): Record<keyof Values, string> {
  if (topology === 'sk' && kind === 'lowpass')
    return {
      r1: 'Input → junction X',
      r2: 'X → op-amp +',
      r3: '',
      c1: 'X → output (feedback)',
      c2: 'Op-amp + → reference',
      c3: '',
    };
  if (topology === 'sk')
    return {
      r1: 'Junction X → output',
      r2: 'Op-amp + → reference',
      r3: '',
      c1: 'Input → junction X',
      c2: 'X → op-amp +',
      c3: '',
    };
  if (kind === 'lowpass')
    return {
      r1: 'Input → junction X',
      r2: 'Output → X',
      r3: 'X → op-amp −',
      c1: 'Output → op-amp −',
      c2: 'X → reference',
      c3: '',
    };
  return {
    r1: 'Output → op-amp −',
    r2: 'Junction X → reference',
    r3: '',
    c1: 'Input → junction X',
    c2: 'X → output (feedback)',
    c3: 'X → op-amp −',
  };
}
