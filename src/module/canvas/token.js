import { groupStatuses, onStatusItemChange } from "../status/group-statuses.js";

const VISIBLE_CAP = 5;

export class TokenPMTTRPG extends Token {
  /** @type {PIXI.Container|null} */
  statusBadges = null;
  
  /** @type {PIXI.Container|null} */ 
  rangeVisualizer = null;

  #statusHover = false;
  #badgeDrawId = 0;
  #pendingBreathTicks = new Set();

  /** @override */
  async _draw(options) {
    await super._draw(options);
    this.#createStatusBadgeContainer();
    await this.drawStatusBadges();
  }

  /** @override */
  _destroy(options) {
    this.#clearPendingBreath();
    this.#destroyRangeVisualizer();
    this.statusBadges = null;
    super._destroy(options);
  }

  /** @override */
  _refreshSize() {
    super._refreshSize();
    void this.drawStatusBadges();
  }

  /** @override */
  _onHoverIn(event, options) {
    const result = super._onHoverIn(event, options);
    this.#statusHover = true;
    void this.drawStatusBadges();
    return result;
  }

  /** @override */
  _onHoverOut(event) {
    this.#statusHover = false;
    void this.drawStatusBadges();
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */
  /* ------------ RANGE VISUALIZER -------------- */
  /* -------------------------------------------- */

  #createRangeVisualizer() { 
    this.#destroyRangeVisualizer(); 
    this.rangeVisualizer = this.addChild(new PIXI.Container()); 
    this.rangeVisualizer.name = "pmttrpgRangeVisualizer"; 
    this.rangeVisualizer.eventMode = "none"; 
    this.rangeVisualizer.visible = false; 
  } 
  
