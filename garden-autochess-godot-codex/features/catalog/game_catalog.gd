class_name GardenGameCatalog
extends RefCounted

## Authored, immutable gameplay catalog. Runtime state must duplicate entries
## before mutation; the model never writes back into these dictionaries.

const LANES: int = 5
const COLS: int = 7
const BENCH_SIZE: int = 8
const SHOP_SIZE: int = 5
const TOTAL_WAVES: int = 15
const START_SUN: int = 360
const PREP_SUN: int = 65
const START_DEFENSE_HP: int = 120
const REROLL_COST: int = 10
const SELL_PERCENT: int = 50

const BASE_PLANT_IDS := [
	&"dew_bud", &"fire_bloom", &"frost_bell", &"iron_fruit", &"thorn_vine",
	&"moon_shroom", &"honey_lamp", &"storm_pod", &"acid_moss", &"fan_leaf",
]

const PLANT_IDS := [
	&"dew_bud", &"fire_bloom", &"frost_bell", &"iron_fruit", &"thorn_vine",
	&"moon_shroom", &"honey_lamp", &"storm_pod", &"acid_moss", &"fan_leaf",
	&"steam_lotus", &"eclipse_shroom",
]

const PLANTS := {
	&"dew_bud": {
		"name": "晨露芽", "role": &"producer", "cost": 45, "hp": 90.0,
		"damage": 0.0, "attack_interval": 1.0, "range": 0.0, "damage_type": &"none",
		"sun_interval": 5.5, "sun_value": 22, "tags": [&"sun"],
		"description": "凝结清晨水汽，周期产出阳光。",
	},
	&"fire_bloom": {
		"name": "火绒花", "role": &"shooter", "cost": 120, "hp": 115.0,
		"damage": 26.0, "attack_interval": 1.45, "range": 8.0, "damage_type": &"fire",
		"burn_dps": 7.0, "burn_duration": 3.0, "tags": [&"fire", &"attacker"],
		"description": "抛出火绒弹，并让目标持续灼烧。",
	},
	&"frost_bell": {
		"name": "霜铃草", "role": &"shooter", "cost": 120, "hp": 110.0,
		"damage": 16.0, "attack_interval": 1.55, "range": 8.0, "damage_type": &"ice",
		"slow_ratio": 0.45, "slow_duration": 2.2, "tags": [&"ice", &"attacker"],
		"description": "霜铃命中后显著减缓污染怪物。",
	},
	&"iron_fruit": {
		"name": "铁壳果", "role": &"wall", "cost": 65, "hp": 680.0,
		"damage": 0.0, "attack_interval": 1.0, "range": 0.0, "damage_type": &"none",
		"tags": [&"wall"], "description": "以层叠铁壳阻挡整条路线。",
	},
	&"thorn_vine": {
		"name": "荆棘藤", "role": &"shooter", "cost": 95, "hp": 145.0,
		"damage": 15.0, "attack_interval": 1.35, "range": 5.0, "damage_type": &"physical",
		"tags": [&"vine", &"attacker"], "description": "抽击敌人，并为前方铁壳果织出反伤网。",
	},
	&"moon_shroom": {
		"name": "月影菇", "role": &"shooter", "cost": 105, "hp": 105.0,
		"damage": 13.0, "attack_interval": 1.4, "range": 7.0, "damage_type": &"spore",
		"tags": [&"mushroom", &"attacker"], "description": "三株连通时建立共享攻速的菌丝网络。",
	},
	&"honey_lamp": {
		"name": "蜜灯花", "role": &"support", "cost": 110, "hp": 125.0,
		"damage": 0.0, "attack_interval": 3.2, "range": 1.0, "damage_type": &"none",
		"heal": 28.0, "tags": [&"support"], "description": "周期治疗正交相邻植物。",
	},
	&"storm_pod": {
		"name": "雷荚草", "role": &"shooter", "cost": 165, "hp": 105.0,
		"damage": 19.0, "attack_interval": 1.15, "range": 8.0, "damage_type": &"electric",
		"chain": 3, "tags": [&"electric", &"attacker"], "description": "电弧在同路线多个目标间跳跃。",
	},
	&"acid_moss": {
		"name": "酸囊苔", "role": &"shooter", "cost": 125, "hp": 110.0,
		"damage": 10.0, "attack_interval": 1.3, "range": 7.0, "damage_type": &"acid",
		"poison_dps": 8.0, "poison_duration": 4.0, "tags": [&"acid", &"attacker"],
		"description": "腐蚀孢液造成可持续的污染伤害。",
	},
	&"fan_leaf": {
		"name": "风扇叶", "role": &"shooter", "cost": 145, "hp": 120.0,
		"damage": 18.0, "attack_interval": 1.8, "range": 6.0, "damage_type": &"wind",
		"aoe": 0.8, "push": 0.55, "tags": [&"wind", &"attacker"],
		"description": "扇形气流伤害一簇敌人并将其推远。",
	},
	&"steam_lotus": {
		"name": "蒸汽莲", "role": &"shooter", "cost": 0, "hp": 155.0,
		"damage": 34.0, "attack_interval": 1.75, "range": 8.0, "damage_type": &"steam",
		"aoe": 1.15, "slow_ratio": 0.28, "slow_duration": 1.8,
		"tags": [&"fire", &"ice", &"graft", &"attacker"],
		"description": "火绒花与霜铃草嫁接而成，喷发冰火蒸汽。",
	},
	&"eclipse_shroom": {
		"name": "日蚀菇", "role": &"producer", "cost": 0, "hp": 155.0,
		"damage": 0.0, "attack_interval": 1.0, "range": 0.0, "damage_type": &"none",
		"sun_interval": 7.0, "sun_value": 28, "aura_attack_mult": 0.9,
		"tags": [&"sun", &"mushroom", &"graft"],
		"description": "晨露芽与月影菇嫁接而成，兼顾产能与菌丝支援。",
	},
}

