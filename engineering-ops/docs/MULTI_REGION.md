# Users and Regions (multi-Region traffic)

**Lab → Users and Regions** shows what your design does to people in different parts of the world, and what happens when the primary Region is lost. It reads the deployed design and combines it with a simple, explicit network model. It never changes your run.

You choose where your users are (a preset mix across North America, Europe and Asia-Pacific), the primary Region and the second Region (for DR or active/active). The choices are remembered in this browser.

## What it shows

- **Per geography:** which Region serves it, the network round trip, the p95 a user feels, and the p95 if the primary Region were lost and everyone were served from the second Region. Anything over 600 ms is flagged. A weighted p95 and the share of users above 600 ms summarise it.
- **How DNS routes:** a single Region; active/active with **latency** routing (each user to the nearest Region); active/active with **weighted** routing (users split 50/50 whatever their location); or active/active where `simple` or `failover` routing sends **everyone to the primary** so the second Region idles.
- **If the primary Region were lost:** the minutes until users are served again, broken into steps. **Automatic** failover needs a Route 53 component with health checks and a routing policy other than `simple`; otherwise it is **manual** and starts with how long it takes someone to notice (from your alerting). With no copy of the data in another Region there is **nowhere to fail over to**: users wait for the Region to return. DNS is rarely the slow part; a pilot light or warm standby still has to be brought up.
- **Between the Regions:** replica lag to the second Region, and an estimate of the cross-Region replication traffic in GB and dollars per month.
- **Notes** explaining each finding in plain language (a CDN, active/active that DNS never uses, active/active with no data in the second Region, write conflicts, a second Region far from your users).

## The model

It is an analysis layer, not part of the per-minute solve. The round-trip times are **typical figures between these places, rounded, not measurements**, and are the same for every design, so comparing designs is fair.

| | N. Virginia | Ireland | Singapore |
| --- | --- | --- | --- |
| North America users | 25 ms | 85 ms | 220 ms |
| Europe users | 85 ms | 20 ms | 175 ms |
| Asia-Pacific users | 225 ms | 175 ms | 25 ms |

Between Regions: N. Virginia ↔ Ireland 75 ms, N. Virginia ↔ Singapore 215 ms, Ireland ↔ Singapore 170 ms.

- **User latency** = your backend p95 + the network. Direct to the origin that is 3 round trips (TCP, TLS, request). With a CDN the handshakes end at a nearby edge (2 × 20 ms) and one round trip crosses to the origin.
- **Replica lag** = 0.2 s + the inter-Region round trip + write rate ÷ 2,000 per second. It is the data a Region loss could cost you.
- **Replication traffic** = write rate × 2 KB per write × a month, at $0.02 per GB between Regions.
- The backend p95 comes from the running simulation; before it has run, 100 ms is assumed and the panel says so.

## Limits

Three geographies and three Regions. Active/active assumes the data is available in both Regions (and warns when it is not) but does not simulate conflict resolution. Failover timings are for the Region-loss case only.
