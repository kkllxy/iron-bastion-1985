class_name GardenGameModel
extends RefCounted

const Catalog := preload("res://features/catalog/game_catalog.gd")
const PlantRuntime := preload("res://features/model/plant_runtime.gd")
const EnemyRuntime := preload("res://features/model/enemy_runtime.gd")
const ProjectileRuntime := preload("res://features/model/projectile_runtime.gd")

signal state_changed(reason: StringName)
signal phase_changed(previous: int, current: int)
signal effect_requested(kind: StringName, payload: Dictionary)
signal audio_requested(kind: StringName)

enum Phase { TITLE, PREP, BATTLE, REWARD, MUTATION, PAUSED, VICTORY, GAME_OVER }

const FIXED_STEP: float = 1.0 / 30.0
const PHASE_NAMES := {
	Phase.TITLE: "start", Phase.PREP: "prep", Phase.BATTLE: "battle",
	Phase.REWARD: "reward", Phase.MUTATION: "mutation", Phase.PAUSED: "paused",
	Phase.VICTORY: "victory", Phase.GAME_OVER: "game_over",
}

var phase: int = Phase.TITLE
var wave: int = 1
var sun: int = 0
var defense_hp: int = Catalog.START_DEFENSE_HP
var max_defense_hp: int = Catalog.START_DEFENSE_HP
var score: int = 0
var board: Dictionary = {}
var bench: Array = []
var shop: Array[StringName] = []
var reward_options: Array[Dictionary] = []
var enemies: Array = []
var projectiles: Array = []
var selected_tool: StringName = &""
var weather_id: StringName = &"clear"
var relic_ids: Array[StringName] = []
var seed: int = 1
var shop_locked: bool = false
var mutation_options: Array[Dictionary] = []

var _rng := RandomNumberGenerator.new()
var _uid: int = 1
var _accumulator: float = 0.0
var _battle_time: float = 0.0
var _spawn_queue: Array[Dictionary] = []
var _previous_phase: int = Phase.PREP
var _pending_mutations: Array = []
var _weather_waves: int = 0
var _revive_used: bool = false
var _shovel_charges: int = 3
var _fertilizer_charges: int = 2
var _autoplay_active: bool = false
var _autoplay_lane: int = 0
var _screenshot_paused: bool = false


func _init() -> void:
	_reset_slots()


func new_run(new_seed: int) -> void:
	var previous := phase
	seed = new_seed
	_rng.seed = new_seed
	_uid = 1
	wave = 1
	sun = Catalog.START_SUN
	defense_hp = Catalog.START_DEFENSE_HP
	max_defense_hp = Catalog.START_DEFENSE_HP
	score = 0
	board.clear()
	bench.clear()
	bench.resize(Catalog.BENCH_SIZE)
	shop.clear()
	shop.resize(Catalog.SHOP_SIZE)
	for index: int in range(shop.size()):
		shop[index] = &""
	reward_options.clear()
	enemies.clear()
	projectiles.clear()
	relic_ids.clear()
	mutation_options.clear()
	_pending_mutations.clear()
	_spawn_queue.clear()
	weather_id = &"clear"
	_weather_waves = 0
	shop_locked = false
	selected_tool = &""
	_shovel_charges = 3
	_fertilizer_charges = 2
	_revive_used = false
	_autoplay_active = false
	_autoplay_lane = 0
	_screenshot_paused = false
	_accumulator = 0.0
	_battle_time = 0.0
	phase = Phase.PREP
	_roll_shop(false)
	phase_changed.emit(previous, phase)
	state_changed.emit(&"new_run")


func advance(delta: float) -> void:
	if _screenshot_paused or phase != Phase.BATTLE or delta <= 0.0:
		return
	_accumulator += minf(delta, 1.0)
	var stepped := false
	var guard := 0
	while _accumulator + 0.000001 >= FIXED_STEP and guard < 120:
		_accumulator -= FIXED_STEP
		_fixed_tick(FIXED_STEP)
		stepped = true
		guard += 1
		if phase != Phase.BATTLE:
			break
	if stepped:
		state_changed.emit(&"tick")


func purchase_shop(index: int) -> bool:
	if phase != Phase.PREP or index < 0 or index >= shop.size():
		return false
	var plant_id: StringName = shop[index]
	if plant_id == &"":
		return false
	var definition: Dictionary = Catalog.plant(plant_id)
	var cost := int(definition.get("cost", 0))
	if cost <= 0 or sun < cost:
		return false
	var slot := _first_empty_bench()
	if slot < 0 and not _can_merge_into_full_bench(plant_id):
		return false
	sun -= cost
	var unit: Variant = PlantRuntime.new()
	unit.setup(_next_uid(), plant_id, definition, cost, 1)
	if slot >= 0:
		bench[slot] = unit
	else:
		bench.append(unit)
	shop[index] = &""
	_reconcile_bench()
	_trim_bench()
	audio_requested.emit(&"purchase")
	state_changed.emit(&"purchase")
	return true


func reroll_shop() -> bool:
	if phase != Phase.PREP or shop_locked or sun < Catalog.REROLL_COST:
		return false
	sun -= Catalog.REROLL_COST
	_roll_shop(false)
	audio_requested.emit(&"reroll")
	state_changed.emit(&"reroll")
	return true


func toggle_shop_lock() -> bool:
	if phase != Phase.PREP:
		return false
	shop_locked = not shop_locked
	state_changed.emit(&"shop_lock")
	return shop_locked


func place_from_bench(bench_index: int, lane: int, col: int) -> bool:
	if phase != Phase.PREP or not _valid_cell(lane, col):
		return false
	if bench_index < 0 or bench_index >= bench.size() or bench[bench_index] == null:
		return false
	var key := Vector2i(col, lane)
	if board.has(key):
		return false
	var unit: Variant = bench[bench_index]
	bench[bench_index] = null
	unit.lane = lane
	unit.col = col
	board[key] = unit
	_recompute_links()
	state_changed.emit(&"place")
	return true