const GRAFT_RECIPES := [
	{"a": &"fire_bloom", "b": &"frost_bell", "result": &"steam_lotus"},
	{"a": &"dew_bud", "b": &"moon_shroom", "result": &"eclipse_shroom"},
]

const MUTATIONS := {
	&"dew_bud": [
		{"id": &"dew_twin", "name": "双露腺", "description": "单次阳光翻倍。", "sun_value_mult": 2.0},
		{"id": &"dew_clock", "name": "晨钟", "description": "产能间隔缩短40%。", "sun_interval_mult": 0.6},
	],
	&"fire_bloom": [
		{"id": &"fire_splash", "name": "燎原花冠", "description": "火弹获得范围爆炸。", "aoe_bonus": 1.0},
		{"id": &"fire_furnace", "name": "恒燃花芯", "description": "灼烧更久更强。", "burn_mult": 1.8},
	],
	&"frost_bell": [
		{"id": &"frost_prison", "name": "霜狱钟摆", "description": "减速提升至75%。", "slow_override": 0.75},
		{"id": &"frost_shatter", "name": "碎晶回响", "description": "对减速目标造成额外伤害。", "damage_mult": 1.55},
	],
	&"iron_fruit": [
		{"id": &"iron_bastion", "name": "重层堡壳", "description": "最大生命提高80%。", "hp_mult": 1.8},
		{"id": &"iron_mirror", "name": "镜棘壳", "description": "自身获得35%反伤。", "reflect_bonus": 0.35},
	],
	&"thorn_vine": [
		{"id": &"vine_barb", "name": "倒钩共生", "description": "联动反伤提高。", "reflect_bonus": 0.35},
		{"id": &"vine_whip", "name": "裂空长鞭", "description": "攻击可贯穿两个目标。", "pierce_bonus": 1},
	],
	&"moon_shroom": [
		{"id": &"moon_web", "name": "深层菌网", "description": "菌丝网络攻速进一步提高。", "network_mult": 0.75},
		{"id": &"moon_echo", "name": "月孢回声", "description": "每次射击额外散出一枚孢子。", "shots_bonus": 1},
	],
	&"honey_lamp": [
		{"id": &"honey_wave", "name": "蜜潮灯", "description": "治疗量与范围提高。", "heal_mult": 1.7, "support_range_bonus": 1.0},
		{"id": &"honey_guard", "name": "琥珀护灯", "description": "治疗同时提供临时护甲。", "hp_mult": 1.35},
	],
	&"storm_pod": [
		{"id": &"storm_fork", "name": "六岔雷荚", "description": "连锁目标增加3个。", "chain_bonus": 3},
		{"id": &"storm_pulse", "name": "脉冲雷心", "description": "攻击间隔缩短40%。", "attack_interval_mult": 0.6},
	],
	&"acid_moss": [
		{"id": &"acid_plague", "name": "蔓延酸雾", "description": "腐蚀攻击获得范围。", "aoe_bonus": 0.9},
		{"id": &"acid_deep", "name": "深蚀囊", "description": "持续伤害翻倍。", "poison_mult": 2.0},
	],
	&"fan_leaf": [
		{"id": &"fan_gale", "name": "回廊狂风", "description": "击退距离翻倍。", "push_mult": 2.0},
		{"id": &"fan_cyclone", "name": "微型气旋", "description": "范围显著扩大。", "aoe_bonus": 1.0},
	],
	&"steam_lotus": [
		{"id": &"steam_pressure", "name": "超压莲蓬", "description": "蒸汽范围与伤害提高。", "damage_mult": 1.5, "aoe_bonus": 0.6},
		{"id": &"steam_condense", "name": "冷凝莲幕", "description": "蒸汽减速提升至60%。", "slow_override": 0.6},
	],
	&"eclipse_shroom": [
		{"id": &"eclipse_harvest", "name": "蚀光丰收", "description": "产能提高80%。", "sun_value_mult": 1.8},
		{"id": &"eclipse_network", "name": "暗月菌环", "description": "自身计作两个菌丝节点。", "network_weight_bonus": 1},
	],
}

