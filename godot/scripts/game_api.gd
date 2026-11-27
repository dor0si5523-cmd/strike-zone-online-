extends Node

const BASE_URL := "https://strike-zone-online-ofgp.onrender.com"
const SAVE_PATH := "user://ashen_vale.cfg"

var token := ""
var server_id := ""
var character_id := ""
var account_name := ""
var developer_mode := false

const DEV_CHARACTER := {"id":"local_dev_character", "name":"개발자", "classId":"warrior", "level":1, "xp":0, "kills":0}
const DEV_STATE := {
	"xp":0, "gold":40, "cash":300, "archerFocus":100, "kills":0,
	"enhancements":{"gold":{"attack":0,"defense":0,"maxHp":0,"critChance":0,"critDamage":0,"goldGain":0,"xpGain":0},"stats":{"attack":0,"defense":0,"maxHp":0,"critChance":0,"critDamage":0,"goldGain":0,"xpGain":0}},
	"questStage":0, "questKills":0, "potions":3, "x":1300, "y":1070, "hp":100,
	"items":[{"id":"starter_blade","visualKey":"starter_blade","name":"초보자의 무기","slot":"weapon","rarity":"common","atk":4,"def":0,"enhance":0},{"id":"starter_coat","visualKey":"starter_coat","name":"숲지기 가죽옷","slot":"armor","rarity":"common","atk":0,"def":3,"enhance":0},{"id":"starter_boots","visualKey":"starter_boots","name":"길잡이 장화","slot":"boots","rarity":"common","atk":0,"def":1,"enhance":0},{"id":"starter_ring","visualKey":"starter_ring","name":"낡은 호박 반지","slot":"ring","rarity":"common","atk":1,"def":0,"enhance":0}],
	"equipment":{"weapon":"starter_blade","armor":"starter_coat","helmet":"","boots":"starter_boots","ring":"starter_ring"},
	"autoSettings":{"range":"balanced","target":"nearest","potionAt":45,"autoQuest":true,"arrowType":"standard","autoSkills":true},
	"summonPity":{"epic":0,"legendary":0}, "summonHistory":[], "attendance":{"lastDay":"","streak":0},
	"daily":{"dayKey":"","kills":0,"attendanceClaimed":false,"missionClaimed":false},
	"weekly":{"weekKey":"","kills":0,"missionClaimed":false}, "zoneId":"forest", "classId":"warrior",
	"growth":{"petLevel":1,"petExp":0,"bossKills":0,"achievementClaims":[],"mailClaims":[]},
	"bestiary":{}, "records":{"bestScore":0,"bestKills":0,"bestBosses":0}, "partyEnabled":true, "clanWeeklyClaimKey":""
}

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

func begin_developer_session() -> Dictionary:
	developer_mode = true
	var cfg := ConfigFile.new()
	var loaded := cfg.load(SAVE_PATH) == OK
	var character: Dictionary = cfg.get_value("developer", "character", DEV_CHARACTER.duplicate(true)) if loaded else DEV_CHARACTER.duplicate(true)
	var state: Dictionary = cfg.get_value("developer", "state", DEV_STATE.duplicate(true)) if loaded else DEV_STATE.duplicate(true)
	return {"character":character.duplicate(true), "state":state.duplicate(true)}

func save_developer_state(state: Dictionary, character: Dictionary) -> void:
	var cfg := ConfigFile.new()
	cfg.load(SAVE_PATH)
	cfg.set_value("developer", "state", state.duplicate(true))
	cfg.set_value("developer", "character", character.duplicate(true))
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

