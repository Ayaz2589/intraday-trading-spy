"""Feature 022 — historic trade replay.

Replays a stored historical session bar-by-bar through the BACKTEST decision +
fill primitives (strategy → risk → broker/paper.py) so automation matches a
backtest exactly (SC-004), wrapped in a paced, interruptible, in-memory session
that supports manual trading. Strictly ephemeral: nothing here is written to the
database, so it can never leak into the runs/Insights archive or the live
paper_* record (SC-005)."""