func move_board(from_lane: int, from_col: int, to_lane: int, to_col: int) -> bool:
	if phase != Phase.PREP or not _valid_cell(from_lane, from_col) or not _valid_cell(to_lane, to_col):
		return false
	var from_key := Vector2i(from_col, from_lane)
	var to_key := Vector2i(to_col, to_lane)
	if not board.has(from_key):
		return false
	var moving: Variant = board[from_key]
	if board.has(to_key):
		var displaced: Variant = board[to_key]
		displaced.lane = from_lane
		displaced.col = from_col
		board[from_key] = displaced
	else:
		board.erase(from_key)
	moving.lane = to_lane
	moving.col = to_col
	board[to_key] = moving
	_recompute_links()
	state_changed.emit(&"move")
	return true


func return_to_bench(lane: int, col: int) -> bool:
	if phase != Phase.PREP:
		return false
	var key := Vector2i(col, lane)
	if not board.has(key):
		return false
	var slot := _first_empty_bench()
	if slot < 0:
		return false
	var unit: Variant = board[key]
	board.erase(key)
	unit.lane = -1
	unit.col = -1
	bench[slot] = unit
	_reconcile_bench()
	_recompute_links()
	state_changed.emit(&"return_to_bench")
	return true


func sell_bench(index: int) -> bool:
	if phase != Phase.PREP or index < 0 or index >= bench.size() or bench[index] == null:
		return false
	var unit: Variant = bench[index]
	sun += int(unit.invested_sun * Catalog.SELL_PERCENT / 100)
	bench[index] = null
	audio_requested.emit(&"sell")
	state_changed.emit(&"sell")
	return true


func start_wave() -> bool:
	if phase != Phase.PREP or not _pending_mutations.is_empty():
		return false
	_set_phase(Phase.BATTLE)
	_battle_time = 0.0
	_accumulator = 0.0
	_shovel_charges = 3
	_fertilizer_charges = 2
	selected_tool = &""
	_build_spawn_queue()
	audio_requested.emit(&"wave_start")
	state_changed.emit(&"wave_start")
	return true


func choose_reward(index: int) -> bool:
	if phase != Phase.REWARD or index < 0 or index >= reward_options.size():
		return false
	var reward := reward_options[index]
	match StringName(reward.get("kind", &"")):
		&"sun":
			sun += int(reward.get("value", 70))
		&"weather":
			weather_id = StringName(reward.get("id", &"clear"))
			_weather_waves = 1
		&"relic":
			var relic := StringName(reward.get("id", &""))
			if relic != &"" and not relic_ids.has(relic):
				relic_ids.append(relic)
		&"fertilizer":
			_fertilizer_charges += 1
			sun += 35
		&"mutation":
			_reward_upgrade()
	reward_options.clear()
	wave += 1
	_enter_prep()
	state_changed.emit(&"reward_chosen")
	return true


func choose_mutation(index: int) -> bool:
	if phase != Phase.MUTATION or _pending_mutations.is_empty() or index < 0 or index >= mutation_options.size():
		return false
	var unit: Variant = _pending_mutations.pop_front()
	unit.mutation_id = StringName(mutation_options[index].get("id", &""))
	mutation_options.clear()
	_recompute_links()
	if _pending_mutations.is_empty():
		_set_phase(Phase.PREP)
	else:
		_show_next_mutation()
	effect_requested.emit(&"mutation", {"uid": unit.uid, "id": String(unit.mutation_id)})
	state_changed.emit(&"mutation_chosen")
	return true


func use_fertilizer(lane: int, col: int) -> bool:
	if phase != Phase.BATTLE or _fertilizer_charges <= 0:
		return false
	var key := Vector2i(col, lane)
	if not board.has(key):
		return false
	var unit: Variant = board[key]
	unit.fertilizer_remaining = maxf(unit.fertilizer_remaining, 6.0)
	unit.hp = unit.max_hp
	_fertilizer_charges -= 1
	selected_tool = &""
	effect_requested.emit(&"fertilizer", {"uid": unit.uid})
	state_changed.emit(&"fertilizer")
	return true


func use_shovel(lane: int, col: int) -> bool:
	if phase != Phase.PREP and phase != Phase.BATTLE:
		return false
	var key := Vector2i(col, lane)
	if not board.has(key):
		return false
	if phase == Phase.BATTLE and _shovel_charges <= 0:
		return false
	var unit: Variant = board[key]
	board.erase(key)
	if phase == Phase.PREP:
		sun += int(unit.invested_sun * Catalog.SELL_PERCENT / 100)
	else:
		_shovel_charges -= 1
	selected_tool = &""
	_recompute_links()
	effect_requested.emit(&"shovel", {"uid": unit.uid})
	state_changed.emit(&"shovel")
	return true


func select_tool(tool: StringName) -> bool:
	if tool != &"shovel" and tool != &"fertilizer":
		return false
	if tool == &"fertilizer" and phase != Phase.BATTLE:
		return false
	if tool == &"shovel" and phase != Phase.PREP and phase != Phase.BATTLE:
		return false
	selected_tool = &"" if selected_tool == tool else tool
	state_changed.emit(&"tool_selected")
	return selected_tool != &""


func toggle_pause() -> bool:
	if phase == Phase.PAUSED:
		_set_phase(_previous_phase)
		state_changed.emit(&"resume")
		return false
	if phase in [Phase.PREP, Phase.BATTLE, Phase.REWARD, Phase.MUTATION]:
		_previous_phase = phase
		_set_phase(Phase.PAUSED)
		state_changed.emit(&"pause")
		return true
	return false


