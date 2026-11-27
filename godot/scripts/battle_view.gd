extends Control

signal state_changed(state: Dictionary)
signal battle_notice(message: String)

const WORLD_SIZE := Vector2(2600, 1900)
const TYPE_DATA := {
	"slime": {"name": "숲 슬라임", "hp": 48, "xp": 24, "gold": 8, "speed": 45.0, "color": Color("a8db78")},
	"forest_wolf": {"name": "숲 늑대", "hp": 82, "xp": 39, "gold": 13, "speed": 72.0, "color": Color("a98a61")},
	"ash_goblin": {"name": "잿빛 고블린", "hp": 112, "xp": 58, "gold": 18, "speed": 62.0, "color": Color("d18b69")},
	"ash_wolf": {"name": "잿불 늑대", "hp": 145, "xp": 78, "gold": 24, "speed": 78.0, "color": Color("d66e43")},
	"raider": {"name": "항구 약탈자", "hp": 230, "xp": 122, "gold": 38, "speed": 66.0, "color": Color("ca9d69")},
	"reef_wraith": {"name": "산호 망령", "hp": 275, "xp": 150, "gold": 46, "speed": 54.0, "color": Color("78d6cc")},
	"forest_guardian": {"name": "숲의 수호자", "hp": 720, "xp": 480, "gold": 260, "speed": 40.0, "color": Color("89bf70"), "boss": true},
	"ash_golem": {"name": "잿빛 거신", "hp": 1850, "xp": 1350, "gold": 900, "speed": 32.0, "color": Color("d38762"), "boss": true},
	"sea_leviathan": {"name": "심해의 레비아탄", "hp": 4200, "xp": 3200, "gold": 2200, "speed": 38.0, "color": Color("6bd3dc"), "boss": true}
}
const ZONE_COLOR := {"forest": Color("#536d43"), "ashlands": Color("#66584a"), "moonharbor": Color("#425b68")}

var state: Dictionary = {}
var character: Dictionary = {}
var player := Vector2(1300, 950)
var camera := Vector2.ZERO
var mobs: Array[Dictionary] = []
var trees: Array[Vector2] = []
var particles: Array[Dictionary] = []
var target_index := -1
var attack_clock := 0.0
var emit_clock := 0.0
var elapsed := 0.0
var facing := Vector2.DOWN
var random := RandomNumberGenerator.new()

func apply_state(value: Dictionary) -> void:
	state = value.duplicate(true)
	state["x"] = int(player.x)
	state["y"] = int(player.y)
	queue_redraw()

func configure(initial_state: Dictionary, initial_character: Dictionary) -> void:
	state = initial_state.duplicate(true)
	character = initial_character.duplicate(true)
	player = Vector2(float(state.get("x", 1300)), float(state.get("y", 950)))
	player.x = clampf(player.x, 48.0, WORLD_SIZE.x - 48.0)
	player.y = clampf(player.y, 48.0, WORLD_SIZE.y - 48.0)
	state["x"] = int(player.x)
	state["y"] = int(player.y)
	random.seed = hash(str(character.get("id", "adventurer")))
	for i in range(58):
		trees.append(Vector2(random.randf_range(30, WORLD_SIZE.x - 30), random.randf_range(30, WORLD_SIZE.y - 30)))
	for i in range(6):
		_spawn_mob()
	set_process(true)

