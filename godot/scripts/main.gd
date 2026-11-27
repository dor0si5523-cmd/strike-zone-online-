extends Control

const BattleView := preload("res://scripts/battle_view.gd")
const CLASS_NAMES := {"warrior": "전사", "archer": "궁수", "mage": "마법사", "gunner": "해적(거너)"}
const SERVER_NAMES := {"dawn": "새벽숲", "moon": "달빛 항구", "ember": "잿빛 변경"}

var page: VBoxContainer
var status_label: Label
var user_input: LineEdit
var password_input: LineEdit
var name_input: LineEdit
var class_picker: OptionButton
var signup_mode := false
var selected_server := ""
var characters: Array = []
var active_character: Dictionary = {}
var game_state: Dictionary = {}
var battle: Control
var save_timer: float = 0.0
var last_saved_kills := 0
var busy := false
var battle_gold: Label
var battle_cash: Label
var battle_power: Label
var battle_hp: Label
var battle_identity: Label
var battle_notice_label: Label
var current_overlay: Control
var overlay_content: VBoxContainer
var enhancement_mode := "gold"
var gacha_slot := "weapon"
var battle_hud: Control
var battle_footer: Control
var developer_has_existing := false
var community_opted_in := false
var community_clan: Dictionary = {}
var community_weekly_claimed := false
var battle_nav: ScrollContainer
var held_upgrade_key := ""
var held_upgrade_wait := 0.0
var upgrade_busy := false
var hold_upgrade_button: Button

func _ready() -> void:
	_build_shell()
	if not GameApi.token.is_empty() and not GameApi.server_id.is_empty() and not GameApi.character_id.is_empty():
		call_deferred("_resume_session")
	else:
		_show_auth()

func _build_shell() -> void:
	var backdrop := ColorRect.new()
	backdrop.color = Color("101915")
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 22)
	margin.add_theme_constant_override("margin_right", 22)
	margin.add_theme_constant_override("margin_top", 28)
	margin.add_theme_constant_override("margin_bottom", 28)
	add_child(margin)
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color("17231e")
	style.border_color = Color("80734e")
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 22
	style.content_margin_bottom = 22
	panel.add_theme_stylebox_override("panel", style)
	margin.add_child(panel)
	page = VBoxContainer.new()
	page.add_theme_constant_override("separation", 12)
	panel.add_child(page)

func _clear_page() -> void:
	for child in page.get_children():
		child.queue_free()
	status_label = null

func _heading(title: String, subtitle: String = "") -> void:
	var title_label := Label.new()
	title_label.text = title
	title_label.add_theme_font_size_override("font_size", 27)
	title_label.add_theme_color_override("font_color", Color("e7c87b"))
	page.add_child(title_label)
	if not subtitle.is_empty():
		var sub := Label.new()
		sub.text = subtitle
		sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		sub.add_theme_color_override("font_color", Color("b7c2b6"))
		page.add_child(sub)

func _label(text: String) -> Label:
	var item := Label.new()
	item.text = text
	item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	page.add_child(item)
	return item

