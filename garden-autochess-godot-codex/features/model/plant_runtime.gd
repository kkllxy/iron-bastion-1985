class_name GardenPlantRuntime
extends RefCounted

var uid: int = 0
var plant_id: StringName = &""
var display_name: String = ""
var star: int = 1
var mutation_id: StringName = &""
var invested_sun: int = 0
var lane: int = -1
var col: int = -1
var definition: Dictionary = {}

var hp: float = 1.0
var max_hp: float = 1.0
var damage: float = 0.0
var attack_interval: float = 1.0
var attack_timer: float = 0.0
var sun_interval: float = 0.0
var sun_timer: float = 0.0
var sun_value: int = 0
var reflect_ratio: float = 0.0
var fertilizer_remaining: float = 0.0
var shots: int = 1
var chain: int = 0
var pierce: int = 0
var aoe: float = 0.0
var push: float = 0.0
var slow_ratio: float = 0.0
var slow_duration: float = 0.0
var burn_dps: float = 0.0
var burn_duration: float = 0.0
var poison_dps: float = 0.0
var poison_duration: float = 0.0
var heal_amount: float = 0.0
var support_range: float = 1.0
var photosynthesis: bool = false
var steam_link: bool = false
var mycelium_link: bool = false
var thorn_link: bool = false
var links: Array[StringName] = []


func setup(new_uid: int, id: StringName, catalog_entry: Dictionary, purchase_value: int, unit_star: int = 1) -> void:
	uid = new_uid
	plant_id = id
	definition = catalog_entry.duplicate(true)
	display_name = String(definition.get("name", String(id)))
	invested_sun = purchase_value
	star = clampi(unit_star, 1, 3)
	max_hp = float(definition.get("hp", 1.0))
	hp = max_hp


func has_tag(tag: StringName) -> bool:
	for value: Variant in definition.get("tags", []):
		if StringName(value) == tag:
			return true
	return false


func snapshot() -> Dictionary:
	return {
		"uid": uid,
		"id": String(plant_id),
		"name": display_name,
		"star": star,
		"mutation_id": String(mutation_id),
		"hp": snappedf(hp, 0.001),
		"max_hp": snappedf(max_hp, 0.001),
		"lane": lane,
		"col": col,
		"links": links.map(func(value: StringName) -> String: return String(value)),
		"fertilizer_remaining": snappedf(fertilizer_remaining, 0.001),
	}
