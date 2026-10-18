---
title: "Reel Analyzer"
summary: "A Chrome extension that turns an Instagram Reel into a structured record of what was said, shown and claimed, with tools to fact-check claims yourself."
date: 2026-10-18
weight: 2
featured: true
status: "Working end to end · in active development"
role: "Solo: product & engineering"
timeline: "Sep 2026 – present"
context: "Self-directed project"
stack:
  - JavaScript
  - Chrome Extension (MV3)
  - Node.js / Express
  - Gemini (video + vision)
  - Web search API
tags:
  - Multimodal AI
  - Chrome Extension
  - LLM Evaluation
  - Data Integrity
---

## Context

Short videos are where a lot of claims spread now: health tips, money advice, "facts" about products and news. I wanted a tool that sits on top of Instagram and answers three questions about any Reel: **what exactly was said, what was shown on screen, and which statements are claims worth checking.**

## The problem

- **The claim isn't in the caption.** It's spoken or flashed on screen, so checking it means rewatching and transcribing by hand.
- **The poster isn't always the source.** Reposts and aggregator accounts mean the caption and account can differ from what the video shows.
- **Checking takes too many steps.** There's no built-in way to search a claim without leaving the app and retyping it.
- **Instagram's page is hostile to tools.** Its markup is minified and changes often, so simple scrapers break.

## Approach & process

**Key decisions**

- **Read the app's own data, not its CSS.** Instead of brittle selectors, the extension reads Instagram's underlying React and Relay data structures to find a Reel's ID, creator and caption, which survives redesigns far better.
- **Never attribute content to the wrong Reel.** A three-layer pipeline (identity → caption → validation) cross-checks every piece of evidence. If the identity can't be confirmed, it says so instead of guessing.
- **Analyze the actual video, not just the caption.** The extension captures the playing Reel's own video and audio and sends it to Gemini, which returns a structured result: transcript, on-screen text, visual events and claims, each with timestamps mapped back to the Reel's original timeline.
- **Extract claims, don't judge them.** Identifying that a claim was made is kept strictly separate from deciding whether it's true. The tool never outputs "true" or "false"; users check claims with the built-in web search.
- **Private by design.** The backend runs locally, and logs contain only counts and sizes: never transcripts, captions or API keys.

{{< callout title="Key insight" >}}
The most dangerous bugs here are **silent**. In one case the extension and backend each passed their own tests, but they disagreed on a data shape, so every real result quietly lost its Reel ID and caption. The fix wasn't just the code: I added integration tests that feed one side's **real output** straight into the other side, so that class of bug can't hide again.
{{< /callout >}}

**Debugging with evidence, not guesses**

- **A real Reel failed identity checks.** I captured a diagnostic snapshot of the live page, traced the failure to two different ID formats for the same video, confirmed the pattern across 13 real Reels, and added regression tests using the exact failing values.
- **A large Reel was rejected.** The numbers explained it: base64 encoding inflates video by 4/3, pushing a 37 MB capture past the request limit. That turned a vague "it failed" into a clear capacity problem with defined options to solve it.
- **Unexplained issues stay labeled as open.** Where the root cause isn't proven yet, I added targeted logging to collect evidence rather than shipping a guessed fix.

## The solution

**What the extension does**

- **Reel analysis:** capture a Reel (10-second test or full length) and get its transcript, on-screen text, visual events and extracted claims, with timestamps.
- **Reliable Reel identity:** confirmed shortcode, creator and caption pulled from the live page.
- **Claim search:** search the web for any claim without leaving Instagram.
- **Screenshot analysis:** AI review of any image for suspicious or misleading content.
- **Diagnostics:** an "Inspect" snapshot and one-click reset that stays safe even while requests are in flight.

**Known limits:** very large Reels exceed the current analysis request size, and dense, small on-screen text (like code on screen) isn't reliably extracted yet.

## Impact

- **Works end to end** against the real Gemini API on real Instagram Reels.
- **About 1,590 automated checks**: 1,428 of 1,430 extension checks and 160 of 160 backend checks pass (the two failures are cosmetic string matches, not functional bugs).
- **Zero wrong-Reel attributions by design:** identity is reported only when every piece of evidence agrees, and this is enforced by tests.

## What I learned

- Test the seams: two correct components can still produce a wrong system.
- "I don't know" is a feature. Refusing to guess built more trust than a confident wrong answer.
- Measure before deciding: capture-quality presets stay an open experiment until there's side-by-side evidence.