func _button(text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 48
	button.add_theme_font_size_override("font_size", 16)
	_style_button(button)
	button.pressed.connect(action)
	page.add_child(button)
	return button

func _line_edit(placeholder: String, secret: bool = false) -> LineEdit:
	var field := LineEdit.new()
	field.placeholder_text = placeholder
	field.custom_minimum_size.y = 48
	field.add_theme_font_size_override("font_size", 16)
	field.secret = secret
	page.add_child(field)
	return field

func _set_status(text: String) -> void:
	if status_label:
		status_label.text = text
		status_label.visible = not text.is_empty()

func _show_auth() -> void:
	_clear_page()
	_heading("ASHEN VALE", "모험가 계정으로 계속하기")
	user_input = _line_edit("아이디 · 4~20자")
	user_input.max_length = 20
	password_input = _line_edit("비밀번호 · 8자 이상", true)
	password_input.secret = true
	_button("회원가입" if signup_mode else "로그인", _submit_auth)
	_button("로그인으로 돌아가기" if signup_mode else "새 계정 만들기", _toggle_signup)
	if not signup_mode:
		_button("개발자 계정으로 로그인", _developer_login)
		var note := _label("개발자 모드 · 계정 없이 바로 시작 · 이 기기에만 저장")
		note.add_theme_font_size_override("font_size", 12)
		note.add_theme_color_override("font_color", Color("b7c2b6"))
	status_label = _label("")
	status_label.add_theme_color_override("font_color", Color("e58b73"))

func _developer_login() -> void:
	if busy: return
	var session: Dictionary = GameApi.begin_developer_session()
	active_character = session.character
	game_state = session.state
	game_state["classId"] = str(active_character.get("classId", "warrior"))
	developer_has_existing = bool(session.get("has_existing", false))
	last_saved_kills = int(game_state.get("kills", 0))
	_show_create_character()

func _toggle_signup() -> void:
	signup_mode = not signup_mode
	_show_auth()

func _submit_auth() -> void:
	if busy: return
	var username := user_input.text.strip_edges()
	var password := password_input.text
	if username.length() < 4 or password.length() < 8:
		_set_status("아이디와 비밀번호 길이를 확인해 주세요.")
		return
	busy = true
	_set_status("계정 확인 중…")
	var response: Dictionary = await GameApi.authenticate(username, password, signup_mode)
	busy = false
	if not response.ok:
		_set_status(response.error)
		return
	await _show_servers()

func _resume_session() -> void:
	var selected: Dictionary = await GameApi.select_server(GameApi.server_id)
	if not selected.ok:
		_show_auth()
		return
	characters = selected.data.get("characters", [])
	var found := false
	for character in characters:
		if str(character.get("id", "")) == GameApi.character_id:
			active_character = character
			found = true
	if not found:
		await _show_characters()
		return
	var chosen: Dictionary = await GameApi.select_character(GameApi.character_id)
	if not chosen.ok:
		await _show_characters()
		return
	var loaded: Dictionary = await GameApi.call_api("/api/rpg")
	if not loaded.ok:
		_show_auth()
		return
	game_state = loaded.data
	last_saved_kills = int(game_state.get("kills", 0))
	_enter_battle()

func _show_servers() -> void:
	_clear_page()
	_heading("서버 선택", "모험을 이어갈 서버를 선택하세요.")
	var response: Dictionary = await GameApi.call_api("/api/rpg/servers")
	if not response.ok:
		_show_auth()
		_set_status(response.error)
		return
	for server in response.data.get("servers", []):
		var server_id := str(server.get("id", ""))
		var title := str(server.get("name", SERVER_NAMES.get(server_id, server_id)))
		var detail := str(server.get("region", "아시아")) + " · " + str(server.get("status", "원활"))
		_button(title + "\n" + detail, _choose_server.bind(server_id))
	_button("로그아웃", _logout)

func _choose_server(value: String) -> void:
	if busy: return
	busy = true
	var response: Dictionary = await GameApi.select_server(value)
	busy = false
	if not response.ok:
		_show_servers()
		return
	selected_server = value
	characters = response.data.get("characters", [])
	await _show_characters()

func _show_characters() -> void:
	_clear_page()
	_heading("캐릭터 선택", SERVER_NAMES.get(GameApi.server_id, "선택 서버"))
	for character in characters:
		var character_id := str(character.get("id", ""))
		var line := HBoxContainer.new()
		page.add_child(line)
		var info := Label.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.text = "%s · %s Lv.%s" % [character.get("name", "모험가"), CLASS_NAMES.get(str(character.get("classId", "warrior")), "모험가"), character.get("level", 1)]
		line.add_child(info)
		var select_button := Button.new()
		select_button.text = "입장"
		select_button.custom_minimum_size = Vector2(74, 44)
		_style_button(select_button, true)
		select_button.pressed.connect(_enter_character.bind(character))
		line.add_child(select_button)
		var delete_button := Button.new()
		delete_button.text = "삭제"
		delete_button.custom_minimum_size = Vector2(64, 44)
		_style_button(delete_button, true)
		delete_button.pressed.connect(_confirm_delete.bind(character_id))
		line.add_child(delete_button)
	if characters.size() < 3:
		_button("새 캐릭터 만들기", _show_create_character)
	_button("서버 다시 선택", _show_servers)

func _show_create_character() -> void:
	_clear_page()
	_heading("캐릭터 생성", "직업은 생성 후 변경할 수 없습니다." if not GameApi.developer_mode else "개발자 테스트 캐릭터를 만들고 모험을 시작하세요.")
	name_input = _line_edit("캐릭터 이름 · 2~12자")
	name_input.max_length = 12
	if GameApi.developer_mode:
		name_input.text = str(active_character.get("name", "개발자"))
	class_picker = OptionButton.new()
	for class_id in ["warrior", "archer", "mage", "gunner"]:
		class_picker.add_item(CLASS_NAMES[class_id])
		class_picker.set_item_metadata(class_picker.item_count - 1, class_id)
		if GameApi.developer_mode and class_id == str(active_character.get("classId", "warrior")):
			class_picker.select(class_picker.item_count - 1)
	class_picker.custom_minimum_size.y = 48
	page.add_child(class_picker)
	_button("캐릭터 생성 후 시작", _create_character)
	if GameApi.developer_mode:
		if developer_has_existing:
			_button("저장된 개발자 캐릭터로 계속", _continue_developer_character)
		_button("로그인 화면으로 돌아가기", _cancel_developer_login)
	else:
		_button("돌아가기", _show_characters)
	status_label = _label("")

func _create_character() -> void:
	if busy: return
	var name := name_input.text.strip_edges()
	if name.length() < 2 or name.length() > 12:
		_set_status("캐릭터 이름은 2~12자로 입력해 주세요.")
		return
	var class_id: String = str(class_picker.get_item_metadata(class_picker.selected))
	if GameApi.developer_mode:
		if developer_has_existing and (name != str(active_character.get("name", "")) or class_id != str(active_character.get("classId", "warrior"))):
			var dialog := ConfirmationDialog.new()
			dialog.dialog_text = "새 개발자 캐릭터를 만들면 이 기기에 저장된 기존 개발자 진행도가 교체됩니다. 계속할까요?"
			dialog.confirmed.connect(_create_developer_character.bind(name, class_id))
			add_child(dialog)
			dialog.popup_centered(Vector2i(500, 220))
			return
		_create_developer_character(name, class_id)
		return
	busy = true
	var response: Dictionary = await GameApi.call_api("/api/rpg/characters", HTTPClient.METHOD_POST, {"name": name, "classId": class_id})
	busy = false
	if not response.ok:
		_set_status(response.error)
		return
	characters = response.data.get("characters", [])
	await _show_characters()

func _create_developer_character(name: String, class_id: String) -> void:
	active_character = {"id":"local_dev_character", "name":name, "classId":class_id, "level":1, "xp":0, "kills":0}
	game_state = GameApi.DEV_STATE.duplicate(true)
	game_state["classId"] = class_id
	developer_has_existing = true
	last_saved_kills = 0
	GameApi.save_developer_state(game_state, active_character)
	_enter_battle()

func _continue_developer_character() -> void:
	game_state["classId"] = str(active_character.get("classId", "warrior"))
	_enter_battle()

func _cancel_developer_login() -> void:
	GameApi.developer_mode = false
	developer_has_existing = false
	_show_auth()

func _confirm_delete(character_id: String) -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "선택한 캐릭터를 삭제할까요? 삭제한 캐릭터는 복구할 수 없습니다."
	dialog.confirmed.connect(_delete_character.bind(character_id))
	add_child(dialog)
	dialog.popup_centered(Vector2i(440, 220))

func _delete_character(character_id: String) -> void:
	var response: Dictionary = await GameApi.call_api("/api/rpg/characters/delete", HTTPClient.METHOD_POST, {"characterId": character_id})
	if response.ok:
		characters = response.data.get("characters", [])
		await _show_characters()

func _enter_character(character: Dictionary) -> void:
	if busy: return
	busy = true
	var response: Dictionary = await GameApi.select_character(str(character.get("id", "")))
	if response.ok:
		var loaded: Dictionary = await GameApi.call_api("/api/rpg")
		busy = false
		if loaded.ok:
			active_character = character
			game_state = loaded.data
			last_saved_kills = int(game_state.get("kills", 0))
			_enter_battle()
		else:
			await _show_characters()
	else:
		busy = false
		await _show_characters()

func _enter_battle() -> void:
	_clear_page()
	var world := BattleView.new()
	world.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	world.state_changed.connect(_on_state_changed)
	world.battle_notice.connect(_show_battle_notice)
	add_child(world)
	battle = world
	battle.configure(game_state, active_character)
	var hud := VBoxContainer.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	hud.offset_left = 12
	hud.offset_right = -12
	hud.offset_top = 12
	hud.add_theme_constant_override("separation", 7)
	add_child(hud)
	var head := PanelContainer.new()
	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 8)
	head.add_child(bar)
	hud.add_child(head)
	battle_identity = Label.new()
	battle_identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_identity.text = "%s · Lv.%s" % [active_character.get("name", "모험가"), active_character.get("level", 1)]
	bar.add_child(battle_identity)
	battle_gold = Label.new()
	battle_gold.text = "◈ %s" % str(game_state.get("gold", 0))
	bar.add_child(battle_gold)
	battle_hp = Label.new()
	battle_hp.text = "HP %s" % str(game_state.get("hp", 100))
	bar.add_child(battle_hp)
	var resource_bar := HBoxContainer.new()
	resource_bar.add_theme_constant_override("separation", 14)
	hud.add_child(resource_bar)
	battle_power = Label.new()
	battle_power.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_power.text = "전투력 %s" % _combat_stats().power
	resource_bar.add_child(battle_power)
	battle_cash = Label.new()
	battle_cash.text = "✧ %s" % str(game_state.get("cash", 0))
	resource_bar.add_child(battle_cash)
	battle_nav = ScrollContainer.new()
	battle_nav.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	battle_nav.offset_left = 8
	battle_nav.offset_right = -8
	battle_nav.offset_top = -58
	battle_nav.offset_bottom = -8
	battle_nav.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	battle_nav.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(battle_nav)
	var menu := HBoxContainer.new()
	menu.add_theme_constant_override("separation", 2)
	battle_nav.add_child(menu)
	for title in ["캐릭터", "장비", "스킬", "던전", "퀘스트", "상점&뽑기", "이벤트", "우편함", "메뉴"]:
		var b := Button.new()
		b.text = title
		b.custom_minimum_size = Vector2(62 if title == "상점&뽑기" else 42, 46)
		b.add_theme_font_size_override("font_size", 9)
		_style_button(b, true)
		b.pressed.connect(_open_game_panel.bind(title))
		menu.add_child(b)
	var bottom := Label.new()
	bottom.text = "개발자 테스트 · 이 기기에만 저장" if GameApi.developer_mode else "자동 전투 중 · 화면을 세로로 돌려 플레이"
	battle_notice_label = bottom
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_left = 10
	bottom.offset_right = -10
	bottom.offset_top = -285
	bottom.offset_bottom = -245
	bottom.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(bottom)
	battle_hud = hud
	battle_footer = bottom

func _make_overlay(title: String) -> void:
	if current_overlay:
		current_overlay.queue_free()
	var shade := ColorRect.new()
	shade.color = Color(0.025, 0.04, 0.035, 0.9)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(shade)
	current_overlay = shade
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.add_child(center)
	var panel := PanelContainer.new()
	var panel_width: float = minf(500.0, get_viewport_rect().size.x - 28.0)
	var panel_height: float = minf(700.0, get_viewport_rect().size.y - 100.0)
	panel.custom_minimum_size = Vector2(panel_width, panel_height)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("17231e")
	style.border_color = Color("b99e60")
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.content_margin_left = 15
	style.content_margin_right = 15
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	panel.add_theme_stylebox_override("panel", style)
	center.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	panel.add_child(column)
	var header := HBoxContainer.new()
	column.add_child(header)
	var heading := Label.new()
	heading.text = title
	heading.add_theme_color_override("font_color", Color("e7c87b"))
	heading.add_theme_font_size_override("font_size", 22)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(heading)
	var close := Button.new()
	close.text = "닫기"
	_style_button(close, true)
	close.pressed.connect(_close_overlay)
	header.add_child(close)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	overlay_content = VBoxContainer.new()
	overlay_content.add_theme_constant_override("separation", 8)
	overlay_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(overlay_content)

