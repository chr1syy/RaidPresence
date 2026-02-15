# Test Auto Run 01

## Goal
Run a quick validation pass with two automated test tasks.

- [x] Run targeted command tests with `npm run test:jest -- src/commands/__tests__/raid-list.test.ts` and confirm Jest exits with code 0.
  - Completed in loop `00001` on `2026-02-15`: Jest exited with code `0` (4/4 tests passed).
- [ ] Run targeted utility tests with `npm run test:jest -- src/utils/__tests__/statsCalculator.test.ts` and confirm Jest exits with code 0.

## Human Follow-up
- Review failures (if any) and decide whether to open a bugfix auto-run document.
