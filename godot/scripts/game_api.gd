extends Node

const BASE_URL := "https://strike-zone-online-ofgp.onrender.com"
const SAVE_PATH := "user://ashen_vale.cfg"

var token := ""
var server_id := ""
var character_id := ""
var account_name := ""

func _ready() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) == OK:
		token = str(cfg.get_value("session", "token", ""))
		server_id = str(cfg.get_value("session", "server_id", ""))
		character_id = str(cfg.get_value("session", "character_id", ""))
		account_name = str(cfg.get_value("session", "name", ""))

func _persist() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("session", "token", token)
	cfg.set_value("session", "server_id", server_id)
	cfg.set_value("session", "character_id", character_id)
	cfg.set_value("session", "name", account_name)
	cfg.save(SAVE_PATH)

func call_api(path: String, method: int = HTTPClient.METHOD_GET, payload: Dictionary = {}) -> Dictionary:
	var request_node := HTTPRequest.new()
	request_node.timeout = 25.0
	add_child(request_node)
	var headers := PackedStringArray(["Content-Type: application/json"])
	if not token.is_empty():
		headers.append("Authorization: Bearer " + token)
	var body := "" if method == HTTPClient.METHOD_GET else JSON.stringify(payload)
	var start_error := request_node.request(BASE_URL + path, headers, method, body)
	if start_error != OK:
		request_node.queue_free()
		return {"ok": false, "error": "서버 요청을 시작하지 못했습니다. 네트워크를 확인해 주세요."}
	var result: Array = await request_node.request_completed
	request_node.queue_free()
	var response_code: int = result[1]
	var text := (result[3] as PackedByteArray).get_string_from_utf8()
	var parsed: Variant = JSON.parse_string(text)
	if response_code == 401:
		token = ""
		server_id = ""
		character_id = ""
		_persist()
	return {"ok": response_code >= 200 and response_code < 300, "code": response_code, "data": parsed if parsed is Dictionary else {}, "error": str(parsed.get("error", "요청에 실패했습니다.")) if parsed is Dictionary else "서버 응답을 읽지 못했습니다."}

func authenticate(user: String, password: String, signup: bool = false) -> Dictionary:
	var route := "/api/signup" if signup else "/api/login"
	var result: Dictionary = await call_api(route, HTTPClient.METHOD_POST, {"user": user, "password": password})
	if result.ok:
		var response: Dictionary = result.data
		token = str(response.get("token", ""))
		account_name = str(response.get("name", user))
		server_id = ""
		character_id = ""
		_persist()
	return result

func select_server(value: String) -> Dictionary:
	var result: Dictionary = await call_api("/api/rpg/server/select", HTTPClient.METHOD_POST, {"serverId": value})
	if result.ok:
		server_id = value
		character_id = ""
		_persist()
	return result

func select_character(value: String) -> Dictionary:
	var result: Dictionary = await call_api("/api/rpg/characters/select", HTTPClient.METHOD_POST, {"characterId": value})
	if result.ok:
		character_id = value
		_persist()
	return result

func logout() -> void:
	if not token.is_empty():
		await call_api("/api/logout", HTTPClient.METHOD_POST, {})
	token = ""
	server_id = ""
	character_id = ""
	account_name = ""
	_persist()