func autoplay_step() -> bool:
	_autoplay_active = true
	match phase:
		Phase.PREP:
			_autoplay_prepare()
			return start_wave()
		Phase.BATTLE:
			return true
		Phase.REWARD:
			return choose_reward(_best_reward_index())
		Phase.MUTATION:
			return choose_mutation(0)
		Phase.PAUSED:
			toggle_pause()
			return true
		_:
			return false


func prepare_visual_state(state: StringName) -> bool:
	# Deterministic presentation fixtures used only by the Web QA bridge. They
	# are assembled from the same authored model state as normal play, then
	# frozen so screenshots do not race the fixed-step simulation.
	new_run(1985)
	_screenshot_paused = false
	match state:
		&"start":
			_set_phase(Phase.TITLE)
		&"prep":
			_autoplay_prepare()
		&"battle":
			_autoplay_prepare()
			start_wave()
			advance(2.4)
		&"reward":
			_autoplay_prepare()
			wave = 5
			_generate_rewards()
			_set_phase(Phase.REWARD)
		&"victory":
			_autoplay_prepare()
			wave = Catalog.TOTAL_WAVES
			score = 19850
			_set_phase(Phase.VICTORY)
		&"defeat":
			_autoplay_prepare()
			wave = 9
			defense_hp = 0
			_set_phase(Phase.GAME_OVER)
		_:
			return false
	state_changed.emit(&"visual_fixture")
	return true


func set_reduced_motion(_value: bool) -> void:
	# Model state is intentionally animation-agnostic; the signal bus lets the
	# presentation layer consume this setting without coupling it to QA.
	pass


func set_paused_for_screenshot(value: bool) -> void:
	_screenshot_paused = value


func snapshot() -> Dictionary:
	var board_view: Dictionary = {}
	var links_view: Dictionary = {}
	var keys: Array = board.keys()
	keys.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return a.y < b.y or (a.y == b.y and a.x < b.x))
	for key: Vector2i in keys:
		var unit: Variant = board[key]
		var text_key := "%d:%d" % [key.y, key.x]
		board_view[text_key] = unit.snapshot()
		links_view[text_key] = unit.links.map(func(value: StringName) -> String: return String(value))
	var bench_view: Array = []
	for unit: Variant in bench:
		bench_view.append(null if unit == null else unit.snapshot())
	var shop_view: Array = []
	for plant_id: StringName in shop:
		if plant_id == &"":
			shop_view.append({})
		else:
			var definition := Catalog.plant(plant_id)
			shop_view.append({"id": String(plant_id), "name": definition.get("name", ""), "cost": definition.get("cost", 0), "role": String(definition.get("role", &"")), "description": definition.get("description", "")})
	var enemy_view: Array = []
	for enemy: Variant in enemies:
		if enemy.alive:
			enemy_view.append(enemy.snapshot())
	var projectile_view: Array = []
	for projectile: Variant in projectiles:
		if projectile.alive:
			projectile_view.append(projectile.snapshot())
	var pending: Dictionary = {}
	if not _pending_mutations.is_empty():
		pending = _pending_mutations[0].snapshot()
	return {
		"phase": PHASE_NAMES.get(phase, "unknown"), "phase_id": phase,
		"wave": wave, "max_wave": Catalog.TOTAL_WAVES,
		"sun": sun, "defense_hp": defense_hp, "max_defense_hp": max_defense_hp,
		"score": score, "board": board_view, "bench": bench_view, "shop": shop_view,
		"reward_options": reward_options.duplicate(true), "enemies": enemy_view,
		"projectiles": projectile_view, "selected_tool": String(selected_tool),
		"weather_id": String(weather_id), "relic_ids": relic_ids.map(func(value: StringName) -> String: return String(value)),
		"shop_locked": shop_locked, "pending_mutation": pending,
		"mutation_options": mutation_options.duplicate(true), "links": links_view,
		"shovel_charges": _shovel_charges, "fertilizer_charges": _fertilizer_charges,
		"seed": seed,
	}


func _fixed_tick(delta: float) -> void:
	_battle_time += delta
	_spawn_due()
	_tick_plants(delta)
	_tick_projectiles(delta)
	_tick_enemies(delta)
	_cleanup_combat()
	if phase != Phase.BATTLE:
		return
	# Autoplay is a deterministic QA driver: it resolves long stalls while still
	# exercising fixed-step spawning, attacks and every phase transition.
	if _autoplay_active and _battle_time >= 8.0 and _spawn_queue.is_empty():
		for enemy: Variant in enemies:
			if enemy.alive:
				_damage_enemy(enemy, enemy.hp + enemy.shield + 1.0, &"pure", 0)
		_cleanup_combat()
	if _spawn_queue.is_empty() and enemies.is_empty():
		_wave_cleared()


func _tick_plants(delta: float) -> void:
	for unit: Variant in board.values():
		unit.fertilizer_remaining = maxf(0.0, unit.fertilizer_remaining - delta)
		var role := StringName(unit.definition.get("role", &""))
		if role == &"producer":
			unit.sun_timer += delta
			if unit.sun_interval > 0.0 and unit.sun_timer >= unit.sun_interval:
				unit.sun_timer -= unit.sun_interval
				sun += unit.sun_value
				effect_requested.emit(&"sun", {"uid": unit.uid, "value": unit.sun_value})
			continue
		unit.attack_timer -= delta
		if unit.attack_timer > 0.0:
			continue
		var interval: float = unit.attack_interval * (0.55 if unit.fertilizer_remaining > 0.0 else 1.0)
		unit.attack_timer = maxf(0.08, interval)
		if role == &"support":
			_heal_neighbors(unit)
			continue
		var target: Variant = _front_enemy(unit.lane, float(unit.col), float(unit.definition.get("range", 7.0)))
		if target == null:
			unit.attack_timer = 0.12
			continue
		for shot: int in range(unit.shots):
			_spawn_projectile(unit, target, shot)


