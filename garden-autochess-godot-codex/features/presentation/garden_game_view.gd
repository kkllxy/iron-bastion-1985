class_name GardenGameView
extends Control

const Palette := preload("res://common/visual_palette.gd")
const ChineseFont := preload("res://assets/fonts/NotoSansSC-Variable.ttf")
const LANES := 5
const COLS := 7

var _model: RefCounted
var _state: Dictionary = {}
var _font: Font
var _board_rect := Rect2()
var _shop_rects: Array[Rect2] = []
var _bench_rects: Array[Rect2] = []
var _button_rects: Dictionary = {}
var _drag := {}
var _press_position := Vector2.ZERO
var _selected_bench := -1
var _effects: Array[Dictionary] = []
var _muted := false


func set_model(value: RefCounted) -> void:
	if _model != null:
		_disconnect_model()
	_model = value
	if _model != null:
		if _model.has_signal(&"state_changed"):
			_model.connect(&"state_changed", Callable(self, "_on_state_changed"))
		if _model.has_signal(&"effect_requested"):
			_model.connect(&"effect_requested", Callable(self, "_on_effect_requested"))
	_refresh_state()


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	process_mode = Node.PROCESS_MODE_ALWAYS
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	_font = ChineseFont
	_refresh_state()
	queue_redraw()


func _process(delta: float) -> void:
	_refresh_state()
	for effect in _effects:
		effect["age"] = float(effect.get("age", 0.0)) + delta
	_effects = _effects.filter(func(effect: Dictionary) -> bool: return float(effect.get("age", 0.0)) < 0.7)
	queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()


func _draw() -> void:
	var viewport_size := size
	if viewport_size.x < 2.0 or viewport_size.y < 2.0:
		return
	_button_rects.clear()
	_shop_rects.clear()
	_bench_rects.clear()
	draw_rect(Rect2(Vector2.ZERO, viewport_size), Palette.VOID)
	_draw_world_backdrop(viewport_size)
	var mobile := viewport_size.x < 720.0
	var top_height := 78.0 if mobile else 86.0
	var phase := _phase_text()
	var show_prep := String(_state.get("phase", "start")) == "prep"
	var prep_height := (238.0 if mobile else 190.0) if show_prep else 18.0
	_board_rect = Rect2(12.0, top_height, viewport_size.x - 24.0, maxf(190.0, viewport_size.y - top_height - prep_height - 8.0))
	_draw_board(_board_rect)
	_draw_links_and_units(_board_rect)
	_draw_hud(Rect2(8.0, 8.0, viewport_size.x - 16.0, top_height - 12.0), mobile)
	if show_prep:
		_draw_prep(Rect2(6.0, viewport_size.y - prep_height, viewport_size.x - 12.0, prep_height - 6.0), mobile)
	_draw_overlay(viewport_size)
	_draw_drag_preview()


func _draw_world_backdrop(viewport_size: Vector2) -> void:
	for index in range(9):
		var x := viewport_size.x * float(index) / 8.0
		var height := 22.0 + float((index * 19) % 43)
		draw_rect(Rect2(x - 8.0, viewport_size.y * 0.18 - height, 16.0, height), Palette.with_alpha(Palette.OLIVE, 0.22))
	for index in range(7):
		var p := Vector2(viewport_size.x * (0.08 + index * 0.15), viewport_size.y * 0.22)
		draw_circle(p, 25.0 + float(index % 3) * 8.0, Palette.with_alpha(Palette.SPORE, 0.09))


