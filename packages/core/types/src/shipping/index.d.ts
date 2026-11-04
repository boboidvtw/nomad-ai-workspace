import { ShippingLedger } from "./shipping-ledger";
import { DEFAULT_SHIPPING_PATH } from "./shipping-ledger";
import { handleShippingRequest } from "./shipping-routes";
export declare let SHIP_STATE: Readonly<{
    DRAFT: "draft";
    CONTRACT: "contract";
    BUILDING: "building";
    VERIFYING: "verifying";
    READY: "ready";
    RELEASING: "releasing";
    WATCHING: "watching";
    LEARNED: "learned";
    PAUSED: "paused";
    ARCHIVED: "archived";
}>;
export declare let SHIP_FLOW: readonly ("draft" | "contract" | "building" | "verifying" | "ready" | "releasing" | "watching" | "learned")[];
export declare let SQUARE_KINDS: readonly string[];
export declare let REQUIRED_PROOF_KINDS: readonly string[];
export { ShippingLedger, DEFAULT_SHIPPING_PATH, handleShippingRequest };
