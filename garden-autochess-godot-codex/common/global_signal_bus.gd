extends Node

## Lean lifecycle-only bus. Feature-local events stay on their owners.
signal run_started(seed: int)
signal phase_changed(previous_phase: int, next_phase: int)
signal run_finished(victory: bool, score: int)
signal settings_changed(reduced_motion: bool, muted: bool)