func _draw_hud(rect: Rect2, mobile: bool) -> void:
	var gap := 6.0
	var card_height := rect.size.y
	var widths := [98.0, 150.0, 118.0, 110.0]
	if mobile:
		widths = [82.0, maxf(102.0, rect.size.x - 244.0), 82.0, 56.0]
	var x := rect.position.x
	_draw_panel(Rect2(x, rect.position.y, widths[0], card_height), Palette.SUN)
	_text("阳光", Vector2(x + 10.0, rect.position.y + 18.0), 11, Palette.INK_DIM)
	_text(str(int(_state.get("sun", 0))), Vector2(x + 10.0, rect.position.y + 45.0), 24, Palette.SUN)
	x += widths[0] + gap
	_draw_panel(Rect2(x, rect.position.y, widths[1], card_height), Palette.LIFE)
	_text_center("波次  %d / %d" % [int(_state.get("wave", 1)), int(_state.get("max_wave", 15))], Rect2(x, rect.position.y + 8.0, widths[1], 24.0), 15, Palette.INK)
	_text_center(_phase_text(), Rect2(x, rect.position.y + 34.0, widths[1], 22.0), 12, Palette.LIFE)
	x += widths[1] + gap
	_draw_panel(Rect2(x, rect.position.y, widths[2], card_height), Palette.LIFE)
	_text("防线血量", Vector2(x + 9.0, rect.position.y + 18.0), 11, Palette.INK_DIM)
	var hp := float(_state.get("defense_hp", 0.0))
	var max_hp := maxf(1.0, float(_state.get("max_defense_hp", 100.0)))
	draw_rect(Rect2(x + 9.0, rect.position.y + 30.0, widths[2] - 18.0, 9.0), Palette.OUTLINE)
	draw_rect(Rect2(x + 9.0, rect.position.y + 30.0, (widths[2] - 18.0) * clampf(hp / max_hp, 0.0, 1.0), 9.0), Palette.LIFE)
	_text("%d / %d" % [int(hp), int(max_hp)], Vector2(x + 9.0, rect.position.y + 56.0), 12, Palette.INK)
	x += widths[2] + gap
	var control_width := maxf(52.0, rect.end.x - x)
	var half := (control_width - gap) * 0.5
	var mute_rect := Rect2(x, rect.position.y, half, card_height)
	var pause_rect := Rect2(x + half + gap, rect.position.y, half, card_height)
	_draw_panel(mute_rect, Palette.OLIVE_LIGHT)
	_draw_panel(pause_rect, Palette.OLIVE_LIGHT)
	_text_center("静音" if _muted else "声音", mute_rect, 12, Palette.INK)
	_text_center("暂停", pause_rect, 12, Palette.INK)
	_button_rects[&"mute"] = mute_rect
	_button_rects[&"pause"] = pause_rect


func _draw_board(rect: Rect2) -> void:
	draw_rect(rect, Palette.with_alpha(Palette.CHARCOAL, 0.93))
	var corners := PackedVector2Array([rect.position + Vector2(8, 8), Vector2(rect.end.x - 8, rect.position.y + 8), rect.end - Vector2(8, 8), Vector2(rect.position.x + 8, rect.end.y - 8)])
	draw_polyline(corners, Palette.with_alpha(Palette.LIFE, 0.35), 2.0)
	for lane in range(LANES):
		for col in range(COLS):
			var poly := _cell_polygon(lane, col)
			var color := Palette.GRID_LIGHT if (lane + col) % 2 == 0 else Palette.GRID_DARK
			draw_colored_polygon(poly, color)
			draw_polyline(PackedVector2Array([poly[0], poly[1], poly[2], poly[3], poly[0]]), Palette.with_alpha(Palette.LIFE, 0.14), 1.2)
	_text("生命温室", rect.position + Vector2(14, 24), 12, Palette.LIFE)
	_text("污染边界", Vector2(rect.end.x - 76, rect.position.y + 24), 12, Palette.RUST)


func _cell_polygon(lane: int, col: int) -> PackedVector2Array:
	var pad := 22.0
	var skew := minf(24.0, _board_rect.size.x * 0.025)
	var usable_width := _board_rect.size.x - pad * 2.0 - skew * float(LANES)
	var cell_width := usable_width / float(COLS)
	var cell_height := (_board_rect.size.y - pad * 2.0) / float(LANES)
	var p := _board_rect.position + Vector2(pad + float(lane) * skew + float(col) * cell_width, pad + float(lane) * cell_height)
	return PackedVector2Array([p, p + Vector2(cell_width - 3.0, 0), p + Vector2(cell_width + skew - 3.0, cell_height - 3.0), p + Vector2(skew, cell_height - 3.0)])


func _cell_center(lane: int, col: int) -> Vector2:
	var poly := _cell_polygon(lane, col)
	var result := Vector2.ZERO
	for point in poly:
		result += point
	return result / 4.0


