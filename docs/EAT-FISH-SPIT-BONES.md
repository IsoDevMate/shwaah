# Eat the fish, spit the bones

This project applies two lessons from production AI work:

- **Claudegres:** a model claimed an index scan while the execution trace showed
  sequential reads. A convincing explanation is not evidence.
- **Multigres:** the engineer supplied phased checklists, domain expectations,
  and regression tests; the model supplied typing leverage.

For Shwaah:

- **Fish:** API response plus matching Turso/R2 state, or a passing test that
  exercises the real path.
- **Bones:** “implemented,” “optimized,” or “secure” without a matching trace.
- **Unknown:** not exercised in this run.

Before verification, write the expected result. After verification, record the
command, exit status, and persisted field. Do not promote bones into
`docs/STAGES.md`.