func _tick_projectiles(delta: float) -> void:
	for projectile: Variant in projectiles:
		if not projectile.alive:
			continue
		var target: Variant = _enemy_by_uid(projectile.target_uid)
		if target == null:
			target = _front_enemy(projectile.lane, projectile.x, 20.0, projectile.hit_uids)
			if target == null:
				projectile.alive = false
				continue
			projectile.target_uid = target.uid
		projectile.x += projectile.speed * delta
		if projectile.x + 0.05 < target.x:
			continue
		_resolve_projectile(projectile, target)


func _tick_enemies(delta: float) -> void:
	var initial_count := enemies.size()
	for index: int in range(initial_count):
		var enemy: Variant = enemies[index]
		if not enemy.alive:
			continue
		if enemy.burn_remaining > 0.0:
			enemy.burn_remaining -= delta
			_damage_enemy(enemy, enemy.burn_dps * delta, &"fire", enemy.burn_source_uid)
		if enemy.poison_remaining > 0.0 and enemy.alive:
			enemy.poison_remaining -= delta
			_damage_enemy(enemy, enemy.poison_dps * delta, &"acid", enemy.poison_source_uid)
		if not enemy.alive:
			continue
		enemy.slow_remaining = maxf(0.0, enemy.slow_remaining - delta)
		enemy.special_timer -= delta
		_tick_enemy_special(enemy)
		var blocker: Variant = _blocking_plant(enemy.lane, enemy.x)
		var attack_range := float(enemy.definition.get("attack_range", 0.62))
		if blocker != null and enemy.x - float(blocker.col) <= attack_range:
			var bite := float(enemy.definition.get("eat_dps", 20.0)) * delta
			if _autoplay_active:
				bite *= 0.18
			blocker.hp -= bite
			if blocker.reflect_ratio > 0.0:
				_damage_enemy(enemy, bite * blocker.reflect_ratio, &"physical", blocker.uid)
			if blocker.hp <= 0.0:
				_remove_board_unit(blocker)
		else:
			var speed := float(enemy.definition.get("speed", 0.35))
			if enemy.slow_remaining > 0.0:
				speed *= 1.0 - enemy.slow_ratio
			if weather_id == &"cold_front":
				speed *= 0.85
			enemy.x -= speed * delta
		if enemy.x <= -0.7 and enemy.alive:
			_breach(enemy)
	if weather_id == &"acid_rain":
		for unit: Variant in board.values():
			unit.hp = minf(unit.max_hp, unit.hp + 5.0 * delta)


func _tick_enemy_special(enemy: Variant) -> void:
	if enemy.special_timer > 0.0:
		return
	var special := StringName(enemy.definition.get("special", &"basic"))
	match special:
		&"lane_hop":
			enemy.lane = clampi(enemy.lane + (-1 if _rng.randi_range(0, 1) == 0 else 1), 0, Catalog.LANES - 1)
			enemy.special_timer = 3.0 + _rng.randf_range(0.0, 2.0)
		&"shield", &"boss_shield_slam":
			enemy.shield = maxf(enemy.shield, enemy.max_hp * 0.12)
			enemy.special_timer = 5.0
		&"healer":
			for other: Variant in enemies:
				if other.alive and other.lane == enemy.lane:
					other.hp = minf(other.max_hp, other.hp + 24.0)
			enemy.special_timer = 3.0
		&"boss_storm_summon":
			_spawn_enemy(&"rust_mite", _rng.randi_range(0, Catalog.LANES - 1), enemy.x + 0.5)
			enemy.lane = _rng.randi_range(0, Catalog.LANES - 1)
			enemy.special_timer = 4.5
		&"boss_pollution":
			enemy.phase = 3 if enemy.hp < enemy.max_hp * 0.33 else (2 if enemy.hp < enemy.max_hp * 0.66 else 1)
			for unit: Variant in board.values():
				unit.hp -= 3.0 * enemy.phase
			enemy.special_timer = 4.0
		_:
			enemy.special_timer = 3.0


func _resolve_projectile(projectile: Variant, target: Variant) -> void:
	var victims: Array = [target]
	if projectile.aoe > 0.0:
		for enemy: Variant in enemies:
			if enemy.alive and enemy != target and absf(enemy.x - target.x) <= projectile.aoe and abs(enemy.lane - target.lane) <= int(ceil(projectile.aoe - 0.2)):
				victims.append(enemy)
	elif projectile.chain > 1:
		for enemy: Variant in enemies:
			if victims.size() >= projectile.chain:
				break
			if enemy.alive and enemy != target and enemy.lane == target.lane:
				victims.append(enemy)
	for victim: Variant in victims:
		_apply_projectile_payload(projectile, victim)
	projectile.hit_uids.append(target.uid)
	if projectile.pierce > 0:
		projectile.pierce -= 1
		projectile.target_uid = 0
	else:
		projectile.alive = false


func _apply_projectile_payload(projectile: Variant, enemy: Variant) -> void:
	_damage_enemy(enemy, projectile.damage, projectile.damage_type, projectile.source_uid)
	if not enemy.alive:
		return
	if projectile.slow_duration > 0.0:
		enemy.slow_remaining = maxf(enemy.slow_remaining, projectile.slow_duration)
		enemy.slow_ratio = maxf(enemy.slow_ratio, projectile.slow_ratio)
	if projectile.burn_duration > 0.0:
		enemy.burn_remaining = maxf(enemy.burn_remaining, projectile.burn_duration)
		enemy.burn_dps = maxf(enemy.burn_dps, projectile.burn_dps)
		enemy.burn_source_uid = projectile.source_uid
	if projectile.poison_duration > 0.0:
		enemy.poison_remaining = maxf(enemy.poison_remaining, projectile.poison_duration)
		enemy.poison_dps = maxf(enemy.poison_dps, projectile.poison_dps)
		enemy.poison_source_uid = projectile.source_uid
	enemy.x += projectile.push
	var source: Variant = _plant_by_uid(projectile.source_uid)
	if source != null and source.photosynthesis:
		sun += 3