func _draw_links_and_units(_rect: Rect2) -> void:
	var links_value: Variant = _state.get("links", {})
	if links_value is Dictionary:
		var link_map: Dictionary = links_value
		for raw_key: Variant in link_map:
			var coord := _coord_from_variant(String(raw_key))
			var tags: Variant = link_map[raw_key]
			if coord.x >= 0 and tags is Array and not tags.is_empty():
				draw_arc(_cell_center(coord.x, coord.y), 34.0, 0.0, TAU, 24, Palette.with_alpha(Palette.SUN, 0.55), 2.0)
	elif links_value is Array:
		for raw_link: Variant in links_value:
			if raw_link is Dictionary:
				var link: Dictionary = raw_link
				var from := _coord_from_variant(link.get("from", {}))
				var to := _coord_from_variant(link.get("to", {}))
				if from.x >= 0 and to.x >= 0:
					draw_dashed_line(_cell_center(from.x, from.y), _cell_center(to.x, to.y), Palette.SUN, 2.0, 7.0)
	var board: Dictionary = _state.get("board", {})
	for key in board:
		var unit_value: Variant = board[key]
		if not unit_value is Dictionary:
			continue
		var parts: PackedStringArray = String(key).split(":")
		if parts.size() != 2:
			continue
		var lane := int(parts[0])
		var col := int(parts[1])
		_draw_plant(_cell_center(lane, col), unit_value, minf(30.0, _board_rect.size.y / 13.0))
	var enemies: Array = _state.get("enemies", [])
	for raw_enemy in enemies:
		if raw_enemy is Dictionary:
			var enemy: Dictionary = raw_enemy
			var lane := clampi(int(enemy.get("lane", 0)), 0, LANES - 1)
			var col_value := float(enemy.get("col", enemy.get("x", 6.4)))
			var from := _cell_center(lane, 0)
			var to := _cell_center(lane, COLS - 1)
			var pos := from.lerp(to, clampf(col_value / 6.0, 0.0, 1.14))
			_draw_enemy(pos, enemy, minf(29.0, _board_rect.size.y / 13.0))
	var projectiles: Array = _state.get("projectiles", [])
	for raw_projectile in projectiles:
		if raw_projectile is Dictionary:
			var projectile: Dictionary = raw_projectile
			var lane := clampi(int(projectile.get("lane", 0)), 0, LANES - 1)
			var progress := clampf(float(projectile.get("col", projectile.get("x", 0.0))) / 6.0, 0.0, 1.15)
			var pos := _cell_center(lane, 0).lerp(_cell_center(lane, COLS - 1), progress)
			draw_circle(pos, 5.0, Palette.STEAM)
			draw_line(pos - Vector2(16, 0), pos, Palette.with_alpha(Palette.STEAM, 0.45), 3.0)
	for effect in _effects:
		var payload: Dictionary = effect.get("payload", {})
		var lane := clampi(int(payload.get("lane", 0)), 0, LANES - 1)
		var col := clampi(int(payload.get("col", 0)), 0, COLS - 1)
		var age := float(effect.get("age", 0.0))
		draw_arc(_cell_center(lane, col), 12.0 + age * 42.0, 0.0, TAU, 24, Palette.with_alpha(Palette.SUN, 1.0 - age / 0.7), 3.0)


