# Project Memory

## AI + Java Dev Coach MVP

- Scenario: Turn the existing Java AI Agent MVP into a development cockpit for Java + AI learners, covering requirement breakdown, scaffold generation, and log diagnosis.
- Minimal architecture: Add backend `coach` module with `Controller -> Service -> Prompt/Template/Zip infra` boundaries, persist `dev_coach_runs`, and expose a Web `CoachWorkspace`.
- Verification commands: `mvn -q test`, `mvn -q -DskipTests compile`, `cd web && npm run build`; scaffold ZIPs should unzip and pass `mvn -q -DskipTests package`.
- Next extensions: add learning drills, richer template catalog, CLI commands, and long-term engineering-memory search only after the MVP endpoints are stable.
