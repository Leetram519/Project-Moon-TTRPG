import { projectOptions } from "../shared-helpers.js";
import {
  finishOpportunityTokenUpdate,
  interceptOpportunityTokenMove,
  isOpportunityContinuation,
  onOpportunityTokenMovement,
  onOpportunityTokenMovementStopped,
  prepareOpportunityTokenUpdate,
  shouldBlockOverlappingOpportunityMove,
} from "../combat/opportunity/opportunity-orchestrator.js";
import { isAdministrativeMovementActive } from "../combat/opportunity/opportunity-preferences.js";
import { shouldBlockGrappledMovement } from "../grapple/grapple-restrictions.js";
import { ensureMovementActionId } from "../movement/movement-actions.js";
import {
  onPlannedMovementStopped,
  onPlannedMovementUpdate,
  planVoluntaryMovement,
  preflightRequiredLinkedSegment,
} from "../movement/movement-commit.js";

function startsNewMovement(options = {}) {
  return !isOpportunityContinuation(options) && !projectOptions(options).opportunityContinuationOf;
}

function refuseGrappledMovement(tokenDoc, options) {
  if (!shouldBlockGrappledMovement(tokenDoc, options, { isAdministrative: isAdministrativeMovementActive })) return false;
  ui.notifications.warn(game.i18n.localize("PMTTRPG.Grapple.MovementRestricted"));
  return true;
}

/**
 * This has to run before the Opportunity intercept, so the plan's OA policy (like a
 * contribution that turns OA off) is already set when the intercept runs.
 */
async function planOrdinaryMove(tokenDoc, options, waypoints = null) {
  try {
    return await planVoluntaryMovement(tokenDoc, options, {}, { waypoints });
  } catch (error) {
    console.warn("[PMTTRPG] Planned movement failed, so ordinary movement continues", { tokenId: tokenDoc.id, error });
    return { planned: false };
  }
}

/**
 * TokenDocument subclass so we see Foundry v14 movement before the private
 * `#preUpdateMovement` freezes the waypoints. Drag, keyboard and `move()` all still
 * end up in `_preUpdate` with `options.movement`, which is where the later checks run.
 */
export function registerTokenDocumentPMTTRPG() {
  const Current = CONFIG.Token.documentClass;
  if (Current.name === "TokenDocumentPMTTRPG") return Current;

  class TokenDocumentPMTTRPG extends Current {
    async move(waypoints, options = {}) {
      if (shouldBlockOverlappingOpportunityMove(this, options)) return false;
      if (refuseGrappledMovement(this, options)) return false;
      // has to be set before planning and the Opportunity checks (so a re-commit after the origin gate keeps the same action id)
      ensureMovementActionId(options);
      if (startsNewMovement(options)) {
        const planned = await planOrdinaryMove(this, options, waypoints);
        if (planned.refuse) return false;
        if (planned.waypoints) waypoints = planned.waypoints;
      }
      if (!startsNewMovement(options)) return super.move(waypoints, options);
      try {
        const intercepted = await interceptOpportunityTokenMove(
          this,
          waypoints,
          options,
          (nextWaypoints, nextOptions) => super.move(nextWaypoints, nextOptions),
        );
        if (intercepted?.handled) return intercepted.result;
      } catch (error) {
        console.warn("[PMTTRPG] Opportunity intercept failed, so ordinary movement continues", {
          tokenId: this.id,
          error,
        });
      }
      return super.move(waypoints, options);
    }

    async _preUpdate(changed, options, user) {
      if (shouldBlockOverlappingOpportunityMove(this, options)) return false;
      if (options.movement?.[this.id] && refuseGrappledMovement(this, options)) return false;
      if (options.movement?.[this.id] && startsNewMovement(options)) {
        ensureMovementActionId(options);
        const planned = await planOrdinaryMove(this, options);
        if (planned.refuse) return false;
      }
      const pmt = projectOptions(options);
      let prepared = null;
      try {
        if (pmt.opportunityPrepared && !pmt.opportunityContinuationOf) {
          return super._preUpdate(changed, options, user);
        }
        prepared = prepareOpportunityTokenUpdate(this, changed, options);
        if (prepared.originGate && !pmt.opportunityPrepared) {
          if (!options.projectmoonttrpg) options.projectmoonttrpg = {};
          options.projectmoonttrpg.opportunityPrepared = prepared.session.movementId;
          void interceptOpportunityTokenMove(
            this,
            prepared.originalWaypoints,
            options,
            (nextWaypoints, nextOptions) => super.move(nextWaypoints, nextOptions),
          ).catch((error) => {
            console.warn("[PMTTRPG] Opportunity origin gate failed, so the movement was not started", {
              tokenId: this.id,
              error,
            });
          });
          return false;
        }
      } catch (error) {
        console.warn("[PMTTRPG] Opportunity prepare failed, so ordinary movement continues", {
          tokenId: this.id,
          error,
        });
      }
      return finishOpportunityTokenUpdate(this, prepared, options, () => super._preUpdate(changed, options, user));
    }

    /**
     * Foundry calls this for each movement segment once its waypoints are final, and
     * returning false rejects the segment (and stops any continuation too). We check
     * the root segment against its required linked participants here.
     */
    async _preUpdateMovement(movement, operation) {
      const allowed = await super._preUpdateMovement(movement, operation);
      if (allowed === false) return false;
      try {
        if (!preflightRequiredLinkedSegment(this, movement, operation)) return false;
      } catch (error) {
        console.warn("[PMTTRPG] Linked movement preflight failed, so the segment continues", { tokenId: this.id, error });
      }
      return allowed;
    }

    _onUpdateMovement(movement, operation, user) {
      super._onUpdateMovement(movement, operation, user);
      onOpportunityTokenMovement(this, movement, operation, user);
      try {
        onPlannedMovementUpdate(this, movement, operation, user);
      } catch (error) {
        console.warn("[PMTTRPG] Planned movement follow-up failed", { tokenId: this.id, error });
      }
    }

    _onMovementStopped() {
      super._onMovementStopped();
      onOpportunityTokenMovementStopped(this);
      onPlannedMovementStopped(this);
    }
  }

  CONFIG.Token.documentClass = TokenDocumentPMTTRPG;
  return TokenDocumentPMTTRPG;
}