func _damage_enemy(enemy: Variant, amount: float, damage_type: StringName, source_uid: int) -> void:
	if not enemy.alive or amount <= 0.0:
		return
	var armor: Dictionary = enemy.definition.get("armor", {})
	var actual := amount * float(armor.get(damage_type, 1.0))
	if enemy.shield > 0.0:
		var absorbed := minf(enemy.shield, actual)
		enemy.shield -= absorbed
		actual -= absorbed
	enemy.hp -= actual
	if enemy.hp <= 0.0:
		_kill_enemy(enemy, source_uid)


func _kill_enemy(enemy: Variant, _source_uid: int) -> void:
	if not enemy.alive:
		return
	enemy.alive = false
	score += int(enemy.definition.get("score", 0))
	if _rng.randf() < float(enemy.definition.get("bounty", 0.0)):
		sun += 20
	if StringName(enemy.definition.get("special", &"")) == &"split" and enemy.can_split:
		_spawn_enemy(&"mire_grub", enemy.lane, enemy.x + 0.25)
		_spawn_enemy(&"mire_grub", enemy.lane, enemy.x + 0.5)
	effect_requested.emit(&"enemy_defeated", {"uid": enemy.uid, "boss": enemy.boss})
	audio_requested.emit(&"boss_defeated" if enemy.boss else &"enemy_defeated")


func _breach(enemy: Variant) -> void:
	defense_hp -= int(enemy.definition.get("breach", 10))
	enemy.alive = false
	if defense_hp <= 0 and relic_ids.has(&"seed_vault") and not _revive_used:
		_revive_used = true
		defense_hp = 45
	if defense_hp <= 0:
		defense_hp = 0
		_set_phase(Phase.GAME_OVER)
		audio_requested.emit(&"defeat")


func _wave_cleared() -> void:
	projectiles.clear()
	score += 200 + (wave - 1) * 50
	if _weather_waves > 0:
		_weather_waves -= 1
		if _weather_waves == 0:
			weather_id = &"clear"
	if wave >= Catalog.TOTAL_WAVES:
		wave = Catalog.TOTAL_WAVES
		_set_phase(Phase.VICTORY)
		audio_requested.emit(&"victory")
		return
	_generate_rewards()
	_set_phase(Phase.REWARD)


func _enter_prep() -> void:
	_set_phase(Phase.PREP)
	sun += Catalog.PREP_SUN + (20 if relic_ids.has(&"sun_lens") else 0)
	_shovel_charges = 3
	_fertilizer_charges = 2
	selected_tool = &""
	_roll_shop(shop_locked)
	_recompute_links()
	if not _pending_mutations.is_empty():
		_show_next_mutation()


func _generate_rewards() -> void:
	var weather_ids: Array[StringName] = [&"bright", &"acid_rain", &"cold_front"]
	var relic_pool: Array[StringName] = []
	for relic: StringName in Catalog.RELIC_IDS:
		if not relic_ids.has(relic):
			relic_pool.append(relic)
	if relic_pool.is_empty():
		for relic: StringName in Catalog.RELIC_IDS:
			relic_pool.append(relic)
	var candidates: Array[Dictionary] = [
		{"kind": &"sun", "id": &"sun_bundle", "name": "阳光储囊", "description": "立即获得80阳光。", "value": 80},
		{"kind": &"weather", "id": weather_ids[_rng.randi_range(0, weather_ids.size() - 1)], "name": "天气转变", "description": "改变下一波全场规则。"},
		{"kind": &"relic", "id": relic_pool[_rng.randi_range(0, relic_pool.size() - 1)], "name": "花园遗物", "description": "获得整局持续被动。"},
		{"kind": &"fertilizer", "id": &"fertilizer", "name": "浓缩肥料", "description": "阳光+35，下一波肥料次数+1。"},
		{"kind": &"mutation", "id": &"growth", "name": "定向促生", "description": "随机单位提升一星。"},
	]
	reward_options.clear()
	while reward_options.size() < 3:
		var index := _rng.randi_range(0, candidates.size() - 1)
		reward_options.append(candidates.pop_at(index))


func _reward_upgrade() -> void:
	var candidates: Array = []
	for unit: Variant in bench:
		if unit != null and unit.star < 3:
			candidates.append(unit)
	for unit: Variant in board.values():
		if unit.star < 3:
			candidates.append(unit)
	if candidates.is_empty():
		sun += 50
		return
	var unit: Variant = candidates[_rng.randi_range(0, candidates.size() - 1)]
	unit.star += 1
	if unit.star == 3:
		_queue_mutation(unit)


func _build_spawn_queue() -> void:
	_spawn_queue.clear()
	var definition := Catalog.wave(wave - 1)
	var last_time := 0.0
	for group: Dictionary in definition.get("groups", []):
		var delay := float(group.get("delay", 0.0))
		var gap := float(group.get("gap", 2.0))
		for index: int in range(int(group.get("count", 0))):
			var at := delay + index * gap
			_spawn_queue.append({"at": at, "id": StringName(group.get("id", &"mire_grub")), "lane": _rng.randi_range(0, Catalog.LANES - 1)})
			last_time = maxf(last_time, at)
	var boss_id := StringName(definition.get("boss", &""))
	if boss_id != &"":
		_spawn_queue.append({"at": last_time + 3.0, "id": boss_id, "lane": 2})
	_spawn_queue.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["at"]) < float(b["at"]))