func _draw_plant(pos: Vector2, unit: Dictionary, radius: float) -> void:
	var id := StringName(unit.get("id", unit.get("plant_id", "unknown")))
	var color := Palette.plant_color(id)
	draw_circle(pos + Vector2(0, radius * 0.5), radius * 0.7, Palette.OUTLINE)
	draw_rect(Rect2(pos + Vector2(-radius * 0.48, radius * 0.30), Vector2(radius * 0.96, radius * 0.48)), Color("6b4930"))
	match String(id):
		"dew_bud":
			for angle in [0.0, 2.1, 4.2]: draw_circle(pos + Vector2.from_angle(angle) * radius * 0.58, radius * 0.34, color)
			draw_circle(pos, radius * 0.42, Palette.SUN)
		"fire_bloom":
			_draw_flame(pos, radius, color)
		"frost_bell", "frostfern":
			var points := PackedVector2Array([pos + Vector2(0, -radius), pos + Vector2(radius * 0.72, radius * 0.55), pos + Vector2(0, radius * 0.25), pos + Vector2(-radius * 0.72, radius * 0.55)])
			draw_colored_polygon(points, color)
		"iron_fruit":
			draw_colored_polygon(_regular_polygon(pos, radius, 6), color)
			draw_arc(pos, radius * 0.55, PI, TAU, 12, Palette.INK_DIM, 4.0)
		"thorn_vine", "razorvine":
			draw_arc(pos, radius * 0.74, -PI * 0.8, PI * 1.1, 20, color, 7.0)
			for angle in [-1.7, -0.6, 0.5]: draw_colored_polygon(_regular_polygon(pos + Vector2.from_angle(angle) * radius * 0.72, radius * 0.22, 3), Palette.LIFE_BRIGHT)
		"moon_shroom":
			draw_circle(pos + Vector2(0, -radius * 0.18), radius * 0.72, color)
			draw_circle(pos + Vector2(radius * 0.28, -radius * 0.35), radius * 0.62, Palette.CHARCOAL)
		"honey_lamp":
			draw_colored_polygon(_regular_polygon(pos, radius * 0.72, 6), color)
			draw_circle(pos, radius * 0.27, Palette.SUN)
		"storm_pod":
			draw_polyline(PackedVector2Array([pos + Vector2(-radius * .45, -radius), pos + Vector2(radius * .1, -radius * .2), pos + Vector2(-radius * .1, radius * .15), pos + Vector2(radius * .5, radius)]), color, 8.0)
		"acid_moss":
			draw_circle(pos, radius * 0.74, color)
			draw_circle(pos + Vector2(radius * .2, radius * .16), radius * .26, Palette.POISON)
		"fan_leaf":
			for angle in [-2.6, -2.0, -1.4, -0.8, -0.2]: draw_colored_polygon(_regular_polygon(pos + Vector2.from_angle(angle) * radius * .45, radius * .52, 5), color)
		"steam_lotus":
			for angle in range(0, 6): draw_colored_polygon(_regular_polygon(pos + Vector2.from_angle(float(angle) * TAU / 6.0) * radius * .48, radius * .45, 5), color)
			draw_circle(pos, radius * .28, Palette.ICE)
		"eclipse_shroom":
			draw_arc(pos, radius * .68, 0, TAU, 24, color, radius * .42)
			draw_circle(pos + Vector2(radius * .28, -radius * .18), radius * .44, Palette.CHARCOAL)
		_:
			draw_circle(pos, radius * .72, color)
	var star := clampi(int(unit.get("star", 1)), 1, 3)
	for index in range(star):
		draw_circle(pos + Vector2((float(index) - float(star - 1) * .5) * 10.0, -radius - 7.0), 3.2, Palette.SUN)


func _draw_enemy(pos: Vector2, enemy: Dictionary, radius: float) -> void:
	var id := StringName(enemy.get("id", enemy.get("enemy_id", "unknown")))
	var boss := bool(enemy.get("boss", enemy.get("is_boss", false)))
	var color := Palette.enemy_color(id, boss)
	var sides := 8 if boss else 6
	draw_colored_polygon(_regular_polygon(pos, radius * (1.3 if boss else 0.9), sides), Palette.OUTLINE)
	draw_colored_polygon(_regular_polygon(pos, radius * (1.15 if boss else 0.78), sides), color)
	match String(id):
		"rust_mite":
			for side in [-1, 1]: draw_line(pos, pos + Vector2(side * radius, radius * .8), Palette.RUST, 4.0)
		"iron_scavenger": draw_arc(pos, radius * .65, 0, TAU, 18, Palette.INK_DIM, 5.0)
		"fog_spitter":
			for index in range(3): draw_circle(pos + Vector2(index * 8 - 8, -radius * .55), radius * .35, Palette.with_alpha(Palette.SPORE, .45))
		"split_spore":
			for angle in range(0, 6): draw_circle(pos + Vector2.from_angle(float(angle)) * radius * .62, radius * .16, Palette.POISON)
		"hush_stalker":
			draw_colored_polygon(_regular_polygon(pos + Vector2(0, -radius * .85), radius * .32, 3), Palette.RUST)
		"hammer_beast": draw_rect(Rect2(pos - Vector2(radius * .6, radius * .15), Vector2(radius * 1.2, radius * .3)), Palette.INK_DIM)
		"mender_carrier": draw_arc(pos, radius, -PI * .8, -PI * .2, 12, Palette.DANGER, 4.0)
		_:
			pass
	for eye_x in [-0.28, 0.28]:
		draw_circle(pos + Vector2(radius * eye_x, -radius * .1), radius * .14, Palette.INK)
		draw_circle(pos + Vector2(radius * eye_x, -radius * .1), radius * .06, Palette.OUTLINE)
	if boss:
		draw_colored_polygon(PackedVector2Array([pos + Vector2(-radius, -radius), pos + Vector2(-radius * .4, -radius * 1.7), pos, pos + Vector2(radius * .4, -radius * 1.7), pos + Vector2(radius, -radius)]), Palette.RUST)


