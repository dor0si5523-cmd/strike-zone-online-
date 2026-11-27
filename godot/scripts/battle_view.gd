extends Control

signal state_changed(state: Dictionary)
signal battle_notice(message: String)

const WORLD_SIZE := Vector2(2600, 1900)
const CLASS_DATA := {
	"warrior": {"range":108.0, "cooldown":0.44, "multiplier":4.1},
	"archer": {"range":290.0, "cooldown":0.56, "multiplier":2.9},
	"mage": {"range":240.0, "cooldown":0.72, "multiplier":3.8},
	"gunner": {"range":255.0, "cooldown":0.30, "multiplier":2.55}
}
const TYPE_DATA := {
	"slime": {"name": "숲 슬라임", "hp": 48, "xp": 24, "gold": 8, "attack":3, "speed": 34.0, "color": Color("a8db78")},
	"forest_wolf": {"name": "숲 늑대", "hp": 82, "xp": 39, "gold": 13, "attack":5, "speed": 57.0, "color": Color("a98a61")},
	"ash_goblin": {"name": "잿빛 고블린", "hp": 112, "xp": 58, "gold": 18, "attack":8, "speed": 48.0, "color": Color("d18b69")},
	"ash_wolf": {"name": "잿불 늑대", "hp": 145, "xp": 78, "gold": 24, "attack":10, "speed": 64.0, "color": Color("d66e43")},
	"raider": {"name": "항구 약탈자", "hp": 230, "xp": 122, "gold": 38, "attack":14, "speed": 52.0, "color": Color("ca9d69")},
	"reef_wraith": {"name": "산호 망령", "hp": 275, "xp": 150, "gold": 46, "attack":17, "speed": 42.0, "color": Color("78d6cc")},
	"forest_guardian": {"name": "숲의 수호자", "hp": 720, "xp": 480, "gold": 260, "attack":16, "speed": 30.0, "color": Color("89bf70"), "boss": true},
	"ash_golem": {"name": "잿빛 거신", "hp": 1850, "xp": 1350, "gold": 900, "attack":30, "speed": 25.0, "color": Color("d38762"), "boss": true},
	"sea_leviathan": {"name": "심해의 레비아탄", "hp": 4200, "xp": 3200, "gold": 2200, "attack":48, "speed": 32.0, "color": Color("6bd3dc"), "boss": true}
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
	mobs.clear()
	trees.clear()
	particles.clear()
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
		var class_data: Dictionary = CLASS_DATA.get(str(state.get("classId", character.get("classId", "warrior"))), CLASS_DATA["warrior"])
		var preferred_range := float(class_data["range"]) * 0.76
		facing = offset.normalized() if distance > 0.01 else facing
		if distance > preferred_range:
			player += facing * 164.0 * step
		else:
			player += Vector2(-facing.y, facing.x) * sin(elapsed * 1.35) * 38.0 * step
			if attack_clock <= 0.0:
				var attack_speed: float = float(_combat_stats()["attack_speed"])
				attack_clock = float(class_data["cooldown"]) / (1.0 + attack_speed)
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
				var enemy_stats: Dictionary = TYPE_DATA.get(str(mob["kind"]), TYPE_DATA["slime"])
				mob["attack_clock"] = 0.85 if mob.get("boss", false) else (1.45 if float(enemy_stats["speed"]) < 40.0 else 1.15)
				var defense: int = int(_combat_stats()["defense"])
				var monster_data: Dictionary = TYPE_DATA.get(str(mob["kind"]), TYPE_DATA["slime"])
				var suffered: int = maxi(1, int(ceil(float(monster_data["attack"]) * 100.0 / (100.0 + defense * 4.0))))
				state["hp"] = max(0, int(state.get("hp", 100)) - suffered)
				battle_notice.emit("피격 · HP -%s" % suffered)
				if int(state["hp"]) <= 0:
					state["hp"] = max(65, int(_combat_stats()["max_hp"]))
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
	var stats := _combat_stats()
	var class_data: Dictionary = CLASS_DATA.get(str(state.get("classId", character.get("classId", "warrior"))), CLASS_DATA["warrior"])
	var level := _character_level(int(state.get("xp", 0)))
	var distance: float = player.distance_to(mob["position"])
	var range_bonus := 1.0 + minf(1.0, distance / float(class_data["range"])) * 0.35 if str(state.get("classId", "")) == "archer" else 1.0
	var base_damage := roundi((int(stats["attack"]) * float(class_data["multiplier"]) + level * 2) * range_bonus)
	var critical := random.randf() < float(stats["crit_chance"])
	var damage := maxi(1, roundi(base_damage * (float(stats["crit_damage"]) if critical else 1.0)))
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
		if bool(data.get("boss", false)):
			var growth: Dictionary = state.get("growth", {})
			growth["bossKills"] = int(growth.get("bossKills", 0)) + 1
			state["growth"] = growth
			var records: Dictionary = state.get("records", {})
			records["bestBosses"] = maxi(int(records.get("bestBosses", 0)), int(growth["bossKills"]))
			state["records"] = records
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
		state["hp"] = min(int(state.get("hp", 100)) + 2, int(stats["max_hp"]))
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
		if critical:
			battle_notice.emit("치명타 · %s 피해" % damage)

func _character_level(xp: int) -> int:
	var level := 1
	var remaining := xp
	var needed := 120
	while remaining >= needed and level < 60:
		remaining -= needed
		level += 1
		needed = 120 + (level - 1) * 45
	return level

func _combat_stats() -> Dictionary:
	var level := _character_level(int(state.get("xp", 0)))
	var attack := level * 2
	var defense := 0
	var equipment: Dictionary = state.get("equipment", {})
	for item in state.get("items", []):
		if item.get("id", "") in equipment.values():
			attack += int(item.get("atk", 0)) + int(item.get("enhance", 0)) * 2
			defense += int(item.get("def", 0)) + int(item.get("enhance", 0))
	var enhancements: Dictionary = state.get("enhancements", {})
	var gold: Dictionary = enhancements.get("gold", {})
	var stats: Dictionary = enhancements.get("stats", {})
	attack += (int(gold.get("attack", 0)) + int(stats.get("attack", 0))) * 2
	var pet_level := maxi(1, int(state.get("growth", {}).get("petLevel", 1)))
	attack += pet_level - 1
	defense += int({"warrior":7, "archer":1, "mage":0, "gunner":2}.get(str(state.get("classId", "warrior")), 0))
	defense += floori(float(pet_level - 1) / 5.0)
	defense += int(gold.get("defense", 0)) + int(stats.get("defense", 0))
	var max_hp := 100 + int(gold.get("maxHp", 0)) * 10 + int(stats.get("maxHp", 0)) * 5
	var crit_chance := minf(0.75, 0.05 + (int(gold.get("critChance", 0)) + int(stats.get("critChance", 0))) * 0.005)
	var crit_damage := 1.5 + int(gold.get("critDamage", 0)) * 0.03 + int(stats.get("critDamage", 0)) * 0.02
	var attack_speed := 0.0
	if str(state.get("classId", "warrior")) == "archer":
		for item in state.get("items", []):
			if item.get("id", "") != equipment.get("weapon", ""): continue
			var visual_key := str(item.get("visualKey", ""))
			if not visual_key.begins_with("bow_"): continue
			var tier := 0
			for tier_index in range(5):
				if visual_key.begins_with("bow_" + ["epic", "unique", "legendary", "mythic", "immortal"][tier_index] + "_"): tier = tier_index + 1
			var variant := 1
			var parts := visual_key.split("_")
			if parts.size() >= 3 and parts[-1].is_valid_int():
				variant = int(parts[-1])
			else:
				variant = ["bow_ashwood", "bow_moonsteel", "bow_ember", "bow_thornvine", "bow_starfall"].find(visual_key) + 1
			attack_speed = [0.0, 0.025, 0.045, 0.065, 0.085, 0.11][tier]
			crit_chance = minf(0.75, crit_chance + [0.01, 0.018, 0.026, 0.034, 0.042, 0.05][tier])
			crit_damage += 0.04 + (variant - 1) * 0.012
			break
	return {"attack":attack, "defense":defense, "max_hp":max_hp, "crit_chance":crit_chance, "crit_damage":crit_damage, "attack_speed":attack_speed}

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
	var box := Rect2(Vector2(view.x - 100, view.y - 224), Vector2(86, 96))
	draw_rect(box, Color("#101915cc"), true)
	draw_rect(box, Color("#e7c87b88"), false, 1)
	for mob in mobs:
		if not mob["alive"]: continue
		var rel: Vector2 = (mob["position"] - player) / WORLD_SIZE * 72.0
		draw_circle(box.position + Vector2(43, 48) + rel, 2, Color("#e18b70"))
	draw_circle(box.position + Vector2(43, 48), 3, Color("#e7c87b"))


