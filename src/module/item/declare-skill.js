import { PMTTRPGUtility } from "../utility.js";
import { waitForChoice } from "../apps/dialog-wait.js";
const { renderTemplate } = foundry.applications.handlebars;

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

  const dialogData = {
    host: hostItem ? {
      name: hostItem.name,
      img: hostItem.img,
    } : null,
    skillType,
    skillOptions: skills.map(item => ({
      id: item.id,
      name: item.name,
      img: item.img,
      lightCost: Math.max(0, Number(item.system?.lightCost ?? 0)),
    })),
    consumeLight: true,
  };

  const html = await renderTemplate(
    "systems/projectmoonttrpg/templates/dialog/declare-skill-dialog.html",
    dialogData,
  );

  const dlgOptions = { classes: ["projectmoonttrpg", "PMTTRPG-dialog"] };
  if (PMTTRPGUtility.nightmode) dlgOptions.classes.push("nightmode");

  return waitForChoice({
    window: { title: game.i18n.localize("PMTTRPG.Clash.ChooseSkill") },
    classes: dlgOptions.classes,
    content: html,
    buttons: [{
      action: "confirm",
      label: game.i18n.localize("PMTTRPG.Dialog.roll"),
      default: true,
      callback: (event, button, dialog) => {
        const form = dialog.element.querySelector("form");
        const skillId = form?.querySelector("[name='skillId']:checked")?.value ?? "";
        const consumeLight = !!form?.querySelector("[name='consumeLight']")?.checked;
        if (!skillId) return { skill: null, consumeLight: false };
        const skill = actor.items.get(skillId);
        if (!skill) return { skill: null, consumeLight: false };
        return { skill, consumeLight };
      },
    }, {
      action: "cancel",
      label: game.i18n.localize("PMTTRPG.Dialog.cancel"),
      callback: () => null,
    }],
    rejectClose: false,
  });
}