func _close_overlay() -> void:
	held_upgrade_key = ""
	hold_upgrade_button = null
	if current_overlay:
		current_overlay.queue_free()
		current_overlay = null
		overlay_content = null

func _panel_label(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_color_override("font_color", Color("d9dfd4"))
	overlay_content.add_child(label)

func _panel_button(text: String, action: Callable, disabled: bool = false) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 44
	button.disabled = disabled
	_style_button(button)
	button.pressed.connect(action)
	overlay_content.add_child(button)
	return button

func _style_button(button: Button, compact: bool = false) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("263b30")
	normal.border_color = Color("75865d")
	normal.set_border_width_all(1)
	normal.border_width_bottom = 3
	normal.set_corner_radius_all(8)
	normal.shadow_color = Color(0.025, 0.045, 0.032, 0.9)
	normal.shadow_size = 4 if not compact else 3
	normal.shadow_offset = Vector2(0, 3)
	normal.content_margin_left = 8 if compact else 12
	normal.content_margin_right = 8 if compact else 12
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("385440")
	hover.border_color = Color("d1b76d")
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color("17251e")
	pressed.border_color = Color("dfc174")
	pressed.border_width_bottom = 1
	pressed.border_width_top = 3
	pressed.shadow_size = 0
	var disabled := normal.duplicate() as StyleBoxFlat
	disabled.bg_color = Color("202a24")
	disabled.border_color = Color("3b493f")
	disabled.shadow_size = 0
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("disabled", disabled)
	button.add_theme_stylebox_override("focus", hover)
	button.add_theme_color_override("font_color", Color("e5dec8"))
	button.add_theme_color_override("font_hover_color", Color("fff0bd"))
	button.add_theme_color_override("font_pressed_color", Color("f3d486"))
	button.add_theme_color_override("font_disabled_color", Color("869085"))

func _panel_line_edit(placeholder: String) -> LineEdit:
	var field := LineEdit.new()
	field.placeholder_text = placeholder
	field.custom_minimum_size.y = 42
	overlay_content.add_child(field)
	return field

func _open_game_panel(title: String) -> void:
	match title:
		"캐릭터": _render_character_panel()
		"장비": _render_gear_panel()
		"스킬": _render_skill_panel()
		"던전": _render_zone_panel()
		"퀘스트": _render_quest_panel()
		"상점&뽑기": _render_shop_panel()
		"이벤트": _render_event_panel()
		"우편함": _render_mailbox_panel()
		"메뉴": _render_menu_panel()

func _render_character_panel() -> void:
	_make_overlay("캐릭터 강화")
	var stats := _combat_stats()
	_panel_label("%s · %s · Lv.%s\n전투력 %s · 공격 %s · 방어 %s\nHP %s / %s · XP %s · 처치 %s" % [active_character.get("name", "모험가"), CLASS_NAMES.get(str(game_state.get("classId", "warrior")), "모험가"), _level(), stats.power, stats.attack, stats.defense, game_state.get("hp", 100), stats.max_hp, game_state.get("xp", 0), game_state.get("kills", 0)])
	var modes := HBoxContainer.new()
	overlay_content.add_child(modes)
	for mode in ["gold", "stats"]:
		var button := Button.new()
		button.text = "골드 강화" if mode == "gold" else "레벨 포인트"
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.toggle_mode = true
		button.button_pressed = enhancement_mode == mode
		_style_button(button, true)
		button.pressed.connect(_set_enhancement_mode.bind(mode))
		modes.add_child(button)
	var keys := {"attack":"공격력", "defense":"방어력", "maxHp":"최대 HP", "critChance":"치명타 확률", "critDamage":"치명타 피해", "goldGain":"골드 획득량", "xpGain":"경험치 획득량"}
	var details := {"attack":"공격력 +2", "defense":"방어력 +1", "maxHp":"최대 HP +10" if enhancement_mode == "gold" else "최대 HP +5", "critChance":"치명타 확률 +0.5%", "critDamage":"치명타 피해 +3%" if enhancement_mode == "gold" else "치명타 피해 +2%", "goldGain":"골드 획득 +2%" if enhancement_mode == "gold" else "골드 획득 +1%", "xpGain":"경험치 획득 +2%" if enhancement_mode == "gold" else "경험치 획득 +1%"}
	var upgrades: Dictionary = game_state.get("enhancements", {}).get(enhancement_mode, {})
	for key in keys:
		var level: int = int(upgrades.get(key, 0))
		var cost: int = 150 + level * 125 + level * level * 35
		var text := "%s Lv.%s · %s" % [keys[key], level, details[key]]
		if enhancement_mode == "gold": text += " · 강화 ◈ %s" % cost
		else: text += " · 레벨 포인트 1 사용"
		var button := _panel_button(text, func(): pass, level >= (50 if enhancement_mode == "gold" else 100) or (enhancement_mode == "gold" and int(game_state.get("gold", 0)) < cost) or (enhancement_mode == "stats" and _available_points() < 1))
		button.button_down.connect(_begin_hold_upgrade.bind(key, button))
		button.button_up.connect(_end_hold_upgrade.bind(button))
		button.add_theme_font_size_override("font_size", 13)
	_panel_label("사용 가능한 레벨 포인트: %s" % _available_points())

func _set_enhancement_mode(mode: String) -> void:
	enhancement_mode = mode
	_render_character_panel()

func _upgrade_stat(key: String) -> void:
	if upgrade_busy: return
	if GameApi.developer_mode:
		var upgrades: Dictionary = game_state.get("enhancements", {}).get(enhancement_mode, {})
		var level := int(upgrades.get(key, 0))
		if enhancement_mode == "gold":
			var cost := 150 + level * 125 + level * level * 35
			if level >= 50 or int(game_state.get("gold", 0)) < cost: return
			game_state["gold"] = int(game_state.get("gold", 0)) - cost
		else:
			if level >= 100 or _available_points() < 1: return
		upgrades[key] = level + 1
		if key == "maxHp": game_state["hp"] = mini(_combat_stats().max_hp, int(game_state.get("hp", 100)) + (10 if enhancement_mode == "gold" else 5))
		_apply_game_state()
		if held_upgrade_key.is_empty(): _render_character_panel()
		return
	upgrade_busy = true
	var response: Dictionary = await GameApi.call_api("/api/rpg/character/upgrade", HTTPClient.METHOD_POST, {"mode": enhancement_mode, "key": key})
	upgrade_busy = false
	if response.ok:
		game_state = response.data.get("state", game_state)
		battle.apply_state(game_state)
		_on_state_changed(game_state)
		if held_upgrade_key.is_empty(): _render_character_panel()
	else:
		_panel_label(response.error)

func _begin_hold_upgrade(key: String, button: Button) -> void:
	if button.disabled: return
	held_upgrade_key = key
	hold_upgrade_button = button
	held_upgrade_wait = 1.55
	_upgrade_stat(key)

func _end_hold_upgrade(button: Button) -> void:
	if hold_upgrade_button != button: return
	held_upgrade_key = ""
	hold_upgrade_button = null
	if is_instance_valid(current_overlay): _render_character_panel()

func _level() -> int:
	var xp := int(game_state.get("xp", 0))
	var level := 1
	var needed := 120
	while xp >= needed and level < 60:
		xp -= needed
		level += 1
		needed = 120 + (level - 1) * 45
	return level

func _available_points() -> int:
	var spent := 0
	for value in game_state.get("enhancements", {}).get("stats", {}).values(): spent += int(value)
	return maxi(0, (_level() - 1) * 5 - spent)

func _combat_stats() -> Dictionary:
	var level := _level()
	var attack := level * 2
	var defense := 0
	var items: Array = game_state.get("items", [])
	var equipment: Dictionary = game_state.get("equipment", {})
	for slot in equipment:
		for item in items:
			if item.get("id", "") == equipment[slot]:
				attack += int(item.get("atk", 0)) + int(item.get("enhance", 0)) * 2
				defense += int(item.get("def", 0)) + int(item.get("enhance", 0))
	var class_id := str(game_state.get("classId", active_character.get("classId", "warrior")))
	var pet_level := maxi(1, int(game_state.get("growth", {}).get("petLevel", 1)))
	attack += pet_level - 1
	defense += int({"warrior":7, "archer":1, "mage":0, "gunner":2}.get(class_id, 0))
	defense += floori(float(pet_level - 1) / 5.0)
	var upgrades: Dictionary = game_state.get("enhancements", {})
	attack += (int(upgrades.get("gold", {}).get("attack", 0)) + int(upgrades.get("stats", {}).get("attack", 0))) * 2
	defense += int(upgrades.get("gold", {}).get("defense", 0)) + int(upgrades.get("stats", {}).get("defense", 0))
	var max_hp := 100 + int(upgrades.get("gold", {}).get("maxHp", 0)) * 10 + int(upgrades.get("stats", {}).get("maxHp", 0)) * 5
	var gold_upgrades: Dictionary = upgrades.get("gold", {})
	var stat_upgrades: Dictionary = upgrades.get("stats", {})
	var crit_chance := minf(0.75, 0.05 + (int(gold_upgrades.get("critChance", 0)) + int(stat_upgrades.get("critChance", 0))) * 0.005)
	var crit_damage := 1.5 + int(gold_upgrades.get("critDamage", 0)) * 0.03 + int(stat_upgrades.get("critDamage", 0)) * 0.02
	var attack_speed := 0.0
	if class_id == "archer":
		for item in items:
			if item.get("id", "") == equipment.get("weapon", ""):
				var visual_key := str(item.get("visualKey", ""))
				var tier := 0
				var tier_names := ["epic", "unique", "legendary", "mythic", "immortal"]
				for tier_index in range(tier_names.size()):
					if visual_key.begins_with("bow_" + tier_names[tier_index] + "_"): tier = tier_index + 1
				if visual_key.begins_with("bow_"):
					var variant := 1
					var parts := visual_key.split("_")
					if parts.size() >= 3 and parts[-1].is_valid_int():
						variant = int(parts[-1])
					else:
						var rare_keys := ["bow_ashwood", "bow_moonsteel", "bow_ember", "bow_thornvine", "bow_starfall"]
						variant = rare_keys.find(visual_key) + 1
					var speed_values := [0.0, 0.025, 0.045, 0.065, 0.085, 0.11]
					var crit_values := [0.01, 0.018, 0.026, 0.034, 0.042, 0.05]
					attack_speed = speed_values[tier]
					crit_chance = minf(0.75, crit_chance + crit_values[tier])
					crit_damage += 0.04 + (variant - 1) * 0.012
				break
	var power := level * 12 + attack * 3 + defense * 2 + floori(max_hp * 0.15) + floori(crit_chance * 100) + floori((crit_damage - 1.0) * 20) + roundi(attack_speed * 100)
	return {"attack": attack, "defense": defense, "max_hp": max_hp, "crit_chance": crit_chance, "crit_damage": crit_damage, "power": power}

func _render_gear_panel() -> void:
	_make_overlay("장비")
	_panel_label("장착 장비의 능력치는 자동 전투에 반영됩니다. 사냥 보상으로 장비가 드롭되지 않으며, 상점 뽑기에서만 획득합니다.")
	for slot in ["weapon", "armor", "helmet", "boots", "ring"]:
		var equipped_id: String = str(game_state.get("equipment", {}).get(slot, ""))
		var match_item: Dictionary = {}
		for item in game_state.get("items", []):
			if str(item.get("id", "")) == equipped_id: match_item = item
		var name := str(match_item.get("name", "미장착"))
		var equipped_row := HBoxContainer.new()
		overlay_content.add_child(equipped_row)
		_add_equipment_icon(equipped_row, match_item, slot)
		var equipped_label := Label.new()
		equipped_label.text = "%s · %s" % [{"weapon":"무기", "armor":"갑옷", "helmet":"투구", "boots":"신발", "ring":"반지"}[slot], name]
		equipped_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		equipped_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		equipped_row.add_child(equipped_label)
	for item in game_state.get("items", []):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 5)
		overlay_content.add_child(row)
		var icon_path := _equipment_icon_path(item)
		_add_equipment_icon(row, item, str(item.get("slot", "weapon")))
		var detail := Label.new()
		detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		detail.text = "%s\n공격 %s · 방어 %s · +%s" % [item.get("name", "장비"), item.get("atk", 0), item.get("def", 0), item.get("enhance", 0)]
		detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.add_child(detail)
		var actions := VBoxContainer.new()
		row.add_child(actions)
		var equipped_now: bool = str(game_state.get("equipment", {}).get(str(item.get("slot", "")), "")) == str(item.get("id", ""))
		var equip := Button.new()
		equip.text = "장착" if not equipped_now else "장착 중"
		equip.disabled = equipped_now
		equip.pressed.connect(_gear_action.bind("equip", str(item.get("id", ""))))
		_style_button(equip, true)
		actions.add_child(equip)
		var upgrade := Button.new()
		upgrade.text = "강화"
		upgrade.pressed.connect(_gear_action.bind("upgrade", str(item.get("id", ""))))
		_style_button(upgrade, true)
		actions.add_child(upgrade)
		var salvage := Button.new()
		salvage.text = "분해"
		salvage.disabled = equipped_now
		salvage.pressed.connect(_confirm_salvage.bind(str(item.get("id", ""))))
		_style_button(salvage, true)
		actions.add_child(salvage)

