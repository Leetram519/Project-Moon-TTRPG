export class PMTTRPGGamePause extends foundry.applications.ui.GamePause {
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        return {
            ...context,

            spin: false,

            cssClass: `${context.cssClass} system-pause`
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);

        // Find the native pause icon.
        const icon = this.element.querySelector("img");

        if (!icon) return;

        // Mark it for our custom styling.
        icon.classList.add("system-pause-logo");

        icon.src = "systems/projectmoonttrpg/assets/pmttrpg-foundry-logo.webp";
    }
}