func _process(delta: float) -> void:
	if state.is_empty(): return
	var step: float = minf(delta, 0.06)
	elapsed += step
	attack_clock -= step
	emit_clock += step
	for particle_index in range(particles.size() - 1, -1, -1):
		particles[particle_index]["life"] = float(particles[particle_index]["life"]) + step
		if float(particles[particle_index]["life"]) > 0.85:
			particles.remove_at(particle_index)
	var target := _nearest_mob()
	if target >= 0:
		target_index = target
		var enemy: Dictionary = mobs[target]
		var offset: Vector2 = enemy["position"] - player
		var distance := offset.length()
		facing = offset.normalized() if distance > 0.01 else facing
		if distance > 78.0:
			player += facing * 142.0 * step
		else:
			player += Vector2(-facing.y, facing.x) * sin(elapsed * 1.35) * 25.0 * step
			if attack_clock <= 0.0:
				attack_clock = 0.78
				_apply_attack(target)
		var current: Dictionary = mobs[target]
		var enemy_direction: Vector2 = player - current["position"]
		if enemy_direction.length() > 34.0:
			current["position"] = current["position"] + enemy_direction.normalized() * float(current["speed"]) * step
			mobs[target] = current
	player.x = clampf(player.x, 48.0, WORLD_SIZE.x - 48.0)
	player.y = clampf(player.y, 48.0, WORLD_SIZE.y - 48.0)
	for mob_index in range(mobs.size()):
		var mob: Dictionary = mobs[mob_index]
		if not mob["alive"]: continue
		var move: Vector2 = player - mob["position"]
		if mob_index != target_index and move.length() > 320.0:
			mob["position"] = mob["position"] + move.normalized() * float(mob["speed"]) * step * 0.5
		elif move.length() <= 38.0:
			mob["attack_clock"] = float(mob.get("attack_clock", 0.0)) - step
			if float(mob["attack_clock"]) <= 0.0:
				mob["attack_clock"] = 1.25
				var defense := 0
				for item in state.get("items", []):
					if item.get("id", "") in state.get("equipment", {}).values(): defense += int(item.get("def", 0))
				var suffered: int = maxi(1, int(600 / (100 + defense * 9)))
				state["hp"] = max(0, int(state.get("hp", 100)) - suffered)
				battle_notice.emit("피격 · HP -%s" % suffered)
				if int(state["hp"]) <= 0:
					state["hp"] = max(65, 100 + int(state.get("enhancements", {}).get("stats", {}).get("maxHp", 0)) * 5)
					player = Vector2(1300, 950)
					battle_notice.emit("쓰러졌습니다 · 안전 지점에서 다시 일어났습니다.")
					state_changed.emit(state.duplicate(true))
		mobs[mob_index] = mob
	if mobs.filter(func(m: Dictionary) -> bool: return bool(m["alive"])).size() < 6:
		_spawn_mob()
	if emit_clock >= 2.0:
		emit_clock = 0.0
		state["x"] = int(player.x)
		state["y"] = int(player.y)
		state_changed.emit(state.duplicate(true))
	queue_redraw()

func _nearest_mob() -> int:
	var nearest := -1
	var distance := 900.0
	for index in range(mobs.size()):
		if not mobs[index]["alive"]: continue
		var current_distance: float = player.distance_to(mobs[index]["position"])
		if current_distance < distance:
			distance = current_distance
			nearest = index
	return nearest

func _spawn_mob(forced_kind: String = "") -> void:
	var zone := str(state.get("zoneId", "forest"))
	var pool: Array = ["slime", "forest_wolf"]
	if zone == "ashlands": pool = ["ash_goblin", "ash_wolf"]
	if zone == "moonharbor": pool = ["raider", "reef_wraith"]
	var kind: String = forced_kind if TYPE_DATA.has(forced_kind) else str(pool[random.randi_range(0, pool.size() - 1)])
	var info: Dictionary = TYPE_DATA[kind]
	var angle := random.randf_range(0, TAU)
	var distance := random.randf_range(230, 510)
	var position := player + Vector2(cos(angle), sin(angle)) * distance
	position.x = clampf(position.x, 50, WORLD_SIZE.x - 50)
	position.y = clampf(position.y, 50, WORLD_SIZE.y - 50)
	var entry := {"index": -1, "kind": kind, "position": position, "hp": info["hp"], "max_hp": info["hp"], "speed": info["speed"], "alive": true, "boss": info.get("boss", false), "phase": random.randf_range(0, TAU), "attack_clock": 0.8}
	for index in range(mobs.size()):
		if not mobs[index]["alive"]:
			entry["index"] = index
			mobs[index] = entry
			return
	entry["index"] = mobs.size()
	mobs.append(entry)

