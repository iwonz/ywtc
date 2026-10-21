# Tasks

## 1. Semantic verification

- [x] 1.1 Implement block-boundary-aware semantic text extraction and verify provider whitespace changes pass while meaningful inline spacing and missing payload still fail in `tests/content-model.test.ts`
- [x] 1.2 Add a typed destination-content verification error and verify failed comparisons expose their structured result without weakening existing assertions

## 2. Pipeline recovery and diagnostics

- [x] 2.1 Retain the latest attempted complete page representation for catch-path recovery and verify a late failure checks final content rather than stale bootstrap references in `tests/migration-content-safety.test.ts`
- [x] 2.2 Emit verification failures with a stable verification issue code/category and verify non-verification provider failures keep their existing classification

## 3. Run correlation

- [x] 3.1 Reuse the state run identifier for report data and bundle paths, then verify terminal/state/report/catalog correlation in report and migration tests

## 4. Integration quality

- [x] 4.1 Run focused verification and migration tests and confirm both false-failure fixture shapes finish as complete adaptations
- [x] 4.2 Run `npm run check` and resolve every project quality-gate failure

## Workflow follow-up

- Archive the OpenSpec change after every tracked task is complete.
- Run strict OpenSpec validation again after archival.