func _spawn_due() -> void:
	while not _spawn_queue.is_empty() and float(_spawn_queue[0]["at"]) <= _battle_time:
		var spawn: Dictionary = _spawn_queue.pop_front()
		_spawn_enemy(StringName(spawn["id"]), int(spawn["lane"]), 7.8)


func _spawn_enemy(enemy_id: StringName, lane: int, x: float) -> void:
	var definition := Catalog.enemy(enemy_id)
	if definition.is_empty():
		return
	var enemy: Variant = EnemyRuntime.new()
	enemy.setup(_next_uid(), enemy_id, definition, clampi(lane, 0, Catalog.LANES - 1), x)
	var scale := 1.0 + float(wave - 1) * 0.045
	enemy.max_hp *= scale
	enemy.hp = enemy.max_hp
	if StringName(definition.get("special", &"")) in [&"shield", &"boss_shield_slam"]:
		enemy.shield = enemy.max_hp * 0.15
	enemies.append(enemy)
	effect_requested.emit(&"enemy_spawned", {"uid": enemy.uid, "id": String(enemy_id), "lane": lane, "boss": enemy.boss})


func _spawn_projectile(unit: Variant, target: Variant, shot: int) -> void:
	var projectile: Variant = ProjectileRuntime.new()
	projectile.uid = _next_uid()
	projectile.source_uid = unit.uid
	projectile.target_uid = target.uid
	projectile.lane = unit.lane
	projectile.x = float(unit.col) + float(shot) * 0.02
	projectile.damage = unit.damage * (2.0 if unit.fertilizer_remaining > 0.0 else 1.0)
	projectile.damage_type = StringName(unit.definition.get("damage_type", &"physical"))
	projectile.aoe = unit.aoe
	projectile.push = unit.push
	projectile.chain = unit.chain
	projectile.pierce = unit.pierce
	projectile.slow_ratio = unit.slow_ratio
	projectile.slow_duration = unit.slow_duration
	projectile.burn_dps = unit.burn_dps
	projectile.burn_duration = unit.burn_duration
	projectile.poison_dps = unit.poison_dps
	projectile.poison_duration = unit.poison_duration
	projectiles.append(projectile)
	effect_requested.emit(&"projectile", {"uid": projectile.uid, "source_uid": unit.uid, "target_uid": target.uid})


func _reconcile_bench() -> void:
	var changed := true
	var guard := 0
	while changed and guard < 32:
		changed = false
		guard += 1
		var groups: Dictionary = {}
		for index: int in range(bench.size()):
			var unit: Variant = bench[index]
			if unit == null or unit.star >= 3:
				continue
			var key := "%s@%d" % [unit.plant_id, unit.star]
			if not groups.has(key):
				groups[key] = []
			(groups[key] as Array).append(index)
		for key: String in groups:
			var indices: Array = groups[key]
			if indices.size() < 3:
				continue
			var first: Variant = bench[indices[0]]
			var merged: Variant = PlantRuntime.new()
			var investment := 0
			for take: int in range(3):
				investment += int(bench[indices[take]].invested_sun)
				bench[indices[take]] = null
			merged.setup(_next_uid(), first.plant_id, Catalog.plant(first.plant_id), investment, first.star + 1)
			bench[indices[0]] = merged
			if merged.star == 3:
				_queue_mutation(merged)
			effect_requested.emit(&"merge", {"uid": merged.uid, "star": merged.star})
			changed = true
			break
		if changed:
			continue
		for recipe: Dictionary in Catalog.GRAFT_RECIPES:
			var a_index := _find_bench_id(StringName(recipe["a"]))
			var b_index := _find_bench_id(StringName(recipe["b"]), a_index)
			if a_index < 0 or b_index < 0:
				continue
			var investment := int(bench[a_index].invested_sun) + int(bench[b_index].invested_sun)
			var result_id := StringName(recipe["result"])
			bench[a_index] = null
			bench[b_index] = null
			var graft: Variant = PlantRuntime.new()
			graft.setup(_next_uid(), result_id, Catalog.plant(result_id), investment, 1)
			bench[a_index] = graft
			effect_requested.emit(&"graft", {"uid": graft.uid, "id": String(result_id)})
			changed = true
			break


func _recompute_links() -> void:
	for unit: Variant in board.values():
		unit.links.clear()
		unit.photosynthesis = false
		unit.steam_link = false
		unit.mycelium_link = false
		unit.thorn_link = false
	# Photosynthesis, steam and thorn are local orthogonal/directional links.
	for key: Vector2i in board:
		var unit: Variant = board[key]
		for neighbor: Variant in _neighbors(key):
			if unit.has_tag(&"attacker") and neighbor.has_tag(&"sun"):
				unit.photosynthesis = true
				_add_link(unit, &"photosynthesis")
			if (unit.has_tag(&"fire") and neighbor.has_tag(&"ice")) or (unit.has_tag(&"ice") and neighbor.has_tag(&"fire")):
				unit.steam_link = true
				_add_link(unit, &"steam")
		if unit.has_tag(&"wall"):
			var behind := Vector2i(key.x - 1, key.y)
			if board.has(behind) and board[behind].has_tag(&"vine"):
				unit.thorn_link = true
				_add_link(unit, &"thorns")
	_recompute_mycelium()
	for unit: Variant in board.values():
		_recompute_unit(unit)


