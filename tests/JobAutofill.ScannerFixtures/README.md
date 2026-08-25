# Scanner Fixture Tests

This folder is the contract for browser capability growth.

```text
tests/JobAutofill.ScannerFixtures/
  fixtures/
    *.html
  expected/
    *.json
```

Each fixture should represent one real browser pattern:

- Native text input
- Native select
- Radio group
- Checkbox boolean
- Checkbox group
- File input
- ARIA listbox combobox
- ARIA grid combobox
- Dialog picker
- Tree picker
- Open shadow root
- Iframe boundary

The expected JSON should assert detected field shape, option extraction behavior, and whether fill is supported, partial, blocked, or manual.

Rules belong in `field-control-rules.json` only after a fixture proves `detector.js` and `fill.js` support the behavior.

## Run

```bash
node tests/JobAutofill.ScannerFixtures/run-fixtures.mjs
```

Open the printed local URL, then press `Run fixtures`.

The runner loads the production scripts from `src/JobAutofill.App/Platforms/Android/Scripts`, injects them into an isolated iframe for each fixture, runs `window.__scanFields()`, runs targeted option extraction for fields that require captured options, and then executes the declared fill assertions.
