class_name GardenWebTestBridge
extends Node

const REQUIRED_UI_STRINGS := ["末日花园自走棋", "阳光", "波次", "防线血量", "刷新", "锁定"]

var _model: RefCounted
var _view: Control
var _callbacks: Array[JavaScriptObject] = []


func set_model(model: RefCounted, view: Control) -> void:
	if _model != null and _model.has_signal(&"state_changed") and _model.is_connected(&"state_changed", Callable(self, "_on_model_state_changed")):
		_model.disconnect(&"state_changed", Callable(self, "_on_model_state_changed"))
	_model = model
	_view = view
	if _model != null and _model.has_signal(&"state_changed"):
		_model.connect(&"state_changed", Callable(self, "_on_model_state_changed"))


func _ready() -> void:
	if not OS.has_feature("web"):
		return
	_install_web_bridge()


func new_run(seed: int) -> bool:
	if _model == null or not _model.has_method(&"new_run"):
		return false
	_model.call(&"new_run", seed)
	return true


func snapshot() -> String:
	if _model == null or not _model.has_method(&"snapshot"):
		return "{}"
	var value: Variant = _model.call(&"snapshot")
	if value is String:
		return value
	return JSON.stringify(value)


func autoplay_step() -> bool:
	if _model == null or not _model.has_method(&"autoplay_step"):
		return false
	return bool(_model.call(&"autoplay_step"))


func advance(delta: float) -> bool:
	if _model == null or not _model.has_method(&"advance"):
		return false
	_model.call(&"advance", clampf(delta, 0.0, 10.0))
	return true


func ui_strings() -> String:
	return JSON.stringify(REQUIRED_UI_STRINGS)


func prepare_visual_state(state: String = "start") -> bool:
	var allowed := [&"start", &"prep", &"battle", &"reward", &"defeat", &"victory"]
	var state_name := StringName(state)
	if not allowed.has(state_name) or _model == null:
		return false
	if _model.has_method(&"prepare_visual_state"):
		return bool(_model.call(&"prepare_visual_state", state_name))
	if state_name == &"start":
		return new_run(1985)
	return false


func set_reduced_motion(value: bool) -> bool:
	if _model != null and _model.has_method(&"set_reduced_motion"):
		_model.call(&"set_reduced_motion", value)
	GlobalSignalBus.settings_changed.emit(value, false)
	return true


func set_paused_for_screenshot(value: bool) -> bool:
	if _model != null and _model.has_method(&"set_paused_for_screenshot"):
		_model.call(&"set_paused_for_screenshot", value)
		return true
	return false


func invoke(action: String, arguments_json: String = "[]") -> Variant:
	var parsed: Variant = JSON.parse_string(arguments_json)
	var arguments: Array = parsed if parsed is Array else []
	return _invoke_allowed(StringName(action), arguments)


func _invoke_allowed(action: StringName, arguments: Array) -> Variant:
	if _model == null:
		return false
	var methods := {
		&"purchase_shop": &"purchase_shop", &"reroll_shop": &"reroll_shop",
		&"toggle_shop_lock": &"toggle_shop_lock", &"place_from_bench": &"place_from_bench",
		&"move_board": &"move_board", &"return_to_bench": &"return_to_bench",
		&"sell_bench": &"sell_bench", &"start_wave": &"start_wave",
		&"choose_reward": &"choose_reward", &"choose_mutation": &"choose_mutation",
		&"use_fertilizer": &"use_fertilizer", &"use_shovel": &"use_shovel",
		&"toggle_pause": &"toggle_pause", &"autoplay_step": &"autoplay_step"
	}
	if not methods.has(action):
		return false
	var method: StringName = methods[action]
	if not _model.has_method(method):
		return false
	return _model.callv(method, arguments)


func _install_web_bridge() -> void:
	var window := JavaScriptBridge.get_interface("window")
	if window == null:
		return
	_register_callback(window, "__garden_new_run", _js_new_run)
	_register_callback(window, "__garden_snapshot", _js_snapshot)
	_register_callback(window, "__garden_autoplay", _js_autoplay)
	_register_callback(window, "__garden_advance", _js_advance)
	_register_callback(window, "__garden_ui_strings", _js_ui_strings)
	_register_callback(window, "__garden_prepare_visual", _js_prepare_visual)
	_register_callback(window, "__garden_invoke", _js_invoke)
	_register_callback(window, "__garden_reduced_motion", _js_reduced_motion)
	_register_callback(window, "__garden_pause_screenshot", _js_pause_screenshot)
	window.set("__garden_snapshot_json", snapshot())
	window.set("__garden_ui_strings_json", ui_strings())
	# The script is constant. No external value is interpolated into executable JavaScript.
	JavaScriptBridge.eval("""
window.GardenTestBridge = Object.freeze({
  new_run: (seed) => { window.__garden_new_run(Number(seed)); return true; },
  setSeed: (seed) => { window.__garden_new_run(Number(seed)); return true; },
  snapshot: () => window.__garden_snapshot_json,
  autoplay_step: () => { window.__garden_autoplay(); return true; },
  autoplay: () => { window.__garden_autoplay(); return true; },
  advance: (delta) => { window.__garden_advance(Number(delta)); return true; },
  ui_strings: () => window.__garden_ui_strings_json,
  prepare_visual_state: (state) => { window.__garden_prepare_visual(String(state)); return true; },
  invoke: (action, args = []) => { window.__garden_invoke(String(action), JSON.stringify(args)); return true; },
  set_reduced_motion: (value) => { window.__garden_reduced_motion(Boolean(value)); return true; },
  set_paused_for_screenshot: (value) => { window.__garden_pause_screenshot(Boolean(value)); return true; }
});
""", true)


func _on_model_state_changed(_reason: StringName) -> void:
	_sync_web_snapshot()


func _sync_web_snapshot() -> void:
	if not OS.has_feature("web"):
		return
	var window := JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("__garden_snapshot_json", snapshot())


func _register_callback(window: JavaScriptObject, property: String, callable: Callable) -> void:
	var callback := JavaScriptBridge.create_callback(callable)
	_callbacks.append(callback)
	window.set(property, callback)


func _js_new_run(arguments: Array) -> bool:
	return new_run(int(arguments[0]) if not arguments.is_empty() else 1985)


func _js_snapshot(_arguments: Array) -> String:
	return snapshot()


func _js_autoplay(_arguments: Array) -> bool:
	return autoplay_step()


func _js_advance(arguments: Array) -> bool:
	return advance(float(arguments[0]) if not arguments.is_empty() else 0.0)


func _js_ui_strings(_arguments: Array) -> String:
	return ui_strings()


func _js_prepare_visual(arguments: Array) -> bool:
	return prepare_visual_state(String(arguments[0]) if not arguments.is_empty() else "start")


func _js_invoke(arguments: Array) -> Variant:
	return invoke(String(arguments[0]) if not arguments.is_empty() else "", String(arguments[1]) if arguments.size() > 1 else "[]")


func _js_reduced_motion(arguments: Array) -> bool:
	return set_reduced_motion(bool(arguments[0]) if not arguments.is_empty() else false)


func _js_pause_screenshot(arguments: Array) -> bool:
	return set_paused_for_screenshot(bool(arguments[0]) if not arguments.is_empty() else false)
