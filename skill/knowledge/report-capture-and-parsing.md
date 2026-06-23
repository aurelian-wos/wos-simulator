# Report Capture And Parsing

## Read This When

Read this before changing:

- `wosctl report` or `wosctl reports`
- report screenshot capture
- scroll-to-bottom detection
- OCR or template matching
- battle-report parsing
- debug artifact copying
- testcase ingestion from captured reports

This document is for emulator/report tooling. Simulator behavior lives under `simulator/src/**`.

## Hard Rule: Do Not Parse Incomplete Captures

A captured report is parseable only if capture confirms the bottom of the report was reached. If bottom detection fails, parsing must fail hard rather than producing zero/default stats.

Required behavior:

1. Attempt to reach the report bottom.
2. Confirm the bottom using a report-end marker, not only image-mean stability.
3. Retry up to the configured retry limit.
4. If still not confirmed, save diagnostic screenshots and metadata.
5. Emit an error that clearly states where diagnostics were saved.
6. Do not parse the screenshots as a complete report.

Image stability can indicate scrolling stopped. It is not proof that the report bottom was reached.

## Battle vs Non-Battle Behavior

Single-report parsing:

- If the report is not a battle report, fail with a clear error.
- Do not return all-zero battle stats for non-battle reports.

Batch parsing:

- Skip non-battle reports only if that is the documented batch-mode contract.
- Record that a non-battle report was skipped.
- Do not silently convert skipped reports into zero/default battle results.

## Parser Contract

A parsed battle report should provide enough data to build or validate a TypeScript `BattleInput` and `game_report_result` observation:

```text
is_battle_report
report_bottom_reached
parser_version
capture_id or diagnostics id
attacker/defender names or roles
attacker/defender stat bonuses by unit
attacker troops: type, tier, fire-crystal level, count
defender troops: type, tier, fire-crystal level, count
remaining/survivor/loss/result values
warnings and parser confidence
```

Troop tier and fire-crystal level are separate fields. Do not collapse them if downstream code needs troop ids or current-account stat reconstruction.

## Parser Unification Goal

Avoid maintaining multiple incompatible scripts that parse stats differently.

A shared parser should handle:

- battle overview detection
- attacker/defender stat extraction
- troop count extraction
- troop type identification
- troop tier identification
- fire-crystal level identification
- result/survivor/loss extraction
- parser confidence and diagnostics

If one script has the best troop-type template matching, retain that capability and move it into the shared parser rather than discarding it.

## OCR And Template Matching

Use the simplest reliable parser for each field:

| Field | Preferred method |
|---|---|
| text labels and numeric stats | OCR or existing stat parser |
| troop type icons | template matching retained from the strongest implementation |
| troop tier | template matching or validated visual classifier |
| fire-crystal level | template matching or validated visual classifier |
| report-end marker | explicit marker detection |

## Diagnostics Contract

When debug capture is requested, missing debug artifacts are themselves diagnostic. Copy failures must be logged at warning level with:

- source key/name
- source path
- destination path
- exception message

Do not swallow debug-copy exceptions silently.