func _equipment_icon_path(item: Dictionary) -> String:
	var key := str(item.get("visualKey", ""))
	# The matching website files for these ten variants are damaged PNGs.
	# Use app-local replacement artwork while preserving the web originals.
	var repaired_art := {"armor_mythic_5":"armor-mythic-5.png", "boots_mythic_5":"boots-mythic-5.png", "helmet_legendary_5":"helmet-legendary-5.png", "ring_epic_1":"ring-epic-1.png", "ring_epic_2":"ring-epic-2.png", "ring_epic_4":"ring-epic-4.png", "ring_mythic_1":"ring-mythic-1.png", "ring_mythic_2":"ring-mythic-2.png", "ring_mythic_5":"ring-mythic-5.png", "ring_unique_1":"ring-unique-1.png"}
	if repaired_art.has(key): return "res://assets/equipment/fallback/" + str(repaired_art[key])
	# Non-archer weapon summons use weapon_<rarity>_<variant> keys. The app
	# previously fell through to the crossed-swords placeholder for every one.
	if key.begins_with("weapon_"):
		var rarity := key.get_slice("_", 1)
		var number := key.get_slice("_", 2)
		if number.is_valid_int():
			match str(game_state.get("classId", "warrior")):
				"archer": return "res://assets/equipment/bows/%s-%s.webp" % [rarity, number]
				"mage": return "res://assets/equipment/weapons/mage-staff.svg"
				"gunner": return "res://assets/equipment/weapons/gunner-pistols.svg"
				_: return "res://assets/equipment/weapons/warrior-sword.svg"
	if key.begins_with("bow_"):
		var names := {"bow_ashwood":"ashwood-bow.png", "bow_moonsteel":"moonsteel-bow.png", "bow_ember":"ember-bow.png", "bow_thornvine":"thornvine-bow.png", "bow_starfall":"starfall-bow.png"}
		var rare_bows := ["ashwood-bow.png", "moonsteel-bow.png", "ember-bow.png", "thornvine-bow.png", "starfall-bow.png"]
		if names.has(key): return "res://assets/equipment/" + names[key]
		if key.begins_with("bow_rare_"):
			var rare_index := int(key.get_slice("_", 2)) - 1
			if rare_index >= 0 and rare_index < rare_bows.size(): return "res://assets/equipment/" + rare_bows[rare_index]
		var tiers := ["epic", "unique", "legendary", "mythic", "immortal"]
		for tier in tiers:
			if key.begins_with("bow_" + tier + "_"):
				return "res://assets/equipment/bows/%s-%s.webp" % [tier, key.get_slice("_", 2)]
	var slots := {"armor":"armor", "helmet":"helmets", "boots":"boots", "ring":"rings"}
	for prefix in slots:
		if key.begins_with(prefix + "_"):
			var rarity := key.get_slice("_", 1)
			var number := key.get_slice("_", 2)
			if number.is_valid_int(): return "res://assets/equipment/%s/%s-%s.png" % [slots[prefix], rarity, number]
	return ""