func _draw_prep(rect: Rect2, mobile: bool) -> void:
	_draw_panel(rect, Palette.LIFE)
	_text("种子商店", rect.position + Vector2(12, 19), 13, Palette.LIFE)
	var shop: Array = _state.get("shop", [])
	var gap := 5.0
	var card_y := rect.position.y + 26.0
	var card_height := 66.0
	var card_width := (rect.size.x - 24.0 - gap * 4.0) / 5.0
	for index in range(5):
		var card := Rect2(rect.position.x + 12.0 + float(index) * (card_width + gap), card_y, card_width, card_height)
		_shop_rects.append(card)
		_draw_panel(card, Palette.OLIVE_LIGHT)
		var item: Dictionary = shop[index] if index < shop.size() and shop[index] is Dictionary else {}
		var name := String(item.get("name", "空槽"))
		var cost := int(item.get("cost", 0))
		var id := StringName(item.get("id", item.get("plant_id", "")))
		draw_circle(card.position + Vector2(18, 26), 12.0, Palette.plant_color(id))
		_text(name, card.position + Vector2(35, 22), 11 if mobile else 13, Palette.INK, maxf(20.0, card.size.x - 40.0))
		_text("%d 阳光" % cost, card.position + Vector2(35, 45), 10, Palette.SUN)
	_text("培育台", rect.position + Vector2(12, 112), 12, Palette.INK_DIM)
	var bench: Array = _state.get("bench", [])
	var bench_y := rect.position.y + 99.0
	var bench_size := 48.0
	var bench_gap := 5.0
	if mobile:
		bench_size = minf(48.0, (rect.size.x - 24.0 - bench_gap * 7.0) / 8.0)
	for index in range(8):
		var slot := Rect2(rect.position.x + 72.0 + float(index) * (bench_size + bench_gap), bench_y, bench_size, 48.0)
		if slot.end.x > rect.end.x - 8.0:
			slot.position.x = rect.position.x + 12.0 + float(index) * ((rect.size.x - 24.0) / 8.0)
			slot.size.x = (rect.size.x - 24.0) / 8.0 - 3.0
		_bench_rects.append(slot)
		draw_rect(slot, Palette.PANEL_SOFT if index == _selected_bench else Palette.CHARCOAL)
		draw_rect(slot, Palette.SUN if index == _selected_bench else Palette.with_alpha(Palette.LIFE, .3), false, 2.0)
		if index < bench.size() and bench[index] is Dictionary:
			var unit: Dictionary = bench[index]
			draw_circle(slot.get_center(), 12.0, Palette.plant_color(StringName(unit.get("id", unit.get("plant_id", "")))))
			_text_center("★".repeat(int(unit.get("star", 1))), Rect2(slot.position.x, slot.end.y - 15.0, slot.size.x, 13.0), 9, Palette.SUN)
	var actions_y := rect.end.y - 54.0
	var labels := {&"reroll": "刷新 R", &"lock": "解锁 L" if bool(_state.get("shop_locked", false)) else "锁定 L", &"sell": "出售", &"shovel": "铲子 Q", &"fertilizer": "肥料 E", &"start": "开始本波"}
	var order := [&"reroll", &"lock", &"sell", &"shovel", &"fertilizer", &"start"]
	var total_gap := 5.0 * float(order.size() - 1)
	var button_width := (rect.size.x - 24.0 - total_gap) / float(order.size())
	for index in range(order.size()):
		var key: StringName = order[index]
		var button := Rect2(rect.position.x + 12.0 + float(index) * (button_width + 5.0), actions_y, button_width, 48.0)
		_button_rects[key] = button
		_draw_panel(button, Palette.LIFE if key == &"start" else Palette.OLIVE_LIGHT)
		_text_center(labels[key], button, 10 if mobile else 12, Palette.INK)


