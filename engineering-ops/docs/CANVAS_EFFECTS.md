# Canvas effects

While the simulation runs, the canvas animates. Every effect encodes something the engine already reports; none of it is decoration, and none of it feeds back into the simulation (saves and replays are unaffected).

Choose the level with **Effects** in the canvas toolbar: **Subtle** (default), **Full** or **Off**. The choice is remembered per browser. A system "reduce motion" preference always forces **Off** and disables the button. **Off** keeps the original look: the marching dashes on live connectors and nothing else.

| Effect | Means | Subtle | Full |
| --- | --- | --- | --- |
| Packets along connectors | Traffic. Density grows with log10(rps); one dot stands for a share of the traffic, not one request | sparse, 1 tail | dense, 2 tails |
| Red packets that burst midway | Error share on that connector; a blocked connector drops every packet near the far end | yes | yes |
| Slower packets | The downstream component is degraded or overloaded | yes | yes |
| Breathing glow on healthy nodes | Utilisation: busier components beat faster | soft | strong |
| Amber pulse / flicker | Degraded / unavailable | yes | yes |
| Shimmer on utilisation bars | The component is serving traffic | yes | yes |
| Arrival ripple | A packet reached this component | no | yes |
| Shake, spinning worker gear, blinking queue dots | Overloaded, processing, backlog | no | yes |
| Moments: shock rings, `+2` / `-1`, `recovered`, `deployed` | A component got hit, recovered, scaled, or went live | yes | yes |

Moments fire on status or replica transitions between two simulation ticks. A component seen for the first time, or an idle one waking up, never fires one, and a flapping component gets one effect per five seconds.

## Where it lives

- `features/workspace/effects/fx.ts`: the rules (spawn rate, caps, drops, moment detection). Pure and unit-tested.
- `features/workspace/effects/PacketLayer.tsx`: one `requestAnimationFrame` loop moving SVG circles inside the flow viewport (above connectors, below components). No React state per frame. It keeps its own copy of each connector's geometry because React Flow re-mounts connector elements on every tick.
- `features/workspace/effects/useFx.ts`: the remembered level and the reduced-motion override.
- `styles/effects.css`: node effects and moments, gated by `data-fx` and `data-running` on `.canvas`.

## Performance

Live packets are capped (70 Subtle, 150 Full, halved when zoomed out). A frame-time governor thins packets out on a slow machine. The layer is not rendered when the simulation is paused or effects are off, and node effects are CSS-only.
