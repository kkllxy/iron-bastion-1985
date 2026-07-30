class_name GardenAudioDirector
extends Node

const MIX_RATE := 22050.0
const VOICE_COUNT := 3

var _model: RefCounted
var _players: Array[AudioStreamPlayer] = []
var _playbacks: Array[AudioStreamGeneratorPlayback] = []
var _voices: Array[Dictionary] = []
var _music_time := 0.0
var _muted := false
var _next_voice := 0
var _last_event_at: Dictionary = {}


func set_model(value: RefCounted) -> void:
	if _model != null and _model.has_signal(&"audio_requested") and _model.is_connected(&"audio_requested", Callable(self, "_on_audio_requested")):
		_model.disconnect(&"audio_requested", Callable(self, "_on_audio_requested"))
	_model = value
	if _model != null and _model.has_signal(&"audio_requested"):
		_model.connect(&"audio_requested", Callable(self, "_on_audio_requested"))


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_create_generator_player(linear_to_db(0.22))
	for _index in range(VOICE_COUNT):
		_create_generator_player(linear_to_db(0.34))
		_voices.append({"frequency": 0.0, "time": 0.0, "duration": 0.0, "gain": 0.0, "shape": 0})
	if not GlobalSignalBus.settings_changed.is_connected(_on_settings_changed):
		GlobalSignalBus.settings_changed.connect(_on_settings_changed)


func _process(_delta: float) -> void:
	if _playbacks.is_empty():
		return
	_fill_music(_playbacks[0])
	for index in range(VOICE_COUNT):
		_fill_voice(_playbacks[index + 1], _voices[index])


func set_muted(value: bool) -> void:
	_muted = value
	var volume := -80.0 if _muted else 0.0
	for player in _players:
		player.volume_db = player.get_meta(&"base_volume_db", -12.0) + volume


func is_muted() -> bool:
	return _muted


func _create_generator_player(base_volume_db: float) -> void:
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = MIX_RATE
	stream.buffer_length = 0.22
	var player := AudioStreamPlayer.new()
	player.stream = stream
	player.playback_type = AudioServer.PLAYBACK_TYPE_STREAM
	player.volume_db = base_volume_db
	player.set_meta(&"base_volume_db", base_volume_db)
	add_child(player)
	player.play()
	var playback := player.get_stream_playback() as AudioStreamGeneratorPlayback
	_players.append(player)
	_playbacks.append(playback)


func _fill_music(playback: AudioStreamGeneratorPlayback) -> void:
	if playback == null:
		return
	var frames := playback.get_frames_available()
	for _index in range(frames):
		var beat := fmod(_music_time, 8.0)
		var root := 110.0 if beat < 4.0 else 98.0
		var pulse := 0.6 + 0.4 * sin(TAU * 0.5 * _music_time)
		var sample := sin(TAU * root * _music_time) * 0.055
		sample += sin(TAU * root * 1.5 * _music_time) * 0.024 * pulse
		sample += sin(TAU * root * 2.0 * _music_time) * 0.012
		sample = clampf(sample, -0.12, 0.12)
		playback.push_frame(Vector2(sample, sample))
		_music_time += 1.0 / MIX_RATE


func _fill_voice(playback: AudioStreamGeneratorPlayback, voice: Dictionary) -> void:
	if playback == null:
		return
	var frames := playback.get_frames_available()
	for _index in range(frames):
		var sample := 0.0
		var time := float(voice["time"])
		var duration := float(voice["duration"])
		if time < duration and duration > 0.0:
			var progress := time / duration
			var envelope := sin(PI * clampf(progress * 1.7, 0.0, 1.0)) * (1.0 - progress)
			var frequency := float(voice["frequency"]) * lerpf(1.08, 0.82, progress)
			if int(voice["shape"]) == 1:
				sample = signf(sin(TAU * frequency * time)) * float(voice["gain"]) * envelope
			else:
				sample = sin(TAU * frequency * time) * float(voice["gain"]) * envelope
			sample = clampf(sample, -0.28, 0.28)
			voice["time"] = time + 1.0 / MIX_RATE
		playback.push_frame(Vector2(sample, sample))


func _on_audio_requested(kind: StringName) -> void:
	var now := Time.get_ticks_msec()
	var previous := int(_last_event_at.get(kind, -1000))
	if now - previous < 42:
		return
	_last_event_at[kind] = now
	var profile := _profile_for(kind)
	var voice: Dictionary = _voices[_next_voice]
	_next_voice = (_next_voice + 1) % VOICE_COUNT
	voice["frequency"] = profile[0]
	voice["duration"] = profile[1]
	voice["gain"] = profile[2]
	voice["shape"] = profile[3]
	voice["time"] = 0.0


func _profile_for(kind: StringName) -> Array:
	match String(kind):
		"purchase", "sun", "reward": return [620.0, 0.16, 0.17, 0]
		"shoot", "attack": return [360.0, 0.08, 0.12, 0]
		"hit", "damage": return [145.0, 0.10, 0.15, 1]
		"merge", "mutation": return [760.0, 0.34, 0.16, 0]
		"boss": return [72.0, 0.60, 0.18, 1]
		"victory": return [880.0, 0.70, 0.15, 0]
		"defeat": return [92.0, 0.55, 0.16, 0]
		_: return [440.0, 0.12, 0.10, 0]


func _on_settings_changed(_reduced_motion: bool, muted: bool) -> void:
	set_muted(muted)