func _apply_attack(index: int) -> void:
	if index < 0 or index >= mobs.size(): return
	var mob: Dictionary = mobs[index]
	var stats: Dictionary = state.get("enhancements", {}).get("stats", {})
	var weapon_bonus := 0
	for item in state.get("items", []):
		if item.get("id", "") == state.get("equipment", {}).get("weapon", ""):
			weapon_bonus += int(item.get("atk", 0)) + int(item.get("enhance", 0)) * 3
	var damage: int = max(5, 8 + weapon_bonus + int(stats.get("attack", 0)) * 2)
	mob["hp"] = int(mob["hp"]) - damage
	if int(mob["hp"]) <= 0:
		mob["alive"] = false
		var data: Dictionary = TYPE_DATA[mob["kind"]]
		state["kills"] = int(state.get("kills", 0)) + 1
		var enhancements: Dictionary = state.get("enhancements", {})
		var stat_upgrades: Dictionary = enhancements.get("stats", {})
		var gold_upgrades: Dictionary = enhancements.get("gold", {})
		var xp_multiplier := 1.0 + float(stat_upgrades.get("xpGain", 0)) * 0.01 + float(gold_upgrades.get("xpGain", 0)) * 0.02
		var gold_multiplier := 1.0 + float(stat_upgrades.get("goldGain", 0)) * 0.01 + float(gold_upgrades.get("goldGain", 0)) * 0.02
		state["xp"] = int(state.get("xp", 0)) + roundi(int(data["xp"]) * xp_multiplier)
		state["gold"] = int(state.get("gold", 0)) + roundi(int(data["gold"]) * gold_multiplier)
		state["questKills"] = int(state.get("questKills", 0)) + 1
		var bestiary: Dictionary = state.get("bestiary", {})
		bestiary[str(mob["kind"])] = int(bestiary.get(str(mob["kind"]), 0)) + 1
		state["bestiary"] = bestiary
		var today := _today_kst_key()
		var daily: Dictionary = state.get("daily", {})
		if str(daily.get("dayKey", "")) != today:
			daily["dayKey"] = today
			daily["kills"] = 0
			daily["attendanceClaimed"] = false
			daily["missionClaimed"] = false
		daily["kills"] = int(daily.get("kills", 0)) + 1
		state["daily"] = daily
		var week := _week_kst_key(today)
		var weekly: Dictionary = state.get("weekly", {})
		if str(weekly.get("weekKey", "")) != week:
			weekly["weekKey"] = week
			weekly["kills"] = 0
			weekly["missionClaimed"] = false
		weekly["kills"] = int(weekly.get("kills", 0)) + 1
		state["weekly"] = weekly
		state["hp"] = min(int(state.get("hp", 100)) + 2, 100 + int(stats.get("maxHp", 0)) * 5 + int(enhancements.get("gold", {}).get("maxHp", 0)) * 10)
		var floating := {"position": mob["position"], "amount": damage, "life": 0.0}
		particles.append(floating)
		target_index = -1
		if int(state["kills"]) % 10 == 0:
			var boss_type: String = str({"forest": "숲의 수호자", "ashlands": "잿빛 거신", "moonharbor": "심해의 레비아탄"}.get(str(state.get("zoneId", "forest")), "숲의 수호자"))
			state["lastBattleNotice"] = "%s을(를) 처치했습니다 · 10킬 보스 출현 예정: %s" % [data["name"], boss_type]
			_spawn_mob({"forest":"forest_guardian", "ashlands":"ash_golem", "moonharbor":"sea_leviathan"}.get(str(state.get("zoneId", "forest")), "forest_guardian"))
		else:
			state["lastBattleNotice"] = "%s 처치 · XP +%s · 골드 +%s" % [data["name"], roundi(int(data["xp"]) * xp_multiplier), roundi(int(data["gold"]) * gold_multiplier)]
		battle_notice.emit(str(state["lastBattleNotice"]))
		state_changed.emit(state.duplicate(true))
	else:
		mobs[index] = mob
		particles.append({"position": mob["position"], "amount": damage, "life": 0.0})

func export_state() -> Dictionary:
	state["x"] = int(player.x)
	state["y"] = int(player.y)
	return state.duplicate(true)

func _today_kst_key() -> String:
	var value: Dictionary = Time.get_datetime_dict_from_unix_time(int(Time.get_unix_time_from_system()) + 32400)
	return "%04d-%02d-%02d" % [value.year, value.month, value.day]

