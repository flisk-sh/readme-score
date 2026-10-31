---
name: score-readme
description: Score a README out of 100 and list what to fix. Use when the user asks if their README is good, wants to improve it, or is about to publish a project.
---

# Score a README

Use the `score_readme` tool from the `readme-checker` server.

1. Take a public GitHub project (`owner/repo`) or the README text the user pasted. If they gave neither, ask which one.
2. Call `score_readme` with `repo` for a project, or `readme` for pasted text. Pass `type` or `website` only if the user said what kind of project it is or gave its site.
3. Tell the user the score out of 100, then what to fix first, each with its line and its fix, in plain words.
4. If the user wants the fixes done, offer to edit their README. Do not change anything without asking.

The tool is read-only: it reads the public README (and the website if given) and stores nothing. Every check is a fixed rule, no model is used.
