class_name GardenProjectileRuntime
extends RefCounted

var uid: int = 0
var source_uid: int = 0
var target_uid: int = 0
var lane: int = 0
var x: float = 0.0
var speed: float = 6.5
var damage: float = 0.0
var damage_type: StringName = &"physical"
var aoe: float = 0.0
var push: float = 0.0
var chain: int = 0
var pierce: int = 0
var slow_ratio: float = 0.0
var slow_duration: float = 0.0
var burn_dps: float = 0.0
var burn_duration: float = 0.0
var poison_dps: float = 0.0
var poison_duration: float = 0.0
var alive: bool = true
var hit_uids: Array[int] = []


func snapshot() -> Dictionary:
	return {
		"uid": uid,
		"source_uid": source_uid,
		"target_uid": target_uid,
		"lane": lane,
		"x": snappedf(x, 0.001),
		"damage": snappedf(damage, 0.001),
		"damage_type": String(damage_type),
	}
