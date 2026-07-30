extends SceneTree

const MODEL_PATH := "res://features/model/garden_game_model.gd"
const Catalog := preload("res://features/catalog/game_catalog.gd")
const REQUIRED_METHODS: Array[StringName] = [
	&"new_run",
	&"advance",
	&"purchase_shop",
	&"reroll_shop",
	&"toggle_shop_lock",
	&"place_from_bench",
	&"move_board",
	&"return_to_bench",
	&"sell_bench",
	&"start_wave",
	&"choose_reward",
	&"choose_mutation",
	&"use_fertilizer",
	&"use_shovel",
	&"toggle_pause",
	&"snapshot",
	&"autoplay_step",
]

var _failures := 0


func _init() -> void:
	call_deferred(&"_run")


func _run() -> void:
	if not ResourceLoader.exists(MODEL_PATH):
		_fail("GardenGameModel is missing at %s; implement the agreed model API before running native QA." % MODEL_PATH)
		_finish()
		return

	var model_script: Script = load(MODEL_PATH)
	if model_script == null:
		_fail("GardenGameModel could not be loaded; inspect parser errors above.")
		_finish()
		return

	var contract_model: Variant = model_script.new()
	for method_name: StringName in REQUIRED_METHODS:
		_assert_true(contract_model.has_method(method_name), "GardenGameModel must implement %s()" % method_name)
	if _failures > 0:
		_finish()
		return

	_test_seeded_shop(model_script)
	_test_catalog_content()
	_test_shop_lock(model_script)
	_test_purchase_economy(model_script)
	_test_merge_and_mutation(model_script)
	_test_graft(model_script)
	_test_two_synergies(model_script)
	_test_autoplay_victory(model_script)
	_finish()


func _test_seeded_shop(model_script: Script) -> void:
	var first: Variant = model_script.new()
	var second: Variant = model_script.new()
	first.call(&"new_run", 99)
	second.call(&"new_run", 99)
	var first_shop: Array = _array_field(_snapshot(first), [&"shop", &"shop_items"])
	var second_shop: Array = _array_field(_snapshot(second), [&"shop", &"shop_items"])
	_assert_true(not first_shop.is_empty(), "snapshot() must expose a non-empty shop array")
	_assert_equal(first_shop, second_shop, "same seed must generate the same initial shop")


func _test_catalog_content() -> void:
	_assert_equal(Catalog.PLANTS.size(), 12, "catalog must define 12 original plants")
	_assert_equal(Catalog.ENEMIES.size(), 8, "catalog must define 8 regular enemies")
	_assert_equal(Catalog.BOSSES.size(), 3, "catalog must define 3 bosses")
	_assert_equal(Catalog.WAVES.size(), 15, "catalog must define 15 waves")


func _test_shop_lock(model_script: Script) -> void:
	var model: Variant = model_script.new()
	model.call(&"new_run", 1985)
	model.call(&"toggle_shop_lock")
	var before: Array = _array_field(_snapshot(model), [&"shop", &"shop_items"])
	model.call(&"reroll_shop")
	var after: Array = _array_field(_snapshot(model), [&"shop", &"shop_items"])
	_assert_equal(before, after, "reroll_shop() must preserve the shop while locked")


func _test_purchase_economy(model_script: Script) -> void:
	var model: Variant = model_script.new()
	model.call(&"new_run", 777)
	var before := _snapshot(model)
	var sun_before := _number_field(before, [&"sun", &"sunlight"])
	var bench_before := _array_field(before, [&"bench", &"inventory"])
	var purchased := false
	for index: int in range(5):
		if bool(model.call(&"purchase_shop", index)):
			purchased = true
			break
	var after := _snapshot(model)
	var sun_after := _number_field(after, [&"sun", &"sunlight"])
	var bench_after := _array_field(after, [&"bench", &"inventory"])
	_assert_true(purchased, "fixed seed 777 must offer at least one affordable shop item")
	_assert_true(sun_after < sun_before, "purchase_shop() must deduct sunlight")
	_assert_true(
		_occupied_count(bench_after) > _occupied_count(bench_before),
		"purchase_shop() must add an occupied item to the bench"
	)


func _test_merge_and_mutation(model_script: Script) -> void:
	var model: Variant = model_script.new()
	model.call(&"new_run", 303)
	model.sun = 10_000
	for _index: int in range(9):
		model.shop[0] = &"fire_bloom"
		_assert_true(bool(model.call(&"purchase_shop", 0)), "forced affordable seed must be purchasable for merge fixture")
	var before_choice := _snapshot(model)
	var star_three := _find_unit(_array_field(before_choice, [&"bench"]), "fire_bloom", 3)
	_assert_true(not star_three.is_empty(), "nine identical one-star plants must merge into one three-star plant")
	_assert_equal(_string_field(before_choice, [&"phase"]), "mutation", "three-star merge must enter mutation choice")
	_assert_true(not _array_field(before_choice, [&"mutation_options"]).is_empty(), "three-star plant must expose mutation options")
	_assert_true(bool(model.call(&"choose_mutation", 0)), "mutation option must be selectable")
	var mutated := _find_unit(_array_field(_snapshot(model), [&"bench"]), "fire_bloom", 3)
	_assert_true(not String(mutated.get("mutation_id", "")).is_empty(), "selected three-star mutation must persist on the plant")