func _week_kst_key(day_key: String) -> String:
	var parts := day_key.split("-")
	var unix := Time.get_unix_time_from_datetime_dict({"year": int(parts[0]), "month": int(parts[1]), "day": int(parts[2]), "hour": 0, "minute": 0, "second": 0})
	var weekday: int = int(Time.get_datetime_dict_from_unix_time(unix).get("weekday", 1))
	var monday := unix - ((weekday + 6) % 7) * 86400
	var value: Dictionary = Time.get_datetime_dict_from_unix_time(int(monday))
	return "%04d-%02d-%02d" % [value.year, value.month, value.day]

func _draw() -> void:
	var view := get_viewport_rect().size
	camera = player - view * 0.5
	camera.x = clampf(camera.x, 0, maxf(0, WORLD_SIZE.x - view.x))
	camera.y = clampf(camera.y, 0, maxf(0, WORLD_SIZE.y - view.y))
	var base: Color = ZONE_COLOR.get(str(state.get("zoneId", "forest")), ZONE_COLOR["forest"])
	draw_rect(Rect2(Vector2.ZERO, view), base)
	_draw_ground_pattern(view, base)
	for tree in trees:
		var point := tree - camera
		if point.x < -65 or point.y < -75 or point.x > view.x + 65 or point.y > view.y + 75: continue
		_draw_tree(point, tree)
	var order: Array[Dictionary] = []
	for mob in mobs:
		if mob["alive"]: order.append({"y": mob["position"].y, "mob": mob})
	order.append({"y": player.y, "player": true})
	order.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["y"]) < float(b["y"]))
	for item in order:
		if item.has("mob"):
			_draw_mob(item["mob"], camera)
		else:
			_draw_player(camera)
	for particle in particles:
		var p: Vector2 = particle["position"] - camera
		draw_string(ThemeDB.fallback_font, p + Vector2(0, -25 - float(particle["life"]) * 24), "-%s" % particle["amount"], HORIZONTAL_ALIGNMENT_CENTER, -1, 17, Color("fff0ae"))
	_draw_minimap(view)

func _draw_ground_pattern(view: Vector2, base: Color) -> void:
	var offset := Vector2(fposmod(camera.x, 76), fposmod(camera.y, 76))
	for row in range(-1, int(view.y / 76.0) + 2):
		for col in range(-1, int(view.x / 76.0) + 2):
			var x := col * 76.0 - offset.x + 18.0 + float((row + col) % 2) * 14.0
			var y := row * 76.0 - offset.y + 25.0
			var tint := Color("#ffffff14") if (row * 7 + col * 3) % 4 == 0 else Color("#1625161b")
			draw_ellipse(Vector2(x + 9, y + 2.5), 9, 2.5, tint)
			if base.r < 0.3:
				draw_arc(Vector2(x + 28, y + 32), 9, 0.2, 2.8, 12, Color("#a1d3cc20"), 1.5)

func _draw_tree(point: Vector2, world_point: Vector2) -> void:
	var radius := 18.0 + fposmod(world_point.x * 0.31 + world_point.y * 0.13, 17.0)
	draw_circle(point + Vector2(2, 13), radius * 0.85, Color("#202c2370"))
	draw_circle(point + Vector2(0, 3), radius, Color("#304b31"))
	draw_circle(point + Vector2(-radius * 0.24, -radius * 0.14), radius * 0.7, Color("#486740"))
	draw_circle(point + Vector2(radius * 0.25, -radius * 0.06), radius * 0.62, Color("#60774a"))
	draw_circle(point + Vector2(-radius * 0.2, -radius * 0.26), radius * 0.3, Color("#76905a"))

