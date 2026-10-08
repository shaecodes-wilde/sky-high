# Sky High / Cloudbloom engineering guidance

Read [docs/STATUS.md](docs/STATUS.md) before changing gameplay. Preserve the story, collectibles, Petal Parade, Adventure and Time Trial behavior, and unrelated work.

Before changing movement or movement-heavy level content, read the canonical standards:

- [Movement design](docs/MOVEMENT_DESIGN.md): player-facing controls, transitions and accessibility.
- [Cloud Curl physics](docs/CLOUD_CURL_PHYSICS.md): authoritative simulation contract, units, geometry, invariants and tuning.
- [Level design standard](docs/LEVEL_DESIGN_STANDARD.md): route roles, authoring examples, recovery and continuous-route acceptance.
- [Animation standard](docs/ANIMATION_STANDARD.md): read-only presentation and replaceable character assets.
- [Skyflow Laboratory](docs/SKYFLOW_LABORATORY.md): repeatable fixtures and development playtesting.

Physics runs at 60 Hz. Animation, Bloom and visual presets must never change simulation. Both characters use identical movement and collision. Movement or relevant route geometry changes require a movement-rules version bump so old Time Trial records remain separate.

Validate complete movement phrases with the production World, carrying velocity, dash resources and world state between contacts. Do not describe independent jump tests or mocked integrations as completed routes. Report measured reachability separately from human comfort/feel-testing.

Run the complete tests and production type-check/build, retain repeatable evidence, and check git diff whitespace before handoff. Use isolated worktrees and explicit file ownership for parallel work. Do not overwrite or silently integrate independent art branches. Do not merge into the default branch or publish without the user's approval.
