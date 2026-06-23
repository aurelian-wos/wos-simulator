# Commands Reference

## Read This When

Read this before modifying command documentation, `wosctl`, or examples that call command-line tools.

The command reference must match `scripts/wosctl --help`. If a flag or command is not implemented, do not document it.

## Rules

- Check `./scripts/wosctl --help` from the skill root before changing examples.
- Check subcommand help before documenting subcommand flags.
- Do not document removed or broken commands.
- Do not document a `--json` flag unless argparse supports it.
- Keep examples minimal and copy/pasteable.

## Supported Command Surface

Current top-level commands:

```text
status
ensure-ready
goto
report
reports
memories
screencap
run-testcase
shell
capture-hero-skills
ensure-alliance
recall-camp
heal
```

`--instance/-i` is required for emulator actions except `status` and `run-testcase`.

## Stable Examples

From `skill/`:

```bash
./scripts/wosctl --help
./scripts/wosctl status
./scripts/wosctl --instance <instance-name> ensure-ready
./scripts/wosctl --instance <instance-name> goto world
./scripts/wosctl --instance <instance-name> goto coord 123 456
```

Report capture:

```bash
./scripts/wosctl --instance <instance-name> report --tab war --index 1
./scripts/wosctl --instance <instance-name> reports --tab reports --count 5
./scripts/wosctl --instance <instance-name> reports --tab starred --count 3 --full-json
```

Testcase collection:

```bash
./scripts/wosctl run-testcase testcase_spec/example.json
./scripts/wosctl run-testcase testcase_spec/example.json --repeat 10
./scripts/wosctl run-testcase testcase_spec/example.json --dry-run
```

`run-testcase` collects game observations only. It appends one observation per successful run under `game_report_result`; it does not run the TypeScript simulator or write `sim_result`.

Simulator comparison is separate and runs from the repo root:

```bash
npx tsx scripts/run_testcases.ts --matching <pattern>
```

## Removed / Intentionally Undocumented

Do not document:

```text
deploy-army
--json
```

## Documentation Checklist

Before committing command docs:

1. Run the documented command help or inspect argparse.
2. Confirm every flag exists.
3. Confirm every subcommand exists.
4. Confirm output format claims are true.
5. Remove examples for deprecated commands.