func _add_equipment_icon(parent: Container, item: Dictionary, slot: String) -> void:
	var rarity := str(item.get("rarity", "common"))
	var rarity_colors := {"common":Color("879080"), "uncommon":Color("79a98d"), "rare":Color("639fc1"), "epic":Color("a584c8"), "unique":Color("d8ad61"), "legendary":Color("79b779"), "mythic":Color("eee9d9"), "immortal":Color("df625d")}
	var frame := PanelContainer.new()
	frame.custom_minimum_size = Vector2(58, 58)
	var frame_style := StyleBoxFlat.new()
	frame_style.bg_color = Color("111913")
	frame_style.border_color = rarity_colors.get(rarity, Color("75865d"))
	frame_style.set_border_width_all(2)
	frame_style.set_corner_radius_all(7)
	frame.add_theme_stylebox_override("panel", frame_style)
	parent.add_child(frame)
	var path := _equipment_icon_path(item)
	if not path.is_empty() and ResourceLoader.exists(path):
		var icon := TextureRect.new()
		icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		icon.offset_left = 4; icon.offset_top = 4; icon.offset_right = -4; icon.offset_bottom = -4
		icon.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture = load(path)
		frame.add_child(icon)
	else:
		var glyph := Label.new()
		glyph.text = str({"weapon":"⚔", "armor":"♜", "helmet":"♙", "boots":"⌁", "ring":"◉"}.get(slot, "◇"))
		glyph.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		glyph.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		glyph.add_theme_font_size_override("font_size", 27)
		glyph.add_theme_color_override("font_color", rarity_colors.get(rarity, Color("d8c88a")))
		frame.add_child(glyph)

func _gear_action(action: String, item_id: String) -> void:
	if GameApi.developer_mode:
		for item in game_state.get("items", []):
			if str(item.get("id", "")) != item_id: continue
			if action == "equip": game_state["equipment"][str(item.get("slot", "weapon"))] = item_id
			elif action == "upgrade":
				var cost := 25 * (int(item.get("enhance", 0)) + 1)
				if int(item.get("enhance", 0)) >= 5 or int(game_state.get("gold", 0)) < cost: _panel_label("골드가 부족하거나 최대 강화입니다."); return
				game_state["gold"] = int(game_state.get("gold", 0)) - cost
				item["enhance"] = int(item.get("enhance", 0)) + 1
				if item.get("slot") == "weapon": item["atk"] = int(item.get("atk", 0)) + 3
				else: item["def"] = int(item.get("def", 0)) + 2
			elif action == "salvage":
				if game_state.get("equipment", {}).values().has(item_id): _panel_label("장착 중인 장비는 분해할 수 없습니다."); return
				game_state["gold"] = mini(9999999, int(game_state.get("gold", 0)) + maxi(4, (int(item.get("atk", 0)) + int(item.get("def", 0)) + 1) * 3))
				game_state["items"] = game_state.items.filter(func(entry): return str(entry.get("id", "")) != item_id)
				break
		_apply_game_state(); _render_gear_panel(); return
	var response: Dictionary = await GameApi.call_api("/api/rpg/gear/action", HTTPClient.METHOD_POST, {"action": action, "itemId": item_id})
	if response.ok:
		game_state = response.data.get("state", game_state)
		battle.apply_state(game_state)
		_on_state_changed(game_state)
		_render_gear_panel()
	else:
		_panel_label(response.error)

func _confirm_salvage(item_id: String) -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "이 장비를 분해하고 골드로 바꿀까요?"
	dialog.confirmed.connect(_gear_action.bind("salvage", item_id))
	add_child(dialog)
	dialog.popup_centered(Vector2i(420, 200))

func _render_skill_panel() -> void:
	_make_overlay("스킬")
	_panel_label("스킬 시스템 작업 중입니다. 웹게임과 동일하게 스킬 목록과 자동 사용은 아직 제공되지 않습니다.")

func _render_zone_panel() -> void:
	_make_overlay("지역 이동")
	var zones := [{"id":"forest", "name":"초록숲", "level":1}, {"id":"ashlands", "name":"잿빛 고원", "level":8}, {"id":"moonharbor", "name":"달빛 항구", "level":18}]
	var current_zone := str(game_state.get("zoneId", "forest"))
	var level := _level()
	_panel_label("현재 지역: %s · 캐릭터 레벨 %s\n지역과 입장 레벨은 웹게임과 같은 서버 기준을 사용합니다." % [_zone_name(current_zone), level])
	for zone in zones:
		var zone_id := str(zone.id)
		var required := int(zone.level)
		var label := "%s · Lv.%s 이상" % [zone.name, required]
		if zone_id == current_zone: label += " · 현재 지역"
		_panel_button(label, _travel_to_zone.bind(zone_id), zone_id == current_zone or level < required)

func _zone_name(zone_id: String) -> String:
	return {"forest":"초록숲", "ashlands":"잿빛 고원", "moonharbor":"달빛 항구"}.get(zone_id, "초록숲")

func _travel_to_zone(zone_id: String) -> void:
	if GameApi.developer_mode:
		var required_level: int = int({"forest":1, "ashlands":8, "moonharbor":18}.get(zone_id, 999))
		if _level() < required_level:
			_panel_label("이 지역은 레벨 %s부터 입장할 수 있습니다." % required_level)
			return
		game_state["zoneId"] = zone_id
		game_state["x"] = 1300
		game_state["y"] = 1070
		game_state["hp"] = maxi(65, int(game_state.get("hp", 100)))
		battle.configure(game_state, active_character)
		GameApi.save_developer_state(game_state, active_character)
		_render_zone_panel()
		return
	var response: Dictionary = await GameApi.call_api("/api/rpg/zone/travel", HTTPClient.METHOD_POST, {"zoneId": zone_id})
	if not response.ok:
		_panel_label(response.error)
		return
	game_state = response.data.get("state", game_state)
	if battle:
		battle.configure(game_state, active_character)
		_on_state_changed(game_state)
	_render_zone_panel()

