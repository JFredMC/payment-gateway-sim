# domain/: shared, framework-free payment rules

This folder is **copied byte for byte** to `apps/web/src/app/domain/`. CI fails if the
copies differ (`pnpm check:domain`, see ADR 0003). The rules:

- Pure TypeScript with no imports outside this folder. No Node or DOM APIs, no crypto.
- Edit the API copy, then run `pnpm sync:domain`.
