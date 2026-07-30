class_name GardenEnemyRuntime
extends RefCounted

var uid: int = 0
var enemy_id: StringName = &""
var display_name: String = ""
var definition: Dictionary = {}
var lane: int = 0
var x: float = 7.8
var hp: float = 1.0
var max_hp: float = 1.0
var alive: bool = true
var boss: bool = false
var can_split: bool = true
var slow_ratio: float = 0.0
var slow_remaining: float = 0.0
var burn_dps: float = 0.0
var burn_remaining: float = 0.0
var poison_dps: float = 0.0
var poison_remaining: float = 0.0
var burn_source_uid: int = 0
var poison_source_uid: int = 0
var special_timer: float = 2.0
var attack_timer: float = 0.0
var shield: float = 0.0
var phase: int = 1


func setup(new_uid: int, id: StringName, catalog_entry: Dictionary, spawn_lane: int, spawn_x: float = 7.8) -> void:
	uid = new_uid
	enemy_id = id
	definition = catalog_entry.duplicate(true)
	display_name = String(definition.get("name", String(id)))
	lane = spawn_lane
	x = spawn_x
	max_hp = float(definition.get("hp", 1.0))
	hp = max_hp
	boss = bool(definition.get("boss", false))
	special_timer = 1.5


func snapshot() -> Dictionary:
	return {
		"uid": uid,
		"id": String(enemy_id),
		"name": display_name,
		"lane": lane,
		"x": snappedf(x, 0.001),
		"hp": snappedf(hp, 0.001),
		"max_hp": snappedf(max_hp, 0.001),
		"boss": boss,
		"phase": phase,
	}