func _render_quest_panel() -> void:
	_make_overlay("퀘스트·보상")
	var daily: Dictionary = game_state.get("daily", {})
	var weekly: Dictionary = game_state.get("weekly", {})
	var today := Time.get_date_string_from_system()
	if str(daily.get("dayKey", "")) != today:
		daily = {"dayKey":today, "kills":0, "attendanceClaimed":false, "missionClaimed":false}
		game_state["daily"] = daily
	_panel_label("지역 의뢰 진행: %s · %s 처치\n오늘 사냥: %s / 20\n이번 주 사냥: %s / 100" % ["완료" if int(game_state.get("questStage", 0)) >= 2 else "진행 중", game_state.get("questKills", 0), daily.get("kills", 0), weekly.get("kills", 0)])
	_panel_button("출석 보상 받기 · 골드 100 / 캐시 20", _claim_activity.bind("attendance"), bool(daily.get("attendanceClaimed", false)))
	_panel_button("일일 사냥 보상 · 골드 600 / 캐시 25", _claim_activity.bind("daily"), bool(daily.get("missionClaimed", false)) or int(daily.get("kills", 0)) < 20)
	_panel_button("주간 사냥 보상 · 골드 2,500 / 캐시 125", _claim_activity.bind("weekly"), bool(weekly.get("missionClaimed", false)) or int(weekly.get("kills", 0)) < 100)
	var stage := int(game_state.get("questStage", 0))
	var need := 3 if stage == 0 else 5
	var kills := int(game_state.get("questKills", 0))
	_panel_label("지역 의뢰 · %s\n진행 %s / %s · 보상 XP %s · 골드 %s · 캐시 %s" % ["숲길 정찰" if stage == 0 else "고블린 야영지" if stage == 1 else "완료", mini(kills, need), need, 120 if stage == 0 else 300, 80 if stage == 0 else 180, 100 if stage == 0 else 180])
	_panel_button("지역 의뢰 보상 받기", _claim_region_quest, stage >= 2 or kills < need)
	_panel_label("업적")
	for achievement in [{"id":"kills_10", "name":"첫 사냥", "require":10, "gold":100, "cash":0}, {"id":"kills_100", "name":"숙련된 사냥꾼", "require":100, "gold":600, "cash":30}, {"id":"boss_1", "name":"거대한 적", "require":1, "gold":300, "cash":25, "boss":true}, {"id":"level_10", "name":"모험가의 성장", "require":10, "gold":500, "cash":20, "level":true}]:
		var claimed: Array = game_state.get("growth", {}).get("achievementClaims", [])
		var progress := _level() if achievement.get("level", false) else int(game_state.get("growth", {}).get("bossKills", 0)) if achievement.get("boss", false) else int(game_state.get("kills", 0))
		var ready := progress >= int(achievement.require) and not claimed.has(achievement.id)
		_panel_button("%s · 골드 %s / 캐시 %s · %s" % [achievement.name, achievement.gold, achievement.cash, "받기" if ready else "수령 완료" if claimed.has(achievement.id) else "진행 %s/%s" % [progress, achievement.require]], _claim_achievement.bind(achievement), not ready)

func _claim_activity(kind: String) -> void:
	if GameApi.developer_mode:
		var daily: Dictionary = game_state.get("daily", {})
		var weekly: Dictionary = game_state.get("weekly", {})
		var attendance: Dictionary = game_state.get("attendance", {})
		var today := Time.get_date_string_from_system()
		if kind == "attendance":
			if daily.get("attendanceClaimed", false): return
			var streak := 1
			if str(attendance.get("lastDay", "")) != "":
				var today_time := Time.get_unix_time_from_datetime_string(today + "T00:00:00")
				var previous := Time.get_date_string_from_unix_time(today_time - 86400)
				if str(attendance.get("lastDay", "")) == previous: streak = 1 if int(attendance.get("streak", 0)) >= 7 else int(attendance.get("streak", 0)) + 1
			attendance["lastDay"] = today; attendance["streak"] = streak
			daily["attendanceClaimed"] = true; game_state["gold"] = int(game_state.get("gold", 0)) + (700 if streak == 7 else 100); game_state["cash"] = int(game_state.get("cash", 0)) + (100 if streak == 7 else 20); game_state["attendance"] = attendance
		elif kind == "daily":
			if daily.get("missionClaimed", false) or int(daily.get("kills", 0)) < 20: return
			daily["missionClaimed"] = true; game_state["gold"] = int(game_state.get("gold", 0)) + 600; game_state["cash"] = int(game_state.get("cash", 0)) + 25
		else:
			if weekly.get("missionClaimed", false) or int(weekly.get("kills", 0)) < 100: return
			weekly["missionClaimed"] = true; game_state["gold"] = int(game_state.get("gold", 0)) + 2500; game_state["cash"] = int(game_state.get("cash", 0)) + 125
		game_state["daily"] = daily; game_state["weekly"] = weekly; _apply_game_state(); _render_quest_panel(); return
	var response: Dictionary = await GameApi.call_api("/api/rpg/activity/claim", HTTPClient.METHOD_POST, {"type": kind})
	if response.ok:
		game_state = response.data.get("state", game_state)
		battle.apply_state(game_state)
		_on_state_changed(game_state)
		_render_quest_panel()
	else:
		_panel_label(response.error)

func _claim_region_quest() -> void:
	if GameApi.developer_mode:
		var stage := int(game_state.get("questStage", 0))
		var required := 3 if stage == 0 else 5
		if stage >= 2 or int(game_state.get("questKills", 0)) < required: return
		game_state["questStage"] = stage + 1; game_state["questKills"] = 0
		game_state["xp"] = int(game_state.get("xp", 0)) + (120 if stage == 0 else 300)
		game_state["gold"] = int(game_state.get("gold", 0)) + (80 if stage == 0 else 180)
		game_state["cash"] = int(game_state.get("cash", 0)) + (100 if stage == 0 else 180)
		_apply_game_state(); _render_quest_panel(); return
	var response: Dictionary = await GameApi.call_api("/api/rpg/growth/claim", HTTPClient.METHOD_POST, {"type":"quest"})
	if response.ok:
		game_state = response.data.get("state", game_state); _apply_game_state(); _render_quest_panel()
	else: _panel_label(response.error)

func _claim_achievement(achievement: Dictionary) -> void:
	var id := str(achievement.get("id", ""))
	if GameApi.developer_mode:
		var claims: Array = game_state.get("growth", {}).get("achievementClaims", [])
		if claims.has(id): return
		claims.append(id); game_state["growth"]["achievementClaims"] = claims
		game_state["gold"] = int(game_state.get("gold", 0)) + int(achievement.gold)
		game_state["cash"] = int(game_state.get("cash", 0)) + int(achievement.cash)
		_apply_game_state(); _render_quest_panel(); return
	var response: Dictionary = await GameApi.call_api("/api/rpg/growth/claim", HTTPClient.METHOD_POST, {"type":"achievement", "id":id})
	if response.ok:
		game_state = response.data.get("state", game_state); _apply_game_state(); _render_quest_panel()
	else: _panel_label(response.error)

func _render_mailbox_panel() -> void:
	_make_overlay("우편함")
	_panel_label("모험 시작 지원품 · 골드 300 · 캐시 30")
	var claims: Array = game_state.get("growth", {}).get("mailClaims", [])
	_panel_button("받기" if not claims.has("welcome_v1") else "수령 완료", _claim_mail.bind("welcome_v1"), claims.has("welcome_v1"))

func _claim_mail(id: String) -> void:
	if GameApi.developer_mode:
		var claims: Array = game_state.get("growth", {}).get("mailClaims", [])
		if claims.has(id): return
		claims.append(id); game_state["growth"]["mailClaims"] = claims
		game_state["gold"] = int(game_state.get("gold", 0)) + 300; game_state["cash"] = int(game_state.get("cash", 0)) + 30
		_apply_game_state(); _render_mailbox_panel(); return
	var response: Dictionary = await GameApi.call_api("/api/rpg/growth/claim", HTTPClient.METHOD_POST, {"type":"mail", "id":id})
	if response.ok:
		game_state = response.data.get("state", game_state); _apply_game_state(); _render_mailbox_panel()
	else: _panel_label(response.error)

func _render_event_panel() -> void:
	_make_overlay("이벤트")
	if GameApi.developer_mode:
		_panel_label("협동 레이드는 웹게임에서만 실시간 이벤트 서버에 연결됩니다. 계정 없는 개발자 모드에는 임시 레이드가 없습니다.")
	else:
		_panel_label("웹게임의 실시간 협동 레이드와 같은 이벤트 서버를 연결하는 Godot 클라이언트는 아직 이 앱에 포함되지 않았습니다.")
		_panel_label("현재 앱에서는 레이드 생성·참가·보스 전투 보상이 동작하지 않습니다.")

