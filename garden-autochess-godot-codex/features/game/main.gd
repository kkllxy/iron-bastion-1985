extends Control

const GameModelScript := preload("res://features/model/garden_game_model.gd")
const GameViewScript := preload("res://features/presentation/garden_game_view.gd")
const AudioDirectorScript := preload("res://features/audio/audio_director.gd")
const WebTestBridgeScript := preload("res://features/qa/web_test_bridge.gd")

var model: RefCounted
var game_view: Control
var audio_director: Node
var web_test_bridge: Node


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	model = GameModelScript.new()
	game_view = GameViewScript.new()
	game_view.set_model(model)
	add_child(game_view)
	audio_director = AudioDirectorScript.new()
	audio_director.set_model(model)
	add_child(audio_director)
	web_test_bridge = WebTestBridgeScript.new()
	web_test_bridge.set_model(model, game_view)
	add_child(web_test_bridge)


func _physics_process(delta: float) -> void:
	model.advance(delta)
