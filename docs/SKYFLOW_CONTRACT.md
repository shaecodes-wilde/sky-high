# Skyflow implementation ownership record

This historical record describes the workstream boundaries. The current technical authority is [CLOUD_CURL_PHYSICS.md](CLOUD_CURL_PHYSICS.md). Player intent, authored levels and presentation have their own canonical standards linked from [the implementation report](SKYFLOW_IMPLEMENTATION_REPORT.md).

## Baseline and safeguards

- Base: origin/master at 0701b28, including the previously merged momentum build.
- The independent art branch was inspected without copying or merging its work.
- Integration stays on feat/cloud-curl-skyflow. No default-branch merge or remote publication.
- Preserve ordinary flat-platform behavior, legacy routes, collectibles, checkpoints and progression.

## Isolated workstreams

| Owner | Responsibility |
| --- | --- |
| A - Terrain | Analytic geometry, collision, curve contacts, terrain types and outcome tests. |
| B - Controller | Hold curl, directional pumps, tangent movement, bounded launches, Input and tuning. |
| C - Animation | Read-only frame selection, procedural compact art for both characters, effects and audio. |
| D - Content | Seven-zone Laboratory, additive Level 1 branch, real input-only route policies and content checks. |
| E - Validation | Continuous World telemetry, physical tapes, route criteria/evidence and permanent standards. |
| Principal | Shared contracts, World/Game integration, dependency ordering, browser checks, final tuning/review and git handoff. |

Every workstream used an isolated git worktree and committed owned files. Dependency commits were retained separately; the principal cherry-picked only owned changes into the feature branch. Terrain/controller contracts preceded final content and route measurements. Final integration review found and corrected wind-cap, grounded visual-speed and curve-departure boundary issues.

Repeatable receipts and source hashes are in [skyflow-workstreams.json](evidence/skyflow-workstreams.json) and the implementation report.