func _draw_overlay(viewport_size: Vector2) -> void:
	var phase := _phase_text()
	var options: Array = _state.get("reward_options", [])
	var mutation: Variant = _state.get("pending_mutation", null)
	if phase.contains("奖励") or not options.is_empty():
		_draw_choice_overlay(viewport_size, "选择一项花园强化", options, &"reward")
		return
	var mutation_pending := mutation is Dictionary and not (mutation as Dictionary).is_empty()
	if phase.contains("变异") or mutation_pending:
		var mutations: Array = _state.get("mutation_options", [])
		_draw_choice_overlay(viewport_size, "选择三星变异方向", mutations, &"mutation")
		return
	var title := ""
	var copy := ""
	var action := ""
	if phase.contains("标题") or phase.contains("开始"):
		title = "末日花园自走棋"
		copy = "买种、摆阵、合成，让原创变异植物守住十五波污染浪潮。"
		action = "开始守园"
	elif phase.contains("暂停"):
		title = "花园暂停"
		copy = "检查阵容与联动，准备好后继续。"
		action = "继续"
	elif phase.contains("失败"):
		title = "防线失守"
		copy = "污染突破了温室。重新规划相邻关系，再试一次。"
		action = "重新播种"
	elif phase.contains("通关") or phase.contains("胜利"):
		title = "花园重燃"
		copy = "十五波污染已经肃清，最后的绿地迎来黎明。"
		action = "再守一局"
	if title.is_empty():
		return
	draw_rect(Rect2(Vector2.ZERO, viewport_size), Palette.with_alpha(Palette.VOID, .84))
	var card := Rect2(viewport_size * .5 - Vector2(minf(250.0, viewport_size.x * .43), 135.0), Vector2(minf(500.0, viewport_size.x * .86), 270.0))
	_draw_panel(card, Palette.LIFE)
	_text_center(title, Rect2(card.position + Vector2(15, 36), Vector2(card.size.x - 30, 50)), 30, Palette.INK)
	_text_center(copy, Rect2(card.position + Vector2(26, 102), Vector2(card.size.x - 52, 50)), 13, Palette.INK_DIM)
	var button := Rect2(card.position + Vector2(card.size.x * .5 - 75, 178), Vector2(150, 50))
	_draw_panel(button, Palette.LIFE)
	_text_center(action, button, 15, Palette.INK)
	_button_rects[&"modal"] = button


func _draw_choice_overlay(viewport_size: Vector2, title: String, options: Array, kind: StringName) -> void:
	draw_rect(Rect2(Vector2.ZERO, viewport_size), Palette.with_alpha(Palette.VOID, .88))
	_text_center(title, Rect2(20, viewport_size.y * .16, viewport_size.x - 40, 48), 26, Palette.INK)
	var count := maxi(1, mini(3, options.size()))
	var vertical := viewport_size.x < 620.0
	var card_width := minf(230.0, viewport_size.x - 36.0) if vertical else minf(250.0, (viewport_size.x - 56.0) / float(count))
	var card_height := 122.0 if vertical else 210.0
	for index in range(count):
		var x := viewport_size.x * .5 - card_width * .5 if vertical else viewport_size.x * .5 - (card_width * count + 12.0 * (count - 1)) * .5 + float(index) * (card_width + 12.0)
		var y := viewport_size.y * .26 + float(index) * (card_height + 8.0) if vertical else viewport_size.y * .31
		var card := Rect2(x, y, card_width, card_height)
		_draw_panel(card, Palette.SPORE if kind == &"mutation" else Palette.LIFE)
		var option: Dictionary = options[index] if index < options.size() and options[index] is Dictionary else {}
		_text_center(String(option.get("name", "未知强化")), Rect2(card.position + Vector2(8, 20), Vector2(card.size.x - 16, 30)), 17, Palette.INK)
		_text_center(String(option.get("description", option.get("desc", "改变本局构筑方向"))), Rect2(card.position + Vector2(12, 58), Vector2(card.size.x - 24, card.size.y - 65)), 12, Palette.INK_DIM)
		_button_rects[StringName("%s_%d" % [kind, index])] = card


