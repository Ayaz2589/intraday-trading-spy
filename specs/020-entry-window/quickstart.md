# Quickstart — Entry-Window Filter Knobs (020)

## Test the hypothesis the evidence suggested (10:00–14:00)

```bash
# sweep the window start across the open (the −126R cohort boundary)
make study-sens CONFIG=default KNOB=start_minutes_after_open VALUES=0,15,30,45

# sweep the window end across the afternoon fade
make study-sens CONFIG=default KNOB=end_minutes_after_open VALUES=240,270,300,360
```

Or in the UI: Strategy page → edit a config → Signal group → set
"entry window start/end"; Validation page → Sensitivity → the two new pills.

## Judge it honestly (the same gauntlet as every knob)

```bash
make study-wf CONFIG=<windowed-config>   # walk-forward
make gate STUDY=<id>                     # pooled gate
make campaign CONFIG=<windowed-config>   # or let the loop hunt the window
```

If a windowed config ever passes the tightened gate, the lockbox decision
is — as always — yours alone.

## What you'll see in the journal

Setups that form outside the window appear as `skipped_window` rows with
full indicator context — the previously invisible "didn't trade the open"
decision is now a first-class learning artifact.

## What deliberately did NOT change

Defaults (0/390) reproduce pre-feature behavior byte-identically; the
opening-range rule and the 15:30 no-new-trades cutoff still bind; the
diagnostic's 30→270 window is a hypothesis to test, not a shipped default.