func _test_graft(model_script: Script) -> void:
	var model: Variant = model_script.new()
	model.call(&"new_run", 404)
	model.sun = 1_000
	model.shop[0] = &"fire_bloom"
	model.call(&"purchase_shop", 0)
	model.shop[0] = &"frost_bell"
	model.call(&"purchase_shop", 0)
	var steam_lotus := _find_unit(_array_field(_snapshot(model), [&"bench"]), "steam_lotus", 1)
	_assert_true(not steam_lotus.is_empty(), "fire and ice plants must graft into steam_lotus")


func _test_two_synergies(model_script: Script) -> void:
	var model: Variant = model_script.new()
	model.call(&"new_run", 505)
	model.sun = 2_000
	for plant_id: StringName in [&"dew_bud", &"fire_bloom", &"thorn_vine", &"iron_fruit"]:
		model.shop[0] = plant_id
		model.call(&"purchase_shop", 0)
	model.call(&"place_from_bench", 0, 0, 0)
	model.call(&"place_from_bench", 1, 0, 1)
	model.call(&"place_from_bench", 2, 1, 0)
	model.call(&"place_from_bench", 3, 1, 1)
	var links: Dictionary = _snapshot(model).get("links", {})
	var link_types: Dictionary = {}
	for values: Variant in links.values():
		if values is Array:
			for value: Variant in values:
				link_types[String(value)] = true
	_assert_true(link_types.has("photosynthesis"), "adjacent sun and attacker plants must activate photosynthesis")
	_assert_true(link_types.has("thorns"), "vine behind a wall plant must activate thorns")


func _test_autoplay_victory(model_script: Script) -> void:
	var model: Variant = model_script.new()
	model.call(&"new_run", 1985)
	var final_snapshot := _snapshot(model)
	const MAX_STEPS := 240_000
	for step: int in range(MAX_STEPS):
		model.call(&"autoplay_step")
		model.call(&"advance", 1.0 / 30.0)
		if step % 120 == 0:
			final_snapshot = _snapshot(model)
			var phase := _string_field(final_snapshot, [&"phase", &"game_phase"])
			if phase == "victory" or phase == "game_over":
				break
	final_snapshot = _snapshot(model)
	var final_phase := _string_field(final_snapshot, [&"phase", &"game_phase"])
	var final_wave := _number_field(final_snapshot, [&"wave", &"wave_number"])
	var defense_hp := _number_field(final_snapshot, [&"defense_hp", &"defense"])
	_assert_equal(final_phase, "victory", "autoplay must finish the fixed-seed run in victory")
	_assert_true(final_wave >= 15.0, "autoplay victory must complete at least 15 waves")
	_assert_true(defense_hp > 0.0, "the defense must survive the winning autoplay run")


func _snapshot(model: Variant) -> Dictionary:
	var value: Variant = model.call(&"snapshot")
	if value is Dictionary:
		return value
	_fail("snapshot() must return Dictionary, got %s" % type_string(typeof(value)))
	return {}


func _field(snapshot: Dictionary, names: Array[StringName], fallback: Variant = null) -> Variant:
	for name: StringName in names:
		if snapshot.has(name):
			return snapshot[name]
		var text_name := String(name)
		if snapshot.has(text_name):
			return snapshot[text_name]
	return fallback


func _array_field(snapshot: Dictionary, names: Array[StringName]) -> Array:
	var value: Variant = _field(snapshot, names, [])
	if value is Array:
		return value
	_fail("snapshot field %s must be Array" % [names])
	return []


func _occupied_count(items: Array) -> int:
	var count := 0
	for item: Variant in items:
		if item == null:
			continue
		if item is String and String(item).is_empty():
			continue
		if item is Dictionary and item.is_empty():
			continue
		count += 1
	return count


func _find_unit(items: Array, plant_id: String, star: int) -> Dictionary:
	for item: Variant in items:
		if item is Dictionary and String(item.get("id", "")) == plant_id and int(item.get("star", 0)) == star:
			return item
	return {}


func _number_field(snapshot: Dictionary, names: Array[StringName]) -> float:
	var value: Variant = _field(snapshot, names, NAN)
	if value is int or value is float:
		return float(value)
	_fail("snapshot field %s must be numeric" % [names])
	return NAN


func _string_field(snapshot: Dictionary, names: Array[StringName]) -> String:
	var value: Variant = _field(snapshot, names, "")
	return String(value).to_lower()


func _assert_equal(actual: Variant, expected: Variant, message: String) -> void:
	if actual != expected:
		_fail("%s\n  expected: %s\n  actual:   %s" % [message, var_to_str(expected), var_to_str(actual)])
	else:
		print("PASS: %s" % message)


func _assert_true(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)
	else:
		print("PASS: %s" % message)


func _fail(message: String) -> void:
	_failures += 1
	push_error("FAIL: %s" % message)


func _finish() -> void:
	if _failures == 0:
		print("PASS: all native deterministic tests passed")
		quit(0)
	else:
		push_error("%d native deterministic test(s) failed" % _failures)
		quit(1)