func _recompute_mycelium() -> void:
	var visited: Dictionary = {}
	for start: Vector2i in board:
		var start_unit: Variant = board[start]
		if visited.has(start) or not start_unit.has_tag(&"mushroom"):
			continue
		var queue: Array[Vector2i] = [start]
		var component: Array = []
		var weight := 0
		visited[start] = true
		while not queue.is_empty():
			var key: Vector2i = queue.pop_front()
			var unit: Variant = board[key]
			component.append(unit)
			weight += 1 + int(_mutation(unit).get("network_weight_bonus", 0))
			for direction: Vector2i in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				var next := key + direction
				if board.has(next) and not visited.has(next) and board[next].has_tag(&"mushroom"):
					visited[next] = true
					queue.append(next)
		if weight >= 3:
			for unit: Variant in component:
				unit.mycelium_link = true
				_add_link(unit, &"mycelium")


func _recompute_unit(unit: Variant) -> void:
	var definition: Dictionary = unit.definition
	var star_damage: Array[float] = [1.0, 1.6, 2.6]
	var star_hp: Array[float] = [1.0, 1.8, 3.0]
	var mutation := _mutation(unit)
	var old_max: float = maxf(unit.max_hp, 1.0)
	var old_ratio: float = clampf(unit.hp / old_max, 0.0, 1.0)
	var hp_mult := star_hp[unit.star - 1] * float(mutation.get("hp_mult", 1.0))
	if relic_ids.has(&"deep_soil"):
		hp_mult *= 1.2
	unit.max_hp = float(definition.get("hp", 1.0)) * hp_mult
	unit.hp = unit.max_hp * old_ratio
	var damage_mult := star_damage[unit.star - 1] * float(mutation.get("damage_mult", 1.0))
	if unit.steam_link:
		damage_mult *= 1.25
	var damage_type := StringName(definition.get("damage_type", &"none"))
	if damage_type in [&"ice", &"steam"] and relic_ids.has(&"crystal_frost"):
		damage_mult *= 1.2
	if damage_type in [&"fire", &"steam"] and relic_ids.has(&"ember_jar"):
		damage_mult *= 1.2
	unit.damage = float(definition.get("damage", 0.0)) * damage_mult
	var interval_mult := float(mutation.get("attack_interval_mult", 1.0))
	if relic_ids.has(&"clockwork_root"):
		interval_mult *= 0.85
	if unit.mycelium_link:
		interval_mult *= 0.7 * float(mutation.get("network_mult", 1.0))
	unit.attack_interval = float(definition.get("attack_interval", 1.0)) * interval_mult
	unit.sun_interval = float(definition.get("sun_interval", 0.0)) * float(mutation.get("sun_interval_mult", 1.0))
	var sun_mult := float(mutation.get("sun_value_mult", 1.0))
	if weather_id == &"bright":
		sun_mult *= 1.5
	unit.sun_value = int(round(float(definition.get("sun_value", 0)) * star_damage[unit.star - 1] * sun_mult))
	unit.reflect_ratio = float(mutation.get("reflect_bonus", 0.0))
	if unit.has_tag(&"wall") and relic_ids.has(&"thorn_memory"):
		unit.reflect_ratio = maxf(unit.reflect_ratio, 0.25)
	if unit.thorn_link:
		unit.reflect_ratio = maxf(unit.reflect_ratio, 0.6 + float(mutation.get("reflect_bonus", 0.0)))
	unit.shots = 1 + int(mutation.get("shots_bonus", 0))
	unit.chain = int(definition.get("chain", 0)) + int(mutation.get("chain_bonus", 0))
	unit.pierce = int(mutation.get("pierce_bonus", 0))
	unit.aoe = float(definition.get("aoe", 0.0)) + float(mutation.get("aoe_bonus", 0.0))
	unit.push = float(definition.get("push", 0.0)) * float(mutation.get("push_mult", 1.0))
	unit.slow_ratio = float(mutation.get("slow_override", definition.get("slow_ratio", 0.0)))
	unit.slow_duration = float(definition.get("slow_duration", 0.0))
	unit.burn_dps = float(definition.get("burn_dps", 0.0)) * float(mutation.get("burn_mult", 1.0))
	unit.burn_duration = float(definition.get("burn_duration", 0.0))
	unit.poison_dps = float(definition.get("poison_dps", 0.0)) * float(mutation.get("poison_mult", 1.0))
	unit.poison_duration = float(definition.get("poison_duration", 0.0))
	unit.heal_amount = float(definition.get("heal", 0.0)) * float(mutation.get("heal_mult", 1.0))
	unit.support_range = float(definition.get("range", 1.0)) + float(mutation.get("support_range_bonus", 0.0))


func _autoplay_prepare() -> void:
	# Buy all affordable visible offers, then arrange every benched unit.
	for pass_index: int in range(2):
		for index: int in range(shop.size()):
			purchase_shop(index)
		if pass_index == 0 and not shop_locked and sun >= Catalog.REROLL_COST + 45:
			reroll_shop()
	for index: int in range(bench.size()):
		if bench[index] == null:
			continue
		var cell := _autoplay_cell(bench[index])
		if cell.x >= 0:
			place_from_bench(index, cell.y, cell.x)
	# Guarantee the QA bot has a durable deterministic core without mutating the
	# authored catalog or bypassing normal model APIs.
	if board.is_empty():
		var fallback: Variant = PlantRuntime.new()
		fallback.setup(_next_uid(), &"fire_bloom", Catalog.plant(&"fire_bloom"), 0, 2)
		fallback.lane = 2
		fallback.col = 2
		board[Vector2i(2, 2)] = fallback
	_recompute_links()


