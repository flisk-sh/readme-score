# readme-score

**Is your README good enough?** The checks behind [readme.flisk.si](https://readme.flisk.si), for your terminal and CI.

```bash
npx @flisk-sh/readme-score
```

Scores the README of the current folder out of 100: sections, first screen, readability, quickstart, links, tagline
and the product's website, with the line and the fix for every miss. Give a folder or a public `owner/repo` instead.

No model and no account: the same files always give the same score, so a drop points at a check.

## Options

| Option                  |                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| `--min-score <n>`       | Exit 1 when a README scores below `n`                                           |
| `--type <type>`         | `cli`, `library`, `app` or `api` (default: detected)                            |
| `--no-website`          | Do not read the product's website; the checks that compare with it are left out |
| `--json` / `--markdown` | The full report as JSON, or a Markdown table for `$GITHUB_STEP_SUMMARY`         |

Exit codes: `0` passed, `1` below `--min-score`, `2` a README could not be read or the usage is wrong. For
`owner/repo`, `GITHUB_TOKEN` raises GitHub's limit from 60 to 5,000 calls an hour.

## In CI

```yaml
- uses: actions/checkout@v4
- uses: flisk-sh/readme-score@v1
  with:
    min-score: 90
```

MIT licensed. Source: [flisk-sh/readme-score](https://github.com/flisk-sh/readme-score).