func _draw_mob(mob: Dictionary, cam: Vector2) -> void:
	var info: Dictionary = TYPE_DATA[mob["kind"]]
	var point: Vector2 = mob["position"] - cam
	if point.x < -45 or point.y < -55 or point.x > size.x + 45 or point.y > size.y + 55: return
	var bob := sin(elapsed * 3.1 + float(mob["phase"])) * 2.0
	var p := point + Vector2(0, bob)
	var scale := 1.7 if info.get("boss", false) else 1.0
	draw_set_transform(point, 0, Vector2.ONE * scale)
	draw_circle(Vector2(0, 12), 18, Color("#10150f66"))
	draw_colored_polygon(PackedVector2Array([Vector2(-19, 0), Vector2(-15, -14), Vector2(-5, -20), Vector2(12, -17), Vector2(20, -4), Vector2(17, 12), Vector2(7, 18), Vector2(-12, 16)]), info["color"])
	draw_circle(Vector2(-6, -7), 2.8, Color("#f4f0d7"))
	draw_circle(Vector2(7, -7), 2.8, Color("#f4f0d7"))
	draw_circle(Vector2(-5, -7), 1.1, Color("#18231c"))
	draw_circle(Vector2(8, -7), 1.1, Color("#18231c"))
	draw_arc(Vector2(1, -1), 5.5, 0.35, 2.75, 12, Color("#5b3029"), 1.4)
	draw_set_transform(Vector2.ZERO)
	var bar_width := 48.0 if info.get("boss", false) else 38.0
	draw_rect(Rect2(point + Vector2(-bar_width * 0.5, -29 * scale), Vector2(bar_width, 5)), Color("#111711"))
	draw_rect(Rect2(point + Vector2(-bar_width * 0.5 + 1, -28 * scale), Vector2((bar_width - 2) * maxf(0, float(mob["hp"]) / float(mob["max_hp"])), 3)), Color("#df816d"))
	draw_string(ThemeDB.fallback_font, point + Vector2(0, -35 * scale), str(info["name"]), HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color("#f4e8ca"))

func _draw_player(cam: Vector2) -> void:
	var p := player - cam
	draw_circle(p + Vector2(0, 13), 20, Color("#11160f77"))
	draw_colored_polygon(PackedVector2Array([p + Vector2(-13, -5), p + Vector2(-17, 7), p + Vector2(-11, 15), p + Vector2(11, 15), p + Vector2(17, 7), p + Vector2(13, -5)]), Color("#293f39"))
	draw_line(p + Vector2(-8, 10), p + Vector2(-10, 18), Color("#d8c49a"), 4)
	draw_line(p + Vector2(8, 10), p + Vector2(10, 18), Color("#d8c49a"), 4)
	draw_circle(p + Vector2(0, -13), 10, Color("#c08a61"))
	draw_arc(p + Vector2(0, -14), 10, PI, TAU, 16, Color("#334331"), 5)
	var weapon_color := Color("#d6c7a1")
	var equipped_id: String = str(state.get("equipment", {}).get("weapon", ""))
	for item in state.get("items", []):
		if str(item.get("id", "")) == equipped_id:
			weapon_color = {"rare": Color("#78b9dd"), "epic": Color("#bd91e7"), "unique": Color("#e8c860"), "legendary": Color("#79b779"), "mythic": Color("#f0eee1"), "immortal": Color("#df625d")}.get(str(item.get("rarity", "common")), weapon_color)
	var hand := p + facing * 8.0 + Vector2(0, -3)
	draw_line(hand, hand + facing.rotated(-0.8) * 27, weapon_color, 4)
	draw_circle(p + facing * 13 + Vector2(0, -2), 3.4, Color("#c08a61"))
	if str(character.get("classId", "warrior")) == "archer":
		var bow_center := p + facing.rotated(PI / 2) * 9
		draw_arc(bow_center, 17, -1.15, 1.15, 18, weapon_color, 3)
		draw_line(bow_center + facing.rotated(-1.15) * 17, bow_center + facing.rotated(1.15) * 17, Color("#e8d9b4"), 1)
	if target_index >= 0 and target_index < mobs.size() and mobs[target_index]["alive"]:
		var target: Vector2 = mobs[target_index]["position"] - cam
		draw_arc(target + Vector2(0, -2), 28, 0, TAU, 32, Color("#e7c87b99"), 1.5)

func _draw_minimap(view: Vector2) -> void:
	var box := Rect2(Vector2(view.x - 100, view.y - 158), Vector2(86, 96))
	draw_rect(box, Color("#101915cc"), true)
	draw_rect(box, Color("#e7c87b88"), false, 1)
	for mob in mobs:
		if not mob["alive"]: continue
		var rel: Vector2 = (mob["position"] - player) / WORLD_SIZE * 72.0
		draw_circle(box.position + Vector2(43, 48) + rel, 2, Color("#e18b70"))
	draw_circle(box.position + Vector2(43, 48), 3, Color("#e7c87b"))