  #destroyRangeVisualizer() { 
    if (!this.rangeVisualizer) return; 
    this.rangeVisualizer.destroy({ children: true }); 
    this.rangeVisualizer = null; 
  } 
  
  /** 
   * Show a square weapon range around this token. 
   * @param {number} range Number of grid spaces in each direction. 
  */ 
  showWeaponRange(range) { 
    if (this.destroyed || !canvas?.ready || !canvas?.interface) return;

    this.#createRangeVisualizer();
    this.#drawWeaponRange(range); 
  } 
  
  hideWeaponRange() { 
    if (!this.rangeVisualizer) return; 
    this.rangeVisualizer.visible = false; 
    for (const child of this.rangeVisualizer.removeChildren()) { 
      child.destroy({ children: true }); 
    } 
  } 
  
  #drawWeaponRange(range) { 
    if (!this.rangeVisualizer || this.destroyed) return; 
    range = Math.max(0, Math.floor(Number(range) || 0)); 
    for (const child of this.rangeVisualizer.removeChildren()) { 
      child.destroy({ children: true }); 
    } 
    
    if (range <= 0) { 
      this.rangeVisualizer.visible = false; 
      return; 
    } 
    const gridSize = canvas.grid.size; 
    
    // Token's top-left corner in canvas-local coordinates. 
    // Because this container is a child of the token, its origin is 
    // already the token's top-left corner. 
    const tokenWidth = this.w; 
    const tokenHeight = this.h; 
    
    // Number of grid spaces occupied by the token. 
    const tokenGridWidth = Math.max( 1, Math.round(tokenWidth / gridSize), ); 
    const tokenGridHeight = Math.max( 1, Math.round(tokenHeight / gridSize), ); 
    const minX = -range * gridSize; const minY = -range * gridSize; 
    const maxX = (tokenGridWidth + range) * gridSize; 
    const maxY = (tokenGridHeight + range) * gridSize; 
    const fillColor = 0xff0000; 
    const fillAlpha = 0.16; 
    const borderAlpha = 0.45; 

    for (let x = minX; x < maxX; x += gridSize) { 
      for (let y = minY; y < maxY; y += gridSize) { 
        // Don't highlight the squares occupied by the token itself. 
        const insideToken = x >= 0 && x < tokenWidth && y >= 0 && y < tokenHeight; 
        if (insideToken) continue; 
        const cell = new PIXI.Graphics(); 
        cell.eventMode = "none"; 
        if (typeof cell.rect === "function") { 
          cell 
            .rect( x + 1, y + 1, gridSize - 2, gridSize - 2, ) 
            .fill({ color: fillColor, alpha: fillAlpha, }) 
            .stroke({ color: fillColor, alpha: borderAlpha, width: 1, }); 
          } 
        else { 
          // Compatibility with older Pixi/Foundry versions. 
          cell.beginFill(fillColor, fillAlpha); 
          cell.lineStyle(1, fillColor, borderAlpha); 
          cell.drawRect( x + 1, y + 1, gridSize - 2, gridSize - 2, ); 
          cell.endFill(); 
        } 
        this.rangeVisualizer.addChild(cell); 
      } 
    } 
    this.rangeVisualizer.visible = true; 
  }

  /* -------------------------------------------- */
  /* -------------- STATUS ICONS ---------------- */
  /* -------------------------------------------- */

  #clearPendingBreath() {
    const ticker = canvas?.app?.ticker;
    for (const tick of this.#pendingBreathTicks) {
      ticker?.remove(tick);
    }
    this.#pendingBreathTicks.clear();
  }

  #attachPendingBreath(entry) {
    const ticker = canvas?.app?.ticker;
    if (!ticker || !entry) return;
    const start = performance.now();
    const tick = () => {
      if (!entry || entry.destroyed || !this.statusBadges || this.destroyed) {
        ticker.remove(tick);
        this.#pendingBreathTicks.delete(tick);
        return;
      }
      const t = (performance.now() - start) / 2200;
      const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      entry.alpha = 0.38 + wave * 0.5;
    };
    this.#pendingBreathTicks.add(tick);
    ticker.add(tick);
    tick();
  }

  #createStatusBadgeContainer() {
    this.#clearPendingBreath();
    this.statusBadges?.destroy({ children: true });
    this.statusBadges = this.addChild(new PIXI.Container());
    this.statusBadges.name = "pmttrpgStatusBadges";
    this.statusBadges.eventMode = "none";
    this.statusBadges.sortableChildren = false;
  }

  async drawStatusBadges() {
    if (!this.statusBadges || this.destroyed) return;

    const drawId = ++this.#badgeDrawId;
    this.#clearPendingBreath();
    for (const child of this.statusBadges.removeChildren()) {
      child.destroy({ children: true });
    }

    const enabled = game.settings.get("projectmoonttrpg", "showTokenStatusBadges");
    const actor = this.actor;
    if (!enabled || !actor) {
      this.statusBadges.visible = false;
      return;
    }

    const all = groupStatuses(actor, { sort: "display" });
    if (!all.length) {
      this.statusBadges.visible = false;
      return;
    }

    const overflowCount = (!this.#statusHover && all.length > VISIBLE_CAP)
      ? all.length - VISIBLE_CAP
      : 0;
    const visible = this.#statusHover ? all : all.slice(0, VISIBLE_CAP);

    // Scale icons to fit the visible row across the token.
    const pad = Math.max(2, Math.round(Math.min(this.w, this.h) * 0.03));
    const maxRowWidth = Math.max(1, this.w - pad * 2);
    const entryGap = Math.max(1, Math.round(maxRowWidth * 0.015));
    const rowGap = Math.max(1, Math.round(maxRowWidth * 0.012));
    const slots = VISIBLE_CAP;
    const iconSize = Math.max(
      10,
      Math.min(
        Math.floor((maxRowWidth - entryGap * (slots - 1)) / slots),
        Math.floor(this.h * 0.34),
      ),
    );
    const numSize = Math.max(10, Math.round(iconSize * 0.6));

    const PreciseText = foundry.canvas.containers.PreciseText;
    const textStyleOpts = {
      fontFamily: CONFIG.defaultFontFamily || "Signika, sans-serif",
      fontSize: numSize,
      fill: "#ffffff",
      stroke: "#000000",
      strokeThickness: Math.max(1, Math.round(numSize * 0.18)),
      dropShadow: true,
      dropShadowColor: "#000000",
      dropShadowBlur: 1,
      dropShadowDistance: 0,
      dropShadowAlpha: 0.65,
      align: "center",
    };
    const textStyle = PreciseText.getTextStyle(textStyleOpts);
    const pendingTextStyle = PreciseText.getTextStyle({
      ...textStyleOpts,
      fill: "#c8c8c8",
    });

    const entries = [];
    for (const status of visible) {
      if (drawId !== this.#badgeDrawId) return;
      const entry = await this.#buildBadgeEntry(
        status,
        iconSize,
        status.pending ? pendingTextStyle : textStyle,
        PreciseText,
      );
      if (drawId !== this.#badgeDrawId) {
        entry?.destroy({ children: true });
        return;
      }
      if (entry) entries.push(entry);
    }

    if (overflowCount > 0 && entries.length) {
      this.#attachOverflowBadge(entries[entries.length - 1], iconSize, overflowCount, PreciseText);
    }

    if (drawId !== this.#badgeDrawId) {
      for (const e of entries) e.destroy({ children: true });
      return;
    }

    const slotW = iconSize;
    const slotH = iconSize + Math.max(2, Math.round(iconSize * 0.12));
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;
    let rowWidth = 0;
    let maxWidth = 0;

    for (const entry of entries) {
      if (cursorX > 0 && cursorX + slotW > maxRowWidth + 0.5) {
        maxWidth = Math.max(maxWidth, rowWidth);
        cursorX = 0;
        cursorY += rowHeight + rowGap;
        rowHeight = 0;
        rowWidth = 0;
      }
      entry.x = cursorX;
      entry.y = cursorY;
      this.statusBadges.addChild(entry);
      if (entry._pmPending) this.#attachPendingBreath(entry);
      cursorX += slotW + entryGap;
      rowWidth = cursorX - entryGap;
      rowHeight = Math.max(rowHeight, slotH);
    }
    maxWidth = Math.max(maxWidth, rowWidth);
    const totalHeight = cursorY + rowHeight;
    this.statusBadges.x = Math.max(pad, (this.w - maxWidth) / 2);
    this.statusBadges.y = Math.max(pad, this.h - totalHeight - pad);
    this.statusBadges.visible = true;
  }

  async #buildBadgeEntry(status, iconSize, textStyle, PreciseText) {
    const entry = new PIXI.Container();
    entry.eventMode = "none";
    entry._pmPending = !!status.pending;

    const src = status.img || "icons/svg/mystery-man.svg";
    let texture = null;
    try {
      texture = await foundry.canvas.loadTexture(src, {
        fallback: "icons/svg/mystery-man.svg",
      });
    } catch (err) {
      console.warn(`PMTTRPG | Failed to load status icon for ${status.name}`, err);
      return null;
    }
    if (!(texture instanceof PIXI.Texture)) return null;

    const icon = new PIXI.Sprite(texture);
    icon.width = iconSize;
    icon.height = iconSize;
    icon.eventMode = "none";
    if (status.pending) icon.tint = 0x9a9a9a;
    entry.addChild(icon);

    // Max stack of 1 statuses only need the icon.
    if (status.showCount !== false) {
      const label = new PreciseText(String(status.count), textStyle);
      label.eventMode = "none";
      label.anchor.set(0, 1);
      label.x = 0;
      label.y = iconSize + Math.max(2, Math.round(iconSize * 0.06));
      entry.addChild(label);
    }

    return entry;
  }

  #attachOverflowBadge(entry, iconSize, count, PreciseText) {
    const badgeH = Math.max(8, Math.round(iconSize * 0.45));
    const fontSize = Math.max(7, Math.round(badgeH * 0.72));

    const style = PreciseText.getTextStyle({
      fontFamily: CONFIG.defaultFontFamily || "Signika, sans-serif",
      fontSize,
      fontWeight: "700",
      fill: "#ffffff",
      stroke: "#000000",
      strokeThickness: 1,
      align: "center",
    });

    const label = new PreciseText(`+${count}`, style);
    label.eventMode = "none";
    label.anchor.set(0.5);

    const padX = Math.max(3, Math.round(badgeH * 0.28));
    const badgeW = Math.max(badgeH, Math.ceil(label.width + padX * 2));
    const radius = badgeH / 2;

    const bg = new PIXI.Graphics();
    bg.eventMode = "none";
    if (typeof bg.roundRect === "function") {
      bg.roundRect(0, 0, badgeW, badgeH, radius).fill({ color: 0x141414, alpha: 0.82 });
    } else {
      bg.beginFill(0x141414, 0.82);
      bg.drawRoundedRect(0, 0, badgeW, badgeH, radius);
      bg.endFill();
    }

    label.x = badgeW / 2;
    label.y = badgeH / 2;

    const badge = new PIXI.Container();
    badge.eventMode = "none";
    badge.addChild(bg);
    badge.addChild(label);
    // Keep the overflow count clear of the stack count.
    badge.x = iconSize - badgeW * 0.4;
    badge.y = -badgeH * 0.35;
    entry.addChild(badge);
  }
}

