// Archer weapon catalog. Rare bows reuse the five original in-world sprites;
// higher tiers use their own framed catalog artwork as equipped appearances.
const tiers = {
  rare: [
    ['bow_ashwood', '솔바람 장궁', '/assets/equipment/ashwood-bow.png'],
    ['bow_moonsteel', '월강성궁', '/assets/equipment/moonsteel-bow.png'],
    ['bow_ember', '잿불 파쇄궁', '/assets/equipment/ember-bow.png'],
    ['bow_thornvine', '가시덩굴 정령궁', '/assets/equipment/thornvine-bow.png'],
    ['bow_starfall', '별빛 왕관궁', '/assets/equipment/starfall-bow.png']
  ],
  epic: [
    ['bow_epic_1', '달무리 이중궁', 'epic-1.webp'], ['bow_epic_2', '공명 천공궁', 'epic-2.webp'], ['bow_epic_3', '가시 군주의 흑궁', 'epic-3.webp'],
    ['bow_epic_4', '비전 고리활', 'epic-4.webp'], ['bow_epic_5', '자수정 파쇄궁', 'epic-5.webp']
  ],
  unique: [
    ['bow_unique_1', '태양의 파열궁', 'unique-1.webp'], ['bow_unique_2', '황금 매의 분할궁', 'unique-2.webp'], ['bow_unique_3', '용골 사냥활', 'unique-3.webp'],
    ['bow_unique_4', '시계장치 발리스타', 'unique-4.webp'], ['bow_unique_5', '금사 비단뱀궁', 'unique-5.webp']
  ],
  legendary: [
    ['bow_legendary_1', '새싹 여왕의 생명궁', 'legendary-1.webp'], ['bow_legendary_2', '비늘용의 옥궁', 'legendary-2.webp'], ['bow_legendary_3', '잎새 춤 장궁', 'legendary-3.webp'],
    ['bow_legendary_4', '고대 뿔사냥궁', 'legendary-4.webp'], ['bow_legendary_5', '숲 수호자의 쌍날궁', 'legendary-5.webp']
  ],
  mythic: [
    ['bow_mythic_1', '성운의 고리활', 'mythic-1.webp'], ['bow_mythic_2', '백익의 깃궁', 'mythic-2.webp'], ['bow_mythic_3', '순백 다이아궁', 'mythic-3.webp'],
    ['bow_mythic_4', '은월 화염궁', 'mythic-4.webp'], ['bow_mythic_5', '무지개 유리궁', 'mythic-5.webp']
  ],
  immortal: [
    ['bow_immortal_1', '용암 균열 흑궁', 'immortal-1.webp'], ['bow_immortal_2', '혈룡의 날개궁', 'immortal-2.webp'], ['bow_immortal_3', '삼지창 전쟁궁', 'immortal-3.webp'],
    ['bow_immortal_4', '진홍 유골궁', 'immortal-4.webp'], ['bow_immortal_5', '적월 궤도궁', 'immortal-5.webp']
  ]
};
const labels = { rare: '레어', epic: '에픽', unique: '유니크', legendary: '레전드리', mythic: '신화', immortal: '불멸' };
export const ARCHER_BOW_CATALOG = Object.freeze(Object.entries(tiers).flatMap(([rarity, entries]) => entries.map(([key, name, file]) => {
  const src = rarity === 'rare' ? file : `/assets/equipment/bows/${file}`;
  return Object.freeze({ key, name, rarity, rarityLabel: labels[rarity], src, iconSrc: src, slot: 'weapon', width: rarity === 'rare' ? 42 : 54, height: rarity === 'rare' ? 68 : 54, grip: rarity === 'rare' ? { x: 0.44, y: 0.5 } : { x: 0.5, y: 0.5 }, animation: { swingRadians: 0.035 } });
})));
const armorAppearance = {
  common: { color: '#9b7952', accent: '#d2b078', variant: 0 },
  uncommon: { color: '#557b65', accent: '#a5c795', variant: 1 },
  rare: { color: '#456f91', accent: '#9bd0e8', variant: 2 },
  epic: { color: '#76538f', accent: '#d4a8ed', variant: 0 },
  unique: { color: '#9a762f', accent: '#f1d479', variant: 1 },
  legendary: { color: '#477747', accent: '#a6dc8e', variant: 2 },
  mythic: { color: '#9b9a91', accent: '#fff5d5', variant: 0 },
  immortal: { color: '#943d3b', accent: '#f19986', variant: 1 }
};
const sharedArmorVisuals = Object.fromEntries(
  ['armor', 'boots', 'ring'].flatMap(slot => Object.entries(armorAppearance).map(([rarity, appearance]) => [
    `${slot}_${rarity}`,
    Object.freeze({ slot, appearance: Object.freeze({ ...appearance }) })
  ]))
);
sharedArmorVisuals.starter_coat = Object.freeze({ slot: 'armor', appearance: Object.freeze({ ...armorAppearance.common, variant: 2 }) });
sharedArmorVisuals.starter_boots = Object.freeze({ slot: 'boots', appearance: Object.freeze({ color: '#554637', accent: '#d0ad72', variant: 1 }) });
sharedArmorVisuals.starter_ring = Object.freeze({ slot: 'ring', appearance: Object.freeze({ color: '#805a27', accent: '#edc45b', variant: 2 }) });

export const EQUIPMENT_VISUALS = Object.freeze({
  ...Object.fromEntries(ARCHER_BOW_CATALOG.map(({ key, ...visual }) => [key, visual])),
  ...sharedArmorVisuals
});