func _draw_drag_preview() -> void:
	if _drag.is_empty():
		return
	draw_circle(get_local_mouse_position() + Vector2(18, -18), 20.0, Palette.with_alpha(Palette.SUN, .82))
	draw_arc(get_local_mouse_position() + Vector2(18, -18), 25.0, 0, TAU, 20, Palette.LIFE_BRIGHT, 2.0)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_pointer_pressed(event.position)
		else:
			_pointer_released(event.position)
		accept_event()
	elif event is InputEventMouseMotion and not _drag.is_empty():
		queue_redraw()
		accept_event()
	elif event is InputEventScreenTouch:
		if event.pressed:
			_pointer_pressed(event.position)
		else:
			_pointer_released(event.position)
		accept_event()
	elif event is InputEventScreenDrag:
		queue_redraw()
		accept_event()


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"reroll"): _request(&"reroll")
	elif event.is_action(&"toggle_lock"): _request(&"lock")
	elif event.is_action(&"tool_shovel"): _request(&"select_shovel")
	elif event.is_action(&"tool_fertilizer"): _request(&"select_fertilizer")
	elif event.is_action(&"start_wave"): _request(&"start")
	elif event.is_action(&"toggle_pause"): _request(&"pause")
	else:
		for index in range(5):
			if event.is_action(StringName("buy_%d" % (index + 1))):
				_request(&"purchase", [index])
				break


func _pointer_pressed(position: Vector2) -> void:
	grab_focus()
	_press_position = position
	for index in range(_bench_rects.size()):
		if _bench_rects[index].has_point(position):
			_selected_bench = index
			_drag = {"kind": &"bench", "index": index}
			return
	var cell := _cell_at(position)
	if cell.x >= 0:
		var board: Dictionary = _state.get("board", {})
		if board.has("%d:%d" % [int(cell.x), int(cell.y)]):
			_drag = {"kind": &"board", "lane": int(cell.x), "col": int(cell.y)}


func _pointer_released(position: Vector2) -> void:
	var distance := position.distance_to(_press_position)
	if not _drag.is_empty():
		var target := _cell_at(position)
		if target.x >= 0 and distance > 6.0:
			if _drag.get("kind") == &"bench": _request(&"place", [int(_drag["index"]), int(target.x), int(target.y)])
			else: _request(&"move", [int(_drag["lane"]), int(_drag["col"]), int(target.x), int(target.y)])
		_drag.clear()
		queue_redraw()
		if distance > 6.0:
			return
	_drag.clear()
	for key in _button_rects:
		if (_button_rects[key] as Rect2).has_point(position):
			_handle_button(StringName(key))
			return
	for index in range(_shop_rects.size()):
		if _shop_rects[index].has_point(position):
			_request(&"purchase", [index])
			return
	var cell := _cell_at(position)
	if cell.x >= 0:
		var tool := String(_state.get("selected_tool", ""))
		if tool.contains("铲") or tool == "shovel": _request(&"shovel", [int(cell.x), int(cell.y)])
		elif tool.contains("肥") or tool == "fertilizer": _request(&"fertilizer", [int(cell.x), int(cell.y)])


func _handle_button(key: StringName) -> void:
	var text := String(key)
	if text.begins_with("reward_"): _request(&"reward", [int(text.get_slice("_", 1))]); return
	if text.begins_with("mutation_"): _request(&"mutation", [int(text.get_slice("_", 1))]); return
	match key:
		&"mute":
			_muted = not _muted
			GlobalSignalBus.settings_changed.emit(false, _muted)
		&"pause": _request(&"pause")
		&"reroll": _request(&"reroll")
		&"lock": _request(&"lock")
		&"sell":
			if _selected_bench >= 0: _request(&"sell", [_selected_bench])
		&"shovel": _request(&"select_shovel")
		&"fertilizer": _request(&"select_fertilizer")
		&"start": _request(&"start")
		&"modal":
			if _phase_text().contains("暂停"): _request(&"pause")
			else: _request(&"new_run", [1985])