func _render_shop_panel() -> void:
	_make_overlay("상점 & 장비 뽑기")
	_panel_label("골드 %s · 캐시 %s\n원하는 장비 부위를 선택해 전용 뽑기를 열어 주세요." % [game_state.get("gold", 0), game_state.get("cash", 0)])
	for slot in ["weapon", "ring", "armor", "boots", "helmet"]:
		var category: String = {"weapon":"무기", "ring":"반지", "armor":"갑옷", "boots":"신발", "helmet":"투구"}[slot]
		_panel_button("%s 뽑기 열기  ›" % category, _render_shop_category.bind(slot))

func _render_shop_category(slot: String) -> void:
	gacha_slot = slot
	var category: String = {"weapon":"무기", "ring":"반지", "armor":"갑옷", "boots":"신발", "helmet":"투구"}.get(slot, "장비")
	_make_overlay("%s 전용 뽑기" % category)
	_panel_button("‹ 장비 종류 선택", _render_shop_panel)
	_panel_label("%s 뽑기 · 골드 %s · 캐시 %s" % [category, game_state.get("gold", 0), game_state.get("cash", 0)])
	_panel_label("확률: 레어 80% · 에픽 15% · 유니크 4% · 레전드리 0.9% · 신화 0.09% · 불멸 0.01%")
	var pity: Dictionary = game_state.get("summonPity", {})
	_panel_label("10회 뽑기는 레어 이상 1개 보장 · 에픽 천장 %s/30 · 레전드리 천장 %s/100" % [pity.get("epic", 0), pity.get("legendary", 0)])
	for currency in ["gold", "cash"]:
		var title := "골드" if currency == "gold" else "캐시"
		_panel_button("1회 · %s %s" % [title, "500" if currency == "gold" else "100"], _summon.bind(currency, 1))
		_panel_button("10회 · %s %s" % [title, "4,500" if currency == "gold" else "900"], _summon.bind(currency, 10))
	var history: Array = game_state.get("summonHistory", [])
	if not history.is_empty():
		_panel_label("최근 뽑기: %s · %s회" % [history[0].get("slot", "장비"), history[0].get("count", 1)])

func _summon(currency: String, count: int) -> void:
	if GameApi.developer_mode:
		var cost := (500 if count == 1 else 4500) if currency == "gold" else (100 if count == 1 else 900)
		if int(game_state.get(currency, 0)) < cost: _panel_label("재화가 부족합니다."); return
		var items: Array = game_state.get("items", [])
		if items.size() + count > 60: _panel_label("가방 공간이 부족합니다."); return
		game_state[currency] = int(game_state.get(currency, 0)) - cost
		var tiers := [{"id":"rare", "weight":8000, "label":"레어", "mult":1.8}, {"id":"epic", "weight":1500, "label":"에픽", "mult":2.5}, {"id":"unique", "weight":400, "label":"유니크", "mult":3.1}, {"id":"legendary", "weight":90, "label":"레전드리", "mult":4.1}, {"id":"mythic", "weight":9, "label":"신화", "mult":5.3}, {"id":"immortal", "weight":1, "label":"불멸", "mult":7.0}]
		var obtained := PackedStringArray()
		var pity: Dictionary = game_state.get("summonPity", {"epic":0, "legendary":0})
		var rare_plus := false
		var duplicate_gold := {"rare":350, "epic":1200, "unique":2200, "legendary":4000, "mythic":8000, "immortal":16000}
		for index in range(count):
			var roll := randi_range(0, 9999); var edge := 0; var tier: Dictionary = tiers[0]
			for candidate in tiers:
				edge += int(candidate.weight)
				if roll < edge: tier = candidate; break
			if int(pity.get("legendary", 0)) >= 99: tier = tiers[3]
			elif int(pity.get("epic", 0)) >= 29: tier = tiers[1]
			elif count == 10 and index == count - 1 and not rare_plus: tier = tiers[0]
			var tier_index := tiers.find(tier)
			if tier_index >= 3: pity["legendary"] = 0
			else: pity["legendary"] = mini(99, int(pity.get("legendary", 0)) + 1)
			if tier_index >= 1: pity["epic"] = 0
			else: pity["epic"] = mini(29, int(pity.get("epic", 0)) + 1)
			rare_plus = true
			var number := randi_range(1, 5); var rarity: String = tier.id
			var slot_names := {"weapon":"무기", "armor":"갑옷", "helmet":"투구", "boots":"신발", "ring":"반지"}
			var visual := ("bow_%s_%s" % [rarity, number]) if gacha_slot == "weapon" and game_state.get("classId") == "archer" else "%s_%s_%s" % [gacha_slot, rarity, number]
			var base := maxi(1, roundi(float(_level()) * float(tier.mult) * 2.5))
			var gear_name := "%s %s %s" % [tier.label, slot_names[gacha_slot], number]
			var item := {"id":"gacha_%s_%s" % [Time.get_ticks_msec(), index], "visualKey":visual, "name":gear_name, "slot":gacha_slot, "rarity":rarity, "atk":base if gacha_slot == "weapon" else maxi(1, floori(base * 0.4)) if gacha_slot == "ring" else 0, "def":floori(base * 0.22) if gacha_slot == "weapon" else maxi(1, floori(base * (0.55 if gacha_slot == "ring" else 0.8))), "enhance":0}
			var duplicate := false
			for owned in items:
				if str(owned.get("name", "")) == gear_name and str(owned.get("slot", "")) == gacha_slot: duplicate = true; break
			if duplicate:
				item["duplicate"] = true
				item["goldRefund"] = int(duplicate_gold.get(rarity, 80))
				game_state["gold"] = mini(9999999, int(game_state.get("gold", 0)) + int(item.goldRefund))
			else: items.append(item)
			obtained.append(str(item.name) + (" · 중복 골드 +%s" % item.goldRefund if duplicate else ""))
		game_state["items"] = items
		game_state["summonPity"] = pity
		game_state["summonHistory"] = [{"slot":gacha_slot, "count":count}] + game_state.get("summonHistory", []).slice(0, 9)
		_apply_game_state(); _render_shop_category(gacha_slot); _panel_label("획득 결과\n" + "\n".join(obtained)); return
	var response: Dictionary = await GameApi.call_api("/api/rpg/gacha", HTTPClient.METHOD_POST, {"currency": currency, "count": count, "slot": gacha_slot})
	if response.ok:
		game_state = response.data.get("state", game_state)
		battle.apply_state(game_state)
		_on_state_changed(game_state)
		_render_shop_category(gacha_slot)
		var obtained: Array = response.data.get("items", [])
		var names := PackedStringArray()
		for item in obtained: names.append(str(item.get("name", "장비")))
		_panel_label("획득 결과\n" + "\n".join(names))
	else:
		_panel_label(response.error)

func _render_menu_panel() -> void:
	_make_overlay("메뉴")
	_panel_button("공지사항", _show_announcement)
	_panel_button("커뮤니티 · 순위", _show_rankings)
	_panel_button("몬스터 도감", _show_bestiary)
	_panel_button("저장하기", _save_progress)
	_panel_button("나가기", _leave_battle)
	_panel_button("로그아웃", _confirm_logout)

func _apply_game_state() -> void:
	if battle:
		battle.apply_state(game_state)
		_on_state_changed(game_state)
	if GameApi.developer_mode:
		GameApi.save_developer_state(game_state, active_character)

func _show_announcement() -> void:
	var response: Dictionary = await GameApi.call_api("/api/rpg/announcement")
	if response.ok:
		var announcement: Variant = response.data.get("announcement", null)
		if announcement is Dictionary:
			_panel_label("%s\n%s" % [announcement.get("title", "공지사항"), announcement.get("body", "")])
		else:
			_panel_label("현재 등록된 공지가 없습니다.")
	else:
		_panel_label(response.error)

