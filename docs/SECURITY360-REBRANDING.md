# Report title rebranding

Report titles are shared defaults in `packages/shared/src/reportTitles.ts`. A fresh deployment needs no database migration or seed step; values read from code defaults until an administrator overrides them.

To change titles, open **Settings → Report Titles**, edit the applicable row, and save. The configured title is used by the matching PDF, Excel, API report, email body, or UI heading. The scheduled email prefix is a separate global field on the same panel.

Resetting one title deletes only that override. Reset all deletes the overrides row. In both cases the title immediately resolves to the shared code default. The email prefix defaults to `STAP Report` when no setting exists.

## Examples

| Output | Default | Example custom setting |
|---|---|---|
| Invoice PDF heading | `INVOICE` | `TAX INVOICE` |
| Daily operations Excel heading | `STAP Security — Daily Operations Report` | `Operations Summary` |

Changing the email prefix to `North Region` produces subjects such as `North Region: Weekly Ops Summary`.
