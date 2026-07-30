class_name GardenVisualPalette
extends RefCounted

const VOID := Color("07100d")
const CHARCOAL := Color("101b16")
const PANEL := Color("17251d")
const PANEL_SOFT := Color("213126")
const OLIVE := Color("56613b")
const OLIVE_LIGHT := Color("718052")
const GRID_DARK := Color("253922")
const GRID_LIGHT := Color("31492a")
const LIFE := Color("cbe66b")
const LIFE_BRIGHT := Color("edff9a")
const SUN := Color("ffd45d")
const RUST := Color("e9773d")
const DANGER := Color("ee6048")
const ICE := Color("75d7e8")
const POISON := Color("a5cc54")
const ARC := Color("f5e463")
const SPORE := Color("c387db")
const STEAM := Color("d7f3ed")
const INK := Color("f3f1df")
const INK_DIM := Color("aeb9a6")
const OUTLINE := Color("0a120e")


static func plant_color(plant_id: StringName) -> Color:
	match String(plant_id):
		"dew_bud", "晨露芽": return SUN
		"fire_bloom", "火绒花": return RUST
		"frost_bell", "frostfern", "霜铃草": return ICE
		"iron_fruit", "铁壳果": return Color("b89a67")
		"thorn_vine", "razorvine", "荆棘藤": return Color("56b477")
		"moon_shroom", "月影菇": return SPORE
		"honey_lamp", "蜜灯花": return Color("f0b75d")
		"storm_pod", "雷荚草": return ARC
		"acid_moss", "酸囊苔": return Color("9fc34f")
		"fan_leaf", "风扇叶": return Color("63c6a0")
		"steam_lotus", "蒸汽莲": return STEAM
		"eclipse_shroom", "日蚀菇": return Color("dc9c55")
		_: return LIFE


static func enemy_color(enemy_id: StringName, boss: bool = false) -> Color:
	if boss:
		return Color("9e5742")
	match String(enemy_id):
		"mire_grub": return Color("718b67")
		"rust_mite": return Color("a46748")
		"iron_scavenger": return Color("64757a")
		"fog_spitter": return Color("716c83")
		"split_spore": return Color("91a64c")
		"hush_stalker": return Color("c46748")
		"hammer_beast": return Color("705347")
		"mender_carrier": return Color("a84545")
		_: return Color("73866b")


static func with_alpha(color: Color, alpha: float) -> Color:
	return Color(color.r, color.g, color.b, alpha)