func _show_rankings() -> void:
	if GameApi.developer_mode:
		_panel_label("온라인 랭킹·클랜은 계정 모드에서 이용할 수 있습니다. 개발자 모드 진행도는 공개되지 않습니다.")
		_panel_button("지원대 전투 " + ("끄기" if bool(game_state.get("partyEnabled", true)) else "켜기"), _toggle_party)
		return
	var response: Dictionary = await GameApi.call_api("/api/rpg/social/rankings")
	if not response.ok:
		_panel_label(response.error)
		return
	var entries: Array = response.data.get("rankings", [])
	community_opted_in = bool(response.data.get("mine", {}).get("optedIn", false))
	for index in range(entries.size()):
		var entry: Dictionary = entries[index]
		_panel_label("%s위 · %s · Lv.%s · 점수 %s" % [index + 1, entry.get("alias", "모험가"), entry.get("level", 1), entry.get("score", 0)])
	if entries.is_empty(): _panel_label("공개 순위 기록이 아직 없습니다.")
	_panel_label("공개 랭킹은 캐릭터 별칭·직업·레벨·점수만 표시합니다.")
	_panel_button("공개 랭킹 " + ("참여 중 · 해제" if community_opted_in else "참여하기"), _toggle_app_ranking)
	var clan_response: Dictionary = await GameApi.call_api("/api/rpg/social/clan")
	if not clan_response.ok:
		_panel_label(clan_response.error)
		return
	community_clan = clan_response.data.get("clan", {}) if clan_response.data.get("clan", null) is Dictionary else {}
	community_weekly_claimed = bool(clan_response.data.get("weeklyClaimed", false))
	if community_clan.is_empty():
		_panel_label("클랜에 가입해 협동 사냥에 참여할 수 있습니다.")
		var clan_name := _panel_line_edit("새 클랜 이름 · 2~16자")
		_panel_button("클랜 만들기", _clan_action.bind("create", clan_name, null))
		var invite := _panel_line_edit("클랜 초대 코드")
		_panel_button("클랜 가입", _clan_action.bind("join", null, invite))
	else:
		_panel_label("%s · %s명\n초대 코드 %s · 주간 사냥 %s / %s" % [community_clan.get("name", "클랜"), community_clan.get("memberCount", 1), community_clan.get("inviteCode", ""), community_clan.get("weeklyKills", 0), community_clan.get("weeklyGoal", 100)])
		_panel_button("주간 클랜 보상 받기 · 골드 500 / 캐시 20", _claim_clan_reward, community_weekly_claimed or int(community_clan.get("weeklyKills", 0)) < 100)
		_panel_button("클랜 탈퇴", _clan_action.bind("leave", null, null))
	_panel_button("지원대 전투 " + ("끄기" if bool(game_state.get("partyEnabled", true)) else "켜기"), _toggle_party)

func _toggle_app_ranking() -> void:
	var opt_in := not community_opted_in
	if opt_in:
		var dialog := ConfirmationDialog.new()
		dialog.dialog_text = "캐릭터 별칭, 직업, 레벨, 전투 점수가 공개 랭킹에 표시됩니다. 참여할까요?"
		dialog.confirmed.connect(_set_ranking_opt_in.bind(true))
		add_child(dialog); dialog.popup_centered(Vector2i(480, 220)); return
	await _set_ranking_opt_in(false)

func _set_ranking_opt_in(opt_in: bool) -> void:
	var response: Dictionary = await GameApi.call_api("/api/rpg/social/ranking", HTTPClient.METHOD_POST, {"optIn":opt_in, "alias":str(active_character.get("name", "모험가"))})
	if response.ok: community_opted_in = opt_in; _render_menu_panel(); await _show_rankings()
	else: _panel_label(response.error)

func _clan_action(action: String, name_field: LineEdit = null, invite_field: LineEdit = null) -> void:
	var payload := {"action":action, "alias":str(active_character.get("name", "모험가"))}
	if action == "create" and name_field: payload["name"] = name_field.text.strip_edges()
	if action == "join" and invite_field: payload["code"] = invite_field.text.strip_edges().to_upper()
	var response: Dictionary = await GameApi.call_api("/api/rpg/social/clan", HTTPClient.METHOD_POST, payload)
	if response.ok: _render_menu_panel(); await _show_rankings()
	else: _panel_label(response.error)

func _claim_clan_reward() -> void:
	var response: Dictionary = await GameApi.call_api("/api/rpg/social/clan/claim", HTTPClient.METHOD_POST, {})
	if response.ok:
		game_state = response.data.get("state", game_state); _apply_game_state(); _render_menu_panel(); await _show_rankings()
	else: _panel_label(response.error)

func _toggle_party() -> void:
	game_state["partyEnabled"] = not bool(game_state.get("partyEnabled", true))
	_apply_game_state(); _render_menu_panel(); await _show_rankings()

func _show_bestiary() -> void:
	for kind in ["slime", "forest_wolf", "ash_goblin", "ash_wolf", "raider", "reef_wraith", "forest_guardian", "ash_golem", "sea_leviathan"]:
		_panel_label("%s · 처치 %s" % [{"slime":"숲 슬라임", "forest_wolf":"숲 늑대", "ash_goblin":"잿빛 고블린", "ash_wolf":"잿불 늑대", "raider":"항구 약탈자", "reef_wraith":"산호 망령", "forest_guardian":"숲의 수호자", "ash_golem":"잿빛 거신", "sea_leviathan":"심해의 레비아탄"}[kind], game_state.get("bestiary", {}).get(kind, 0)])

func _confirm_logout() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "현재 캐릭터를 저장하고 로그아웃할까요?"
	dialog.confirmed.connect(_logout)
	add_child(dialog)
	dialog.popup_centered(Vector2i(420, 200))

func _leave_battle() -> void:
	await _save_progress()
	_close_overlay()
	for layer in [battle, battle_hud, battle_footer]:
		if layer: layer.queue_free()
	battle = null
	battle_hud = null
	battle_footer = null
	battle_notice_label = null
	if GameApi.developer_mode:
		GameApi.developer_mode = false
		_show_auth()
		return
	await _show_characters()

func _on_state_changed(value: Dictionary) -> void:
	game_state = value
	if battle_gold: battle_gold.text = "◈ %s" % str(game_state.get("gold", 0))
	if battle_cash: battle_cash.text = "✧ %s" % str(game_state.get("cash", 0))
	if battle_power: battle_power.text = "전투력 %s" % _combat_stats().power
	if battle_hp: battle_hp.text = "HP %s" % str(game_state.get("hp", 100))
	if battle_identity:
		battle_identity.text = "%s · Lv.%s" % [active_character.get("name", "모험가"), _level()]
	if int(game_state.get("kills", 0)) - last_saved_kills >= 5:
		_save_progress()

func _show_battle_notice(message: String) -> void:
	if battle_notice_label:
		battle_notice_label.text = message

func _process(delta: float) -> void:
	if not held_upgrade_key.is_empty():
		held_upgrade_wait -= delta
		if held_upgrade_wait <= 0.0:
			_upgrade_stat(held_upgrade_key)
			held_upgrade_wait = 1.55
	if battle:
		save_timer += delta
		if save_timer >= 25.0:
			save_timer = 0.0
			_save_progress()

func _save_progress() -> void:
	if not battle or busy: return
	game_state = battle.export_state()
	if GameApi.developer_mode:
		GameApi.save_developer_state(game_state, active_character)
		last_saved_kills = int(game_state.get("kills", 0))
		return
	busy = true
	var response: Dictionary = await GameApi.call_api("/api/rpg/save", HTTPClient.METHOD_POST, game_state)
	busy = false
	if not response.ok:
		_show_battle_notice("저장에 실패했습니다 · " + response.error)
		return
	game_state = response.data.get("rpg", game_state)
	last_saved_kills = int(game_state.get("kills", 0))
	if battle:
		battle.apply_state(game_state)
		_on_state_changed(game_state)

func _logout() -> void:
	if battle:
		await _save_progress()
		for layer in [battle, battle_hud, battle_footer, current_overlay]:
			if layer: layer.queue_free()
		battle = null
		battle_hud = null
		battle_footer = null
		current_overlay = null
	if GameApi.developer_mode:
		GameApi.developer_mode = false
	else:
		await GameApi.logout()
	_show_auth()