func _request(action: StringName, args: Array = []) -> Variant:
	if _model == null:
		return null
	var methods := {
		&"new_run": &"new_run", &"purchase": &"purchase_shop", &"reroll": &"reroll_shop",
		&"lock": &"toggle_shop_lock", &"place": &"place_from_bench", &"move": &"move_board",
		&"sell": &"sell_bench", &"start": &"start_wave", &"reward": &"choose_reward",
		&"mutation": &"choose_mutation", &"fertilizer": &"use_fertilizer", &"shovel": &"use_shovel",
		&"pause": &"toggle_pause"
	}
	if action == &"select_shovel" or action == &"select_fertilizer":
		var tool := &"shovel" if action == &"select_shovel" else &"fertilizer"
		if _model.has_method(&"select_tool"):
			return _model.call(&"select_tool", tool)
		return null
	var method: StringName = methods.get(action, action)
	if _model.has_method(method):
		return _model.callv(method, args)
	return null


func _refresh_state() -> void:
	if _model == null or not _model.has_method(&"snapshot"):
		return
	var value: Variant = _model.call(&"snapshot")
	if value is Dictionary:
		_state = value
	elif value is String:
		var parsed: Variant = JSON.parse_string(value)
		if parsed is Dictionary: _state = parsed


func _phase_text() -> String:
	match String(_state.get("phase", "start")):
		"start": return "开始界面"
		"prep": return "备战阶段"
		"battle": return "自动战斗"
		"reward": return "奖励选择"
		"mutation": return "变异选择"
		"paused": return "花园暂停"
		"victory": return "守园胜利"
		"game_over": return "防线失败"
		_: return "花园状态"


func _cell_at(position: Vector2) -> Vector2i:
	for lane in range(LANES):
		for col in range(COLS):
			if Geometry2D.is_point_in_polygon(position, _cell_polygon(lane, col)):
				return Vector2i(lane, col)
	return Vector2i(-1, -1)


func _coord_from_variant(value: Variant) -> Vector2i:
	if value is Dictionary:
		return Vector2i(int(value.get("lane", -1)), int(value.get("col", -1)))
	if value is String:
		var parts: PackedStringArray = String(value).split(":")
		if parts.size() == 2: return Vector2i(int(parts[0]), int(parts[1]))
	return Vector2i(-1, -1)


func _regular_polygon(center: Vector2, radius: float, sides: int) -> PackedVector2Array:
	var result := PackedVector2Array()
	for index in range(sides):
		result.append(center + Vector2.from_angle(-PI * .5 + float(index) * TAU / float(sides)) * radius)
	return result


func _draw_flame(center: Vector2, radius: float, color: Color) -> void:
	draw_colored_polygon(PackedVector2Array([center + Vector2(-radius * .7, radius), center + Vector2(-radius * .35, -radius * .1), center + Vector2(0, -radius), center + Vector2(radius * .25, -radius * .2), center + Vector2(radius * .72, radius)]), color)
	draw_circle(center + Vector2(0, radius * .35), radius * .3, Palette.SUN)


func _draw_panel(rect: Rect2, accent: Color) -> void:
	draw_rect(rect, Palette.with_alpha(Palette.PANEL, .96))
	draw_rect(rect, Palette.with_alpha(accent, .45), false, 1.5)


func _text(value: String, position: Vector2, font_size: int, color: Color, width: float = -1.0) -> void:
	draw_string(_font if _font != null else ThemeDB.fallback_font, position, value, HORIZONTAL_ALIGNMENT_LEFT, width, font_size, color)


func _text_center(value: String, rect: Rect2, font_size: int, color: Color) -> void:
	var active_font := _font if _font != null else ThemeDB.fallback_font
	var text_size := active_font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var position := rect.get_center() - Vector2(text_size.x * .5, -text_size.y * .34)
	draw_string(active_font, position, value, HORIZONTAL_ALIGNMENT_LEFT, rect.size.x, font_size, color)


func _on_state_changed(_reason: StringName) -> void:
	_refresh_state()
	queue_redraw()


func _on_effect_requested(kind: StringName, payload: Dictionary) -> void:
	_effects.append({"kind": kind, "payload": payload.duplicate(true), "age": 0.0})


func _disconnect_model() -> void:
	if _model.has_signal(&"state_changed") and _model.is_connected(&"state_changed", Callable(self, "_on_state_changed")):
		_model.disconnect(&"state_changed", Callable(self, "_on_state_changed"))
	if _model.has_signal(&"effect_requested") and _model.is_connected(&"effect_requested", Callable(self, "_on_effect_requested")):
		_model.disconnect(&"effect_requested", Callable(self, "_on_effect_requested"))