const ENEMY_IDS := [
	&"mire_grub", &"rust_mite", &"iron_scavenger", &"fog_spitter",
	&"split_spore", &"hush_stalker", &"mender_carrier", &"hammer_beast",
]

const ENEMIES := {
	&"mire_grub": {"name": "泥壳幼兽", "hp": 78.0, "speed": 0.38, "eat_dps": 22.0, "score": 45, "bounty": 0.16, "breach": 12, "special": &"basic", "armor": {}},
	&"rust_mite": {"name": "锈足螨", "hp": 62.0, "speed": 0.78, "eat_dps": 18.0, "score": 75, "bounty": 0.12, "breach": 10, "special": &"lane_hop", "armor": {&"fire": 1.4, &"ice": 1.5}},
	&"iron_scavenger": {"name": "铁甲拾荒兽", "hp": 360.0, "speed": 0.28, "eat_dps": 32.0, "score": 165, "bounty": 0.24, "breach": 19, "special": &"shield", "armor": {&"physical": 0.5, &"electric": 1.7}},
	&"fog_spitter": {"name": "雾囊喷吐者", "hp": 105.0, "speed": 0.43, "eat_dps": 20.0, "score": 115, "bounty": 0.15, "breach": 13, "special": &"ranged", "attack_range": 2.2, "armor": {&"physical": 0.7, &"fire": 1.35}},
	&"split_spore": {"name": "裂孢兽", "hp": 145.0, "speed": 0.42, "eat_dps": 25.0, "score": 135, "bounty": 0.18, "breach": 15, "special": &"split", "armor": {&"acid": 0.45}},
	&"hush_stalker": {"name": "寂声潜行者", "hp": 120.0, "speed": 0.56, "eat_dps": 28.0, "score": 145, "bounty": 0.18, "breach": 15, "special": &"stealth", "armor": {&"spore": 0.55, &"wind": 1.35}},
	&"mender_carrier": {"name": "愈囊驮兽", "hp": 185.0, "speed": 0.34, "eat_dps": 22.0, "score": 175, "bounty": 0.22, "breach": 17, "special": &"healer", "armor": {&"ice": 0.75}},
	&"hammer_beast": {"name": "嚎锤兽", "hp": 560.0, "speed": 0.24, "eat_dps": 62.0, "score": 255, "bounty": 0.3, "breach": 24, "special": &"smash", "armor": {&"physical": 0.65, &"electric": 1.2}},
}

