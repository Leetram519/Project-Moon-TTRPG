import { itemPickerHost, itemPickerRows, pickRadioRow } from "../apps/dialog-wait.js";

export function getDeclareSkillOptions(actor, skillType = "attack") {
  if (!actor) return [];
  const want = String(skillType ?? "attack").toLowerCase();
  return actor.items
    .filter(item => item.type === "skill" && String(item.system?.skillType ?? "attack").toLowerCase() === want)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildDeclaredSkillTemplateData(skill, consumeLight = true) {
  if (!skill) return {};
  return {
    skillId: skill.id,
    skillName: skill.name,
    consumeSkillLight: consumeLight !== false,
  };
}

export async function promptDeclareSkillDialog(actor, {
  skillType = "attack",
  hostItem = null,
} = {}) {
  if (!actor) return { skill: null, consumeLight: false };

  const skills = getDeclareSkillOptions(actor, skillType);
  if (!skills.length) return { skill: null, consumeLight: false };

  const lightCost = game.i18n.localize("PMTTRPG.SkillLightCost");
  const rows = await itemPickerRows(skills, "", null);
  const pick = await pickRadioRow({
    title: game.i18n.localize("PMTTRPG.Clash.ChooseSkill"),
    host: hostItem ? await itemPickerHost(hostItem, hostItem.system?.offensiveDiceComputed) : null,
    inputName: "skillId",
    rows: [
      { id: "", name: game.i18n.localize("PMTTRPG.Clash.NoSkill"), checked: true },
      ...rows.map((row, i) => ({ ...row, meta: `${lightCost}: ${Math.max(0, Number(skills[i].system?.lightCost ?? 0))}` })),
    ],
    toggle: { label: game.i18n.localize("PMTTRPG.Dialog.consumeLight"), checked: true },
  });
  if (!pick) return null;
  const skill = actor.items.get(pick.id) ?? null;
  return { skill, consumeLight: !!skill && pick.checked };
}