export function registerTokenStatusBadges() {
  onStatusItemChange(refreshTokenStatusBadgesForItem);
}

export function registerTokenStatusBadgeSettings() {
  game.settings.register("projectmoonttrpg", "showTokenStatusBadges", {
    name: "PMTTRPG.Settings.showTokenStatusBadges.name",
    hint: "PMTTRPG.Settings.showTokenStatusBadges.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshAllTokenStatusBadges(),
  });
}

export function showWeaponRange(tokenId, weaponRange) {
  if (!canvas.ready) return;
  for (const token of canvas.tokens.placeables) {
    if(token.document._id !== tokenId) continue;

    if (typeof token.showWeaponRange === "function") void token.showWeaponRange(weaponRange);
  }
}

export function hideWeaponRange(tokenId) {
  if (!canvas.ready) return;
  for (const token of canvas.tokens.placeables) {
    if(token.document._id !== tokenId) continue;

    if (typeof token.hideWeaponRange === "function") void token.hideWeaponRange();
  }
}

export function refreshAllTokenStatusBadges() {
  if (!canvas.ready) return;
  for (const token of canvas.tokens.placeables) {
    if (typeof token.drawStatusBadges === "function") void token.drawStatusBadges();
  }
}

function refreshTokenStatusBadgesForItem(item) {
  const actor = item.parent ?? item.actor;
  if (!actor?.getActiveTokens) return;
  for (const token of actor.getActiveTokens(true)) {
    if (typeof token.drawStatusBadges === "function") void token.drawStatusBadges();
  }
}