const BOSSES := {
	&"mire_colossus": {"name": "淤潮巨像", "hp": 2600.0, "speed": 0.18, "eat_dps": 82.0, "score": 1600, "bounty": 1.0, "breach": 55, "special": &"boss_shield_slam", "armor": {&"acid": 0.55, &"fire": 1.25}, "boss": true},
	&"storm_scavenger": {"name": "风暴拾荒者", "hp": 5200.0, "speed": 0.22, "eat_dps": 105.0, "score": 3200, "bounty": 1.0, "breach": 75, "special": &"boss_storm_summon", "armor": {&"electric": 0.55, &"ice": 1.25}, "boss": true},
	&"corrupt_gardener": {"name": "腐化园丁", "hp": 9800.0, "speed": 0.2, "eat_dps": 135.0, "score": 6500, "bounty": 1.0, "breach": 100, "special": &"boss_pollution", "armor": {&"physical": 0.75, &"steam": 1.35}, "boss": true},
}

const RELICS := {
	&"sun_lens": {"name": "聚阳透镜", "description": "每波备战额外获得20阳光。"},
	&"clockwork_root": {"name": "钟根机芯", "description": "全体植物攻击间隔缩短15%。"},
	&"seed_vault": {"name": "种核保险匣", "description": "首次致命突破后恢复45防线。"},
	&"thorn_memory": {"name": "棘忆琥珀", "description": "所有防御植物获得25%反伤。"},
	&"deep_soil": {"name": "深层沃土", "description": "所有植物最大生命提高20%。"},
	&"crystal_frost": {"name": "凝霜晶片", "description": "冰与蒸汽伤害提高20%。"},
	&"ember_jar": {"name": "余火罐", "description": "火与蒸汽伤害提高20%。"},
}

const RELIC_IDS := [&"sun_lens", &"clockwork_root", &"seed_vault", &"thorn_memory", &"deep_soil", &"crystal_frost", &"ember_jar"]

const WEATHERS := {
	&"clear": {"name": "静风", "description": "没有额外规则。"},
	&"bright": {"name": "澄明晴空", "description": "产能植物阳光提高50%。"},
	&"acid_rain": {"name": "净化酸雨", "description": "植物每秒回复少量生命。"},
	&"cold_front": {"name": "寒潮", "description": "所有敌人移动速度降低15%。"},
}