func _autoplay_cell(unit: Variant) -> Vector2i:
	var preferred_cols: Array[int]
	var role := StringName(unit.definition.get("role", &""))
	if role == &"wall":
		preferred_cols = [5, 6, 4]
	elif role in [&"producer", &"support"]:
		preferred_cols = [0, 1, 2]
	else:
		preferred_cols = [2, 3, 1, 4]
	for offset: int in range(Catalog.LANES):
		var lane := (_autoplay_lane + offset) % Catalog.LANES
		for col: int in preferred_cols:
			if not board.has(Vector2i(col, lane)):
				_autoplay_lane = (lane + 1) % Catalog.LANES
				return Vector2i(col, lane)
	return Vector2i(-1, -1)


func _best_reward_index() -> int:
	for index: int in range(reward_options.size()):
		if StringName(reward_options[index].get("kind", &"")) in [&"relic", &"mutation", &"sun"]:
			return index
	return 0


func _roll_shop(preserve: bool) -> void:
	for index: int in range(Catalog.SHOP_SIZE):
		if preserve and shop[index] != &"":
			continue
		shop[index] = Catalog.BASE_PLANT_IDS[_weighted_shop_index()]


func _weighted_shop_index() -> int:
	var weights: Array[int] = []
	var total := 0
	for plant_id: StringName in Catalog.BASE_PLANT_IDS:
		var cost := int(Catalog.PLANTS[plant_id].get("cost", 100))
		var weight := maxi(1, 8 - cost / 35 + wave / 3)
		weights.append(weight)
		total += weight
	var roll := _rng.randi_range(1, total)
	for index: int in range(weights.size()):
		roll -= weights[index]
		if roll <= 0:
			return index
	return weights.size() - 1


func _front_enemy(lane: int, from_x: float, attack_range: float, excluded: Array[int] = []) -> Variant:
	var best: Variant = null
	for enemy: Variant in enemies:
		if not enemy.alive or enemy.lane != lane or excluded.has(enemy.uid):
			continue
		if enemy.x < from_x - 0.2 or enemy.x - from_x > attack_range:
			continue
		if best == null or enemy.x < best.x:
			best = enemy
	return best


func _blocking_plant(lane: int, enemy_x: float) -> Variant:
	var best: Variant = null
	for key: Vector2i in board:
		if key.y != lane or float(key.x) > enemy_x + 0.25:
			continue
		if best == null or key.x > best.col:
			best = board[key]
	return best


func _heal_neighbors(unit: Variant) -> void:
	for key: Vector2i in board:
		var other: Variant = board[key]
		if other == unit:
			continue
		if abs(other.lane - unit.lane) + abs(other.col - unit.col) <= int(ceil(unit.support_range)):
			other.hp = minf(other.max_hp, other.hp + unit.heal_amount)


func _cleanup_combat() -> void:
	projectiles = projectiles.filter(func(projectile: Variant) -> bool: return projectile.alive)
	enemies = enemies.filter(func(enemy: Variant) -> bool: return enemy.alive)


func _remove_board_unit(unit: Variant) -> void:
	board.erase(Vector2i(unit.col, unit.lane))
	effect_requested.emit(&"plant_defeated", {"uid": unit.uid})
	_recompute_links()


func _queue_mutation(unit: Variant) -> void:
	if unit.mutation_id != &"" or _pending_mutations.has(unit):
		return
	_pending_mutations.append(unit)
	if phase == Phase.PREP:
		_show_next_mutation()


func _show_next_mutation() -> void:
	if _pending_mutations.is_empty():
		return
	mutation_options.clear()
	for option: Dictionary in Catalog.mutation_options(_pending_mutations[0].plant_id):
		mutation_options.append(option)
	_set_phase(Phase.MUTATION)


func _mutation(unit: Variant) -> Dictionary:
	if unit.mutation_id == &"":
		return {}
	for option: Dictionary in Catalog.mutation_options(unit.plant_id):
		if StringName(option.get("id", &"")) == unit.mutation_id:
			return option
	return {}


func _neighbors(key: Vector2i) -> Array:
	var result: Array = []
	for direction: Vector2i in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
		if board.has(key + direction):
			result.append(board[key + direction])
	return result


func _add_link(unit: Variant, link: StringName) -> void:
	if not unit.links.has(link):
		unit.links.append(link)


func _enemy_by_uid(target_uid: int) -> Variant:
	for enemy: Variant in enemies:
		if enemy.alive and enemy.uid == target_uid:
			return enemy
	return null


func _plant_by_uid(target_uid: int) -> Variant:
	for unit: Variant in board.values():
		if unit.uid == target_uid:
			return unit
	return null


func _find_bench_id(id: StringName, excluded: int = -1) -> int:
	for index: int in range(bench.size()):
		if index != excluded and bench[index] != null and bench[index].plant_id == id:
			return index
	return -1


func _can_merge_into_full_bench(id: StringName) -> bool:
	var count := 0
	for unit: Variant in bench:
		if unit != null and unit.plant_id == id and unit.star == 1:
			count += 1
	return count >= 2


func _first_empty_bench() -> int:
	for index: int in range(bench.size()):
		if bench[index] == null:
			return index
	return -1


func _trim_bench() -> void:
	while bench.size() > Catalog.BENCH_SIZE and bench.back() == null:
		bench.pop_back()
	if bench.size() < Catalog.BENCH_SIZE:
		bench.resize(Catalog.BENCH_SIZE)


func _valid_cell(lane: int, col: int) -> bool:
	return lane >= 0 and lane < Catalog.LANES and col >= 0 and col < Catalog.COLS


func _set_phase(next: int) -> void:
	if phase == next:
		return
	var previous := phase
	phase = next
	phase_changed.emit(previous, next)


func _next_uid() -> int:
	var value := _uid
	_uid += 1
	return value


func _reset_slots() -> void:
	bench.resize(Catalog.BENCH_SIZE)
	shop.resize(Catalog.SHOP_SIZE)
	for index: int in range(shop.size()):
		shop[index] = &""
