'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  analyze,
  connections,
  cutoff,
  dbAt,
  defaults,
  fmt,
  ORDERS,
  parseValue,
  prototype,
  raw,
  requiredKeys,
  RESPONSE_NAMES,
  roundPreferred,
  solveCapacitors,
  solveResistors,
} from '@/lib/filters';
import type {
  Kind,
  Response,
  Stage,
  Target,
  Topology,
  Values,
} from '@/lib/filters';

type Mode = 'resistors' | 'capacitors' | 'analyze';
type Form = Record<keyof Values, string> & { q?: string };
type Result = { stage?: Stage; target: Target; error?: string };
const START = {
  kind: 'lowpass' as Kind,
  topology: 'sk' as Topology,
  response: 'butterworth' as Response,
  order: 4,
  fc: '40',
  q: '0.70710678',
  ripple: '1',
  series: 'exact',
};
const modeNames = {
  resistors: 'Solve resistors',
  capacitors: 'Solve capacitors',
  analyze: 'Analyze R + C',
};

function Choice({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (s: string) => void;
  id: string;
}) {
  return (
    <div className="field">
      <label id={`${id}-label`}>{label}</label>
      <Select
        value={value}
        onValueChange={(v) => v !== null && onChange(String(v))}
      >
        <SelectTrigger aria-labelledby={`${id}-label`} className="choice">
          <SelectValue>{options.find((o) => o[0] === value)?.[1]}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {options.map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function HorizontalComponent({
  kind,
  label,
  x,
  y,
}: {
  kind: 'R' | 'C';
  label: string;
  x: number;
  y: number;
}) {
  return (
    <g className="schematic-component">
      <line x1={x} y1={y} x2={x + 8} y2={y} />
      {kind === 'R' ? (
        <path d={`M ${x + 8} ${y} l 4 -6 l 7 12 l 7 -12 l 7 12 l 4 -6`} />
      ) : (
        <>
          <line x1={x + 18} y1={y - 9} x2={x + 18} y2={y + 9} />
          <line x1={x + 27} y1={y - 9} x2={x + 27} y2={y + 9} />
          <line x1={x + 8} y1={y} x2={x + 18} y2={y} />
          <line x1={x + 27} y1={y} x2={x + 39} y2={y} />
        </>
      )}
      <text x={x + 23} y={y - 12} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function VerticalComponent({
  kind,
  label,
  x,
  y,
}: {
  kind: 'R' | 'C';
  label: string;
  x: number;
  y: number;
}) {
  return (
    <g className="schematic-component">
      <line x1={x} y1={y} x2={x} y2={y + 8} />
      {kind === 'R' ? (
        <path d={`M ${x} ${y + 8} l -6 4 l 12 7 l -12 7 l 12 7 l -6 4`} />
      ) : (
        <>
          <line x1={x - 9} y1={y + 18} x2={x + 9} y2={y + 18} />
          <line x1={x - 9} y1={y + 27} x2={x + 9} y2={y + 27} />
          <line x1={x} y1={y + 8} x2={x} y2={y + 18} />
          <line x1={x} y1={y + 27} x2={x} y2={y + 39} />
        </>
      )}
      <text x={x + 12} y={y + 27}>
        {label}
      </text>
    </g>
  );
}

function Reference({ x, y }: { x: number; y: number }) {
  return (
    <g className="schematic-reference">
      <line x1={x} y1={y - 7} x2={x} y2={y} />
      <line x1={x - 9} y1={y} x2={x + 9} y2={y} />
      <line x1={x - 6} y1={y + 5} x2={x + 6} y2={y + 5} />
      <line x1={x - 3} y1={y + 10} x2={x + 3} y2={y + 10} />
      <text x={x + 14} y={y + 7}>
        REF
      </text>
    </g>
  );
}

function TopologyPreview({
  topology,
  kind,
}: {
  topology: Topology;
  kind: Kind;
}) {
  const lowpass = kind === 'lowpass';
  const name = `${topology === 'sk' ? 'Sallen–Key' : 'Multiple feedback'} ${lowpass ? 'low-pass' : 'high-pass'}`;

  return (
    <figure className="topology-preview">
      <figcaption className="topology-preview-header">
        <strong>{name}</strong>
        <span>2nd-order section</span>
      </figcaption>
      <svg
        className="topology-schematic"
        viewBox="0 0 270 170"
        role="img"
        aria-label={`${name} circuit topology preview`}
      >
        <title>{name} circuit topology preview</title>
        <text className="schematic-terminal" x="4" y="83">
          IN
        </text>
        <text className="schematic-terminal" x="240" y="83">
          OUT
        </text>

        {topology === 'sk' ? (
          <>
            <path className="schematic-wire" d="M 20 76 H 29" />
            <HorizontalComponent
              kind={lowpass ? 'R' : 'C'}
              label={lowpass ? 'R1' : 'C1'}
              x={29}
              y={76}
            />
            <path className="schematic-wire" d="M 68 76 H 91" />
            <circle className="schematic-node" cx="82" cy="76" r="3" />
            <HorizontalComponent
              kind={lowpass ? 'R' : 'C'}
              label={lowpass ? 'R2' : 'C2'}
              x={91}
              y={76}
            />
            <path className="schematic-wire" d="M 130 76 H 169" />
            <circle className="schematic-node" cx="151" cy="76" r="3" />

            <path
              className="schematic-opamp"
              d="M 172 48 L 172 112 L 229 80 Z"
            />
            <text className="schematic-sign" x="176" y="72">
              +
            </text>
            <text className="schematic-sign" x="176" y="101">
              −
            </text>
            <path className="schematic-wire" d="M 229 80 H 250" />

            <path className="schematic-wire" d="M 82 76 V 22 H 101" />
            <HorizontalComponent
              kind={lowpass ? 'C' : 'R'}
              label={lowpass ? 'C1' : 'R1'}
              x={101}
              y={22}
            />
            <path className="schematic-wire" d="M 140 22 H 238 V 80" />

            <VerticalComponent
              kind={lowpass ? 'C' : 'R'}
              label={lowpass ? 'C2' : 'R2'}
              x={151}
              y={76}
            />
            <path className="schematic-wire" d="M 151 115 V 142" />
            <Reference x={151} y={149} />

            <path
              className="schematic-wire"
              d="M 172 96 H 162 V 130 H 238 V 80"
            />
          </>
        ) : (
          <>
            <path className="schematic-wire" d="M 20 80 H 29" />
            <HorizontalComponent
              kind={lowpass ? 'R' : 'C'}
              label={lowpass ? 'R1' : 'C1'}
              x={29}
              y={80}
            />
            <path className="schematic-wire" d="M 68 80 H 91" />
            <circle className="schematic-node" cx="82" cy="80" r="3" />
            <HorizontalComponent
              kind={lowpass ? 'R' : 'C'}
              label={lowpass ? 'R3' : 'C3'}
              x={91}
              y={80}
            />
            <path className="schematic-wire" d="M 130 80 H 169" />
            <circle className="schematic-node" cx="160" cy="80" r="3" />

            <path
              className="schematic-opamp"
              d="M 172 52 L 172 116 L 229 84 Z"
            />
            <text className="schematic-sign" x="176" y="78">
              −
            </text>
            <text className="schematic-sign" x="176" y="107">
              +
            </text>
            <path className="schematic-wire" d="M 229 84 H 250" />

            <path className="schematic-wire" d="M 82 80 V 22 H 101" />
            <HorizontalComponent
              kind={lowpass ? 'R' : 'C'}
              label={lowpass ? 'R2' : 'C2'}
              x={101}
              y={22}
            />
            <path className="schematic-wire" d="M 140 22 H 238 V 84" />

            <VerticalComponent
              kind={lowpass ? 'C' : 'R'}
              label={lowpass ? 'C2' : 'R2'}
              x={82}
              y={80}
            />
            <path className="schematic-wire" d="M 82 119 V 142" />
            <Reference x={82} y={149} />

            <path className="schematic-wire" d="M 172 104 H 160 V 130 H 174" />
            <HorizontalComponent
              kind={lowpass ? 'C' : 'R'}
              label={lowpass ? 'C1' : 'R1'}
              x={174}
              y={130}
            />
            <path className="schematic-wire" d="M 213 130 H 238 V 84" />
            <path className="schematic-wire" d="M 172 104 H 151 V 142" />
            <Reference x={151} y={149} />
          </>
        )}
      </svg>
      <p>Preview updates with filter type and topology.</p>
    </figure>
  );
}

function ResponsePlot({
  targets,
  stages,
  kind,
  fc,
}: {
  targets: Target[];
  stages: Stage[];
  kind: Kind;
  fc: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState('magnitude');
  const svgRef = useRef<SVGSVGElement>(null);
  const [plotWidth, setPlotWidth] = useState(900);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setPlotWidth(Math.max(280, entries[0].contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const plot = useMemo(() => {
    const all = [...targets, ...stages];
    const lo = Math.log10(Math.min(fc, ...all.map((s) => s.f0))) - 2.5,
      hi = Math.log10(Math.max(fc, ...all.map((s) => s.f0))) + 2.5;
    const points = Array.from({ length: 500 }, (_, i) => {
      const f = 10 ** (lo + ((hi - lo) * i) / 499);
      return {
        f,
        target: dbAt(targets, f, kind),
        actual: stages.length ? dbAt(stages, f, kind) : null,
      };
    });
    const maxDb = Math.max(
      3,
      ...points.flatMap((p) => [p.target, p.actual ?? -Infinity]),
    );
    return { lo, hi, points, maxDb: Math.ceil(maxDb / 5) * 5 };
  }, [targets, stages, kind, fc]);
  const w = plotWidth,
    h = 325,
    left = 58,
    right = 18,
    top = 20,
    bottom = 45,
    minDb = view === 'passband' ? -8 : -100,
    maxDb = plot.maxDb;
  const px = (f: number) =>
    left +
    ((Math.log10(f) - plot.lo) / (plot.hi - plot.lo)) * (w - left - right);
  const py = (db: number) =>
    top + ((maxDb - db) / (maxDb - minDb)) * (h - top - bottom);
  const path = (which: 'target' | 'actual') =>
    plot.points
      .filter((p) => p[which] !== null)
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${px(p.f).toFixed(2)},${py(p[which] as number).toFixed(2)}`,
      )
      .join(' ');
  const ticks = Array.from(
    { length: Math.ceil(plot.hi) - Math.floor(plot.lo) + 1 },
    (_, i) => Math.floor(plot.lo) + i,
  ).filter((t) => t >= plot.lo && t <= plot.hi);
  const yticks =
    view === 'passband'
      ? [-6, -3, 0, ...(maxDb >= 5 ? [5] : [])]
      : [-100, -80, -60, -40, -20, 0];
  const selected =
    hover === null ? null : 10 ** (plot.lo + hover * (plot.hi - plot.lo));
  return (
    <section className="response-panel">
      <div className="panel-heading">
        <div>
          <h2>Frequency response</h2>
          <p>Combined response of all sections</p>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(String(v))}>
          <TabsList className="plot-tabs">
            <TabsTrigger value="magnitude">Full range</TabsTrigger>
            <TabsTrigger value="passband">Near passband</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="legend">
        <span>
          <i className="target-swatch" />
          Target response
        </span>
        <span>
          <i />
          Component response
        </span>
      </div>
      <svg
        ref={svgRef}
        className="bode"
        viewBox={`0 0 ${w} ${h}`}
        aria-label="Frequency response: target versus actual component values, with logarithmic frequency axis."
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                1,
                (((e.clientX - box.left) / box.width) * w - left) /
                  (w - left - right),
              ),
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <title>Target and component frequency responses</title>
        <defs>
          <clipPath id="plot-area">
            <rect
              x={left}
              y={top}
              width={w - left - right}
              height={h - top - bottom}
            />
          </clipPath>
        </defs>
        {ticks
          .filter(
            (_, i) => i % Math.ceil(ticks.length / (w < 500 ? 4 : 8)) === 0,
          )
          .map((t) => (
            <g key={t}>
              <line
                className="grid-line"
                x1={px(10 ** t)}
                x2={px(10 ** t)}
                y1={top}
                y2={h - bottom}
              />
              <text
                className="axis-label"
                x={px(10 ** t)}
                y={h - bottom + 22}
                textAnchor="middle"
              >
                {fmt(10 ** t)}
              </text>
            </g>
          ))}
        {yticks
          .filter((t) => t >= minDb && t <= maxDb)
          .map((t) => (
            <g key={t}>
              <line
                className="grid-line"
                x1={left}
                x2={w - right}
                y1={py(t)}
                y2={py(t)}
              />
              <text
                className="axis-label"
                x={left - 12}
                y={py(t) + 4}
                textAnchor="end"
              >
                {t}
              </text>
            </g>
          ))}
        <g clipPath="url(#plot-area)">
          <line
            className="cutoff-line"
            x1={px(fc)}
            x2={px(fc)}
            y1={top}
            y2={h - bottom}
          />
          <line
            className="minus3-line"
            x1={left}
            x2={w - right}
            y1={py(-3.0103)}
            y2={py(-3.0103)}
          />
          <path className="target-line" d={path('target')} />
          {stages.length > 0 && (
            <path className="actual-line" d={path('actual')} />
          )}
        </g>
        {selected !== null && (
          <line
            className="hover-line"
            x1={px(selected)}
            x2={px(selected)}
            y1={top}
            y2={h - bottom}
          />
        )}
        <text
          className="axis-title"
          x={18}
          y={150}
          transform="rotate(-90 18 150)"
          textAnchor="middle"
        >
          Relative gain (dB)
        </text>
        <text
          className="axis-title"
          x={(w + left) / 2}
          y={h - 3}
          textAnchor="middle"
        >
          Frequency (Hz)
        </text>
      </svg>
      <div className="plot-readout">
        {selected === null ? (
          <span>Point to the curve to inspect a frequency.</span>
        ) : (
          <>
            <b>{fmt(selected, 'Hz')}</b>
            <span>Target {dbAt(targets, selected, kind).toFixed(3)} dB</span>
            <span>
              Components{' '}
              {stages.length
                ? `${dbAt(stages, selected, kind).toFixed(3)} dB`
                : '—'}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [config, setConfig] = useState(START);
  const [mode, setMode] = useState<Mode>('resistors');
  const [forms, setForms] = useState<Form[]>(() =>
    prototype(4, 'butterworth', 40, 'lowpass').map((t) =>
      defaults('sk', 'lowpass', t.q),
    ),
  );
  const [showHelp, setShowHelp] = useState(false);
  const targetResult = useMemo(() => {
    try {
      return {
        targets: prototype(
          config.order,
          config.response,
          parseValue(config.fc),
          config.kind,
          config.response === 'custom' ? parseValue(config.q) : 0.70710678,
          config.response === 'chebyshev' ? parseValue(config.ripple) : 1,
        ).map((t, i) => {
          if (config.response !== 'custom') return t;
          const q = parseValue(forms[i]?.q || config.q);
          if (q < 0.01 || q > 100)
            throw new Error('Use a section Q between 0.01 and 100.');
          return { ...t, q };
        }),
        error: '',
      };
    } catch (e) {
      return { targets: [] as Target[], error: (e as Error).message };
    }
  }, [config, forms]);
  const results = useMemo<Result[]>(
    () =>
      targetResult.targets.map((target, i) => {
        try {
          const f =
            forms[i] ?? defaults(config.topology, config.kind, target.q);
          let values: Values = { r1: 0, r2: 0, r3: 0, c1: 0, c2: 0, c3: 0 };
          for (const k of requiredKeys(config.topology, config.kind)) {
            if (
              (mode === 'resistors' && k.startsWith('r')) ||
              (mode === 'capacitors' && k.startsWith('c'))
            )
              continue;
            values[k] = parseValue(f[k]);
          }
          if (mode === 'resistors') {
            values = solveResistors(
              config.topology,
              config.kind,
              target,
              values,
            );
            for (const k of ['r1', 'r2', 'r3'] as const)
              if (values[k])
                values[k] = roundPreferred(values[k], config.series);
          } else if (mode === 'capacitors')
            values = solveCapacitors(
              config.topology,
              config.kind,
              target,
              values,
            );
          return {
            target,
            stage: analyze(config.topology, config.kind, values),
          };
        } catch (e) {
          return { target, error: (e as Error).message };
        }
      }),
    [config, forms, mode, targetResult.targets],
  );
  const allValid = results.length > 0 && results.every((r) => !!r.stage);
  const stages = useMemo(
    () => (allValid ? results.map((r) => r.stage as Stage) : []),
    [results, allValid],
  );
  const actualCutoff = useMemo(
    () => cutoff(stages, config.kind),
    [stages, config.kind],
  );
  const actualReference = useMemo(
    () =>
      cutoff(
        stages,
        config.kind,
        config.response === 'linkwitz' ? -6.02059991328 : -3.01029995664,
      ),
    [stages, config.kind, config.response],
  );
  const gain = stages.reduce((g, s) => g * s.gain, 1);
  const wires = connections(config.topology, config.kind);
  const keys = requiredKeys(config.topology, config.kind);

  function update(key: keyof typeof START, value: string | number) {
    const next = { ...config, [key]: value };
    setConfig(next);
    if (key === 'topology' || key === 'kind') {
      setMode('resistors');
      const ts = prototype(
        next.order,
        next.response,
        40,
        next.kind,
        0.70710678,
        1,
      );
      setForms(ts.map((t) => defaults(next.topology, next.kind, t.q)));
    } else if (key === 'order') {
      setForms((prev) =>
        Array.from(
          { length: Number(value) / 2 },
          (_, i) => prev[i] ?? defaults(next.topology, next.kind, 1.8),
        ),
      );
    } else if (key === 'q')
      setForms((prev) => prev.map((f) => ({ ...f, q: undefined })));
  }
  function changeMode(next: Mode) {
    setForms((prev) =>
      results.length
        ? results.map((r, i) =>
            r.stage
              ? ({
                  ...prev[i],
                  ...Object.fromEntries(
                    Object.entries(r.stage.values)
                      .filter(
                        ([k, v]) =>
                          v > 0 &&
                          ((mode === 'resistors' && k.startsWith('r')) ||
                            (mode === 'capacitors' && k.startsWith('c'))),
                      )
                      .map(([k, v]) => [k, fmt(v, '', 10)]),
                  ),
                } as Form)
              : prev[i],
          )
        : prev,
    );
    setMode(next);
  }
  function edit(index: number, key: keyof Form, value: string) {
    setForms((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [key]: value } : f)),
    );
  }
  function feasible(index: number) {
    const target = targetResult.targets[index];
    const d = defaults(config.topology, config.kind, target.q);
    if (mode === 'capacitors') {
      const v = solveResistors(config.topology, config.kind, target, {
        c1: parseValue(d.c1),
        c2: parseValue(d.c2),
        c3: parseValue(d.c3),
      });
      d.r1 = raw(v.r1);
      d.r2 = raw(v.r2);
      d.r3 = raw(v.r3 || 1);
    }
    setForms((prev) =>
      prev.map((f, i) => (i === index ? { ...d, q: f.q } : f)),
    );
  }
  const label =
    config.response === 'chebyshev'
      ? 'Ripple-edge frequency'
      : config.response === 'custom'
        ? 'Section pole frequency'
        : config.response === 'linkwitz'
          ? 'Crossover frequency (−6 dB)'
          : 'Cutoff frequency (−3 dB)';
  const fc = targetResult.targets.length ? parseValue(config.fc) : 40;

  return (
    <main className="workbench">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={25} />
          </div>
          <div>
            <h1>Filter Workbench</h1>
            <span>ANALOG FILTER CALCULATOR</span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="help-button"
          onClick={() => setShowHelp(!showHelp)}
          aria-expanded={showHelp}
        >
          <CircleHelp size={17} /> How to use
        </Button>
      </header>
      <div className="workspace">
        <aside className="setup">
          <div className="section-label">
            <SlidersHorizontal size={15} /> FILTER SETUP
          </div>
          <Choice
            id="kind"
            label="Filter type"
            value={config.kind}
            options={[
              ['lowpass', 'Low-pass'],
              ['highpass', 'High-pass'],
            ]}
            onChange={(v) => update('kind', v)}
          />
          <Choice
            id="topology"
            label="Topology"
            value={config.topology}
            options={[
              ['sk', 'Sallen–Key · unity gain'],
              ['mfb', 'Multiple feedback (MFB)'],
            ]}
            onChange={(v) => update('topology', v)}
          />
          <TopologyPreview topology={config.topology} kind={config.kind} />
          <Choice
            id="response"
            label="Response"
            value={config.response}
            options={Object.entries(RESPONSE_NAMES)}
            onChange={(v) => update('response', v)}
          />
          <Choice
            id="order"
            label="Filter order"
            value={String(config.order)}
            options={ORDERS.map((n) => [
              String(n),
              `${n}${n === 2 ? 'nd' : 'th'} order · ${n / 2} section${n === 2 ? '' : 's'}`,
            ])}
            onChange={(v) => update('order', Number(v))}
          />
          <div className="field">
            <label htmlFor="cutoff">{label}</label>
            <div className="with-unit">
              <Input
                id="cutoff"
                value={config.fc}
                onChange={(e) => update('fc', e.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!!targetResult.error}
              />
              <span>Hz</span>
            </div>
            <small>Accepts 0.1, 40, 1k, or 1M.</small>
          </div>
          {config.response === 'custom' && (
            <div className="field">
              <label htmlFor="custom-q">Default section Q</label>
              <Input
                id="custom-q"
                value={config.q}
                onChange={(e) => update('q', e.target.value)}
              />
              <small>Each section can override this Q below.</small>
            </div>
          )}
          {config.response === 'chebyshev' && (
            <div className="field">
              <label htmlFor="ripple">Passband ripple (dB)</label>
              <Input
                id="ripple"
                value={config.ripple}
                onChange={(e) => update('ripple', e.target.value)}
              />
              <small>0.01 to 3 dB</small>
            </div>
          )}
          <div className="setup-divider" />
          <Choice
            id="mode"
            label="Calculation"
            value={mode}
            options={Object.entries(modeNames)}
            onChange={(v) => changeMode(v as Mode)}
          />
          {mode === 'resistors' && (
            <Choice
              id="series"
              label="Calculated resistor values"
              value={config.series}
              options={[
                ['exact', 'Exact values'],
                ['e96', 'Nearest E96 values'],
                ['e24', 'Nearest E24 values'],
              ]}
              onChange={(v) => update('series', v)}
            />
          )}
          <p className="mode-note">
            {mode === 'resistors'
              ? 'Enter capacitor values or parallel banks. Resistors update automatically.'
              : mode === 'capacitors'
                ? 'Enter resistor values. Capacitor totals update automatically.'
                : 'Enter your actual resistor and capacitor values to check the response.'}
          </p>
          <Button
            variant="outline"
            className="reset-button"
            onClick={() => {
              setConfig(START);
              setMode('resistors');
              setForms(
                prototype(4, 'butterworth', 40, 'lowpass').map((t) =>
                  defaults('sk', 'lowpass', t.q),
                ),
              );
            }}
          >
            <RotateCcw size={15} /> Reset to 40 Hz example
          </Button>
          <p className="assumption">
            Nominal components and ideal op-amps. Component tolerance, noise,
            loading, and amplifier bandwidth are not modeled.
          </p>
        </aside>
        <div className="results-area">
          {showHelp && (
            <section className="help-panel">
              <h2>Set a target, then choose what to solve.</h2>
              <p>
                <b>Solve resistors:</b> choose the capacitors you have.{' '}
                <b>Solve capacitors:</b> choose your resistors.{' '}
                <b>Analyze R + C:</b> enter all components and read the
                resulting response.
              </p>
              <p>
                Enter <code>3*100n</code> or <code>100n + 10n + 10n</code> for a
                parallel capacitor bank. Resistor sums, such as{' '}
                <code>169k + 1.5k</code>, mean a series pair. M means mega; m
                means milli.
              </p>
              <p>
                Each card is one second-order section. Connect section outputs
                to the next section’s input. Component names are local to each
                section; the connection labels define their positions. For
                Sallen–Key, tie the op-amp − input to its output. For MFB, tie
                the op-amp + input to the reference. Reference means AC ground,
                which can be a well-buffered mid-supply bias.
              </p>
              <p>
                Butterworth and Bessel use the overall −3 dB cutoff.
                Linkwitz–Riley uses −6 dB. Chebyshev uses the ripple edge and is
                normalized to unity DC/high-frequency gain, so its ripple rises
                above 0 dB. Custom Q uses the section pole frequency; its
                overall −3 dB point can differ.
              </p>
            </section>
          )}
          <div className="results-heading">
            <div>
              <div className="section-label">DESIGN RESULTS</div>
              <h2>
                {RESPONSE_NAMES[config.response]}{' '}
                {config.kind === 'lowpass' ? 'low-pass' : 'high-pass'}
              </h2>
            </div>
            <span className={`status ${allValid ? 'valid' : 'invalid'}`}>
              {allValid ? <Check size={14} /> : <TriangleAlert size={14} />}{' '}
              {allValid ? 'Calculated' : 'Check inputs'}
            </span>
          </div>
          <div className="metrics" aria-live="polite">
            <div>
              <span>
                {config.response === 'bessel'
                  ? 'Requested / actual −3 dB cutoff'
                  : config.response === 'linkwitz'
                    ? 'Actual −6 dB point'
                    : 'Actual −3 dB point'}
              </span>
              <strong>
                {allValid && actualReference
                  ? config.response === 'bessel'
                    ? `${fmt(fc, 'Hz')} / ${fmt(actualReference, 'Hz')}`
                    : fmt(actualReference, 'Hz')
                  : '—'}
              </strong>
            </div>
            <div>
              <span>Sections / total order</span>
              <strong>
                {config.order / 2} <em>/ {config.order}</em>
              </strong>
            </div>
            <div>
              <span>DC / high-frequency gain</span>
              <strong>
                {allValid ? `${Number(gain.toPrecision(5))}×` : '—'}
              </strong>
            </div>
            <div>
              <span>Stopband roll-off</span>
              <strong>
                {config.order * 20} <em>dB/dec</em>
              </strong>
            </div>
          </div>
          {targetResult.error ? (
            <div className="error-message" role="alert">
              {targetResult.error}
            </div>
          ) : (
            <ResponsePlot
              targets={targetResult.targets}
              stages={stages}
              kind={config.kind}
              fc={fc}
            />
          )}
          {!targetResult.error && (
            <div className="response-note">
              {config.response === 'custom'
                ? 'Custom Q sets each section’s pole frequency. The overall −3 dB cutoff is calculated separately.'
                : config.response === 'bessel'
                  ? 'Bessel uses the requested value as the overall −3 dB cutoff. Section pole frequencies differ from the cutoff by design.'
                  : config.response === 'chebyshev'
                    ? 'Chebyshev frequency is the ripple edge. The graph uses unity DC/high-frequency gain; ripple peaks lie above 0 dB.'
                    : config.response === 'linkwitz'
                      ? `Linkwitz–Riley is −6.02 dB at crossover. Overall −3 dB point: ${actualCutoff ? fmt(actualCutoff, 'Hz') : '—'}.`
                      : 'For higher orders, section Q values and pole frequencies are derived from the complete response.'}{' '}
              All plotted gains are relative to DC/high-frequency gain.
            </div>
          )}
          <section className="component-section">
            <div className="panel-heading">
              <div>
                <h2>Section components</h2>
                <p>
                  {mode === 'resistors'
                    ? 'Choose your capacitors. Read the resistor values.'
                    : mode === 'capacitors'
                      ? 'Choose your resistors. Read the capacitor values.'
                      : 'Change any component to inspect the resulting filter.'}
                </p>
              </div>
              <span className="unit-guide">n = nF · u = µF · k = kΩ</span>
            </div>
            {results.map((r, i) => {
              const form =
                forms[i] ?? defaults(config.topology, config.kind, r.target.q);
              return (
                <article
                  className="stage-card"
                  key={`${config.topology}-${config.kind}-${i}`}
                >
                  <div className="stage-header">
                    <div className="stage-title">
                      <span className="stage-number">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3>Section {i + 1}</h3>
                        <p>
                          {config.response === 'bessel' && (
                            <>
                              Filter cutoff <b>{fmt(fc, 'Hz')}</b>{' '}
                              <span>·</span>{' '}
                            </>
                          )}
                          Stage pole f₀ <b>{fmt(r.target.f0, 'Hz')}</b>{' '}
                          <span>·</span> Q <b>{r.target.q.toFixed(5)}</b>
                        </p>
                      </div>
                    </div>
                    <div className="stage-actions">
                      {config.response === 'custom' && (
                        <label
                          className="q-override"
                          htmlFor={`q-override-${i}`}
                        >
                          Q
                          <Input
                            id={`q-override-${i}`}
                            aria-label={`Section ${i + 1} target Q`}
                            value={form.q ?? config.q}
                            onChange={(e) => edit(i, 'q', e.target.value)}
                          />
                        </label>
                      )}
                      {mode !== 'analyze' && (
                        <Button
                          variant="ghost"
                          className="feasible-button"
                          onClick={() => feasible(i)}
                        >
                          Use feasible{' '}
                          {mode === 'resistors' ? 'capacitors' : 'resistors'}
                          <ArrowRight size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {r.error && (
                    <div className="error-message" role="alert">
                      <TriangleAlert size={16} />
                      {r.error}
                    </div>
                  )}
                  <div className="component-columns">
                    {(['c', 'r'] as const).map((group) => (
                      <div key={group}>
                        <div className="component-group-label">
                          {group === 'c' ? 'CAPACITORS' : 'RESISTORS'}
                          <span>
                            {(mode === 'resistors' && group === 'r') ||
                            (mode === 'capacitors' && group === 'c')
                              ? 'CALCULATED'
                              : 'YOUR VALUES'}
                          </span>
                        </div>
                        {keys
                          .filter((k) => k.startsWith(group))
                          .map((k) => {
                            const calculated =
                              (mode === 'resistors' && group === 'r') ||
                              (mode === 'capacitors' && group === 'c');
                            return (
                              <div className="component-field" key={k}>
                                <label htmlFor={`stage-${i}-${k}`}>
                                  <b>{k.toUpperCase()}</b>
                                  <span>{wires[k]}</span>
                                </label>
                                <div
                                  className={`component-value ${calculated ? 'calculated' : ''}`}
                                >
                                  <Input
                                    id={`stage-${i}-${k}`}
                                    aria-label={`Section ${i + 1} ${k.toUpperCase()} ${wires[k]}`}
                                    value={
                                      calculated
                                        ? r.stage
                                          ? fmt(
                                              r.stage.values[k],
                                              group === 'c' ? 'F' : 'Ω',
                                              7,
                                            )
                                          : '—'
                                        : form[k]
                                    }
                                    readOnly={calculated}
                                    onChange={(e) => edit(i, k, e.target.value)}
                                    spellCheck={false}
                                    autoComplete="off"
                                  />
                                  <small>
                                    {!calculated && r.stage
                                      ? `Total ${fmt(r.stage.values[k], group === 'c' ? 'F' : 'Ω', 6)}`
                                      : calculated
                                        ? 'Equivalent value'
                                        : 'Example: ' +
                                          (group === 'c' ? '3*100n' : '36k')}
                                  </small>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                  <div className="stage-footer">
                    <span>
                      Actual f₀{' '}
                      <b>{r.stage ? fmt(r.stage.f0, 'Hz', 6) : '—'}</b>
                    </span>
                    <span>
                      Actual Q <b>{r.stage ? r.stage.q.toFixed(6) : '—'}</b>
                    </span>
                    <span>
                      Section gain{' '}
                      <b>
                        {r.stage
                          ? `${Number(r.stage.gain.toPrecision(5))}×`
                          : '—'}
                      </b>
                    </span>
                    {config.topology === 'mfb' &&
                      config.kind === 'highpass' && <span>Gain = −C1/C2</span>}
                  </div>
                </article>
              );
            })}
          </section>
          {allValid && (
            <section className="summary-section">
              <h2>Target versus components</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Target f₀</TableHead>
                    <TableHead>Actual f₀</TableHead>
                    <TableHead>Frequency error</TableHead>
                    <TableHead>Target Q</TableHead>
                    <TableHead>Actual Q</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{fmt(r.target.f0, 'Hz', 6)}</TableCell>
                      <TableCell>{fmt(r.stage!.f0, 'Hz', 6)}</TableCell>
                      <TableCell>
                        {((r.stage!.f0 / r.target.f0 - 1) * 100).toFixed(4)}%
                      </TableCell>
                      <TableCell>{r.target.q.toFixed(6)}</TableCell>
                      <TableCell>{r.stage!.q.toFixed(6)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}
          <footer className="sources">
            <span>Calculation references</span>
            <a
              href="https://www.ti.com/lit/an/sloa024b/sloa024b.pdf"
              target="_blank"
              rel="noreferrer"
            >
              TI · Sallen–Key
            </a>
            <a
              href="https://www.ti.com/lit/an/sloa049d/sloa049d.pdf"
              target="_blank"
              rel="noreferrer"
            >
              TI · Active filter design
            </a>
            <a
              href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.besselap.html"
              target="_blank"
              rel="noreferrer"
            >
              Bessel normalization
            </a>
          </footer>
        </div>
      </div>
    </main>
  );
}