const WAVES := [
	{"label": "泥壳试探", "groups": [{"id": &"mire_grub", "count": 3, "gap": 2.6}]},
	{"label": "锈足疾行", "groups": [{"id": &"mire_grub", "count": 3, "gap": 2.2}, {"id": &"rust_mite", "count": 3, "delay": 3.0, "gap": 1.8}]},
	{"label": "铁甲入园", "groups": [{"id": &"mire_grub", "count": 4, "gap": 2.0}, {"id": &"iron_scavenger", "count": 1, "delay": 4.0}, {"id": &"rust_mite", "count": 2, "delay": 6.0, "gap": 1.7}]},
	{"label": "雾囊与裂孢", "groups": [{"id": &"fog_spitter", "count": 3, "gap": 2.2}, {"id": &"split_spore", "count": 2, "delay": 3.0, "gap": 2.7}, {"id": &"mire_grub", "count": 3, "delay": 5.0, "gap": 1.8}]},
	{"label": "淤潮巨像", "groups": [{"id": &"mire_grub", "count": 4, "gap": 1.8}], "boss": &"mire_colossus"},
	{"label": "潜影迁徙", "groups": [{"id": &"hush_stalker", "count": 4, "gap": 2.0}, {"id": &"rust_mite", "count": 4, "delay": 4.0, "gap": 1.5}]},
	{"label": "愈囊护送", "groups": [{"id": &"mender_carrier", "count": 2, "gap": 4.0}, {"id": &"iron_scavenger", "count": 2, "delay": 2.0, "gap": 3.0}, {"id": &"split_spore", "count": 3, "delay": 5.0, "gap": 2.0}]},
	{"label": "嚎锤压境", "groups": [{"id": &"hammer_beast", "count": 2, "gap": 4.5}, {"id": &"mire_grub", "count": 5, "delay": 2.0, "gap": 1.4}, {"id": &"fog_spitter", "count": 4, "delay": 5.0, "gap": 1.7}]},
	{"label": "混合狩猎群", "groups": [{"id": &"iron_scavenger", "count": 3, "gap": 2.7}, {"id": &"hammer_beast", "count": 1, "delay": 3.0}, {"id": &"hush_stalker", "count": 4, "delay": 5.0, "gap": 1.7}, {"id": &"rust_mite", "count": 3, "delay": 7.0, "gap": 1.4}]},
	{"label": "风暴拾荒者", "groups": [{"id": &"split_spore", "count": 4, "gap": 2.0}, {"id": &"iron_scavenger", "count": 2, "delay": 3.5, "gap": 2.6}], "boss": &"storm_scavenger"},
	{"label": "浓雾围园", "groups": [{"id": &"fog_spitter", "count": 6, "gap": 1.5}, {"id": &"hush_stalker", "count": 4, "delay": 4.0, "gap": 1.7}, {"id": &"hammer_beast", "count": 1, "delay": 7.0}]},
	{"label": "铁甲洪流", "groups": [{"id": &"iron_scavenger", "count": 5, "gap": 2.0}, {"id": &"mender_carrier", "count": 3, "delay": 3.0, "gap": 2.6}, {"id": &"rust_mite", "count": 5, "delay": 5.0, "gap": 1.3}]},
	{"label": "潜影风暴", "groups": [{"id": &"hush_stalker", "count": 7, "gap": 1.25}, {"id": &"hammer_beast", "count": 2, "delay": 3.0, "gap": 4.0}, {"id": &"fog_spitter", "count": 4, "delay": 5.0, "gap": 1.6}]},
	{"label": "终末前奏", "groups": [{"id": &"hammer_beast", "count": 3, "gap": 3.5}, {"id": &"iron_scavenger", "count": 4, "delay": 2.0, "gap": 2.0}, {"id": &"mender_carrier", "count": 4, "delay": 5.0, "gap": 2.1}, {"id": &"split_spore", "count": 4, "delay": 7.0, "gap": 1.7}]},
	{"label": "腐化园丁", "groups": [{"id": &"hammer_beast", "count": 2, "gap": 3.5}, {"id": &"fog_spitter", "count": 4, "delay": 3.0, "gap": 1.6}, {"id": &"hush_stalker", "count": 5, "delay": 5.0, "gap": 1.3}], "boss": &"corrupt_gardener"},
]


static func plant(id: StringName) -> Dictionary:
	return (PLANTS.get(id, {}) as Dictionary).duplicate(true)


static func enemy(id: StringName) -> Dictionary:
	if BOSSES.has(id):
		return (BOSSES[id] as Dictionary).duplicate(true)
	return (ENEMIES.get(id, {}) as Dictionary).duplicate(true)


static func mutation_options(id: StringName) -> Array:
	return (MUTATIONS.get(id, []) as Array).duplicate(true)


static func wave(index: int) -> Dictionary:
	if index < 0 or index >= WAVES.size():
		return {}
	return (WAVES[index] as Dictionary).duplicate(true)
