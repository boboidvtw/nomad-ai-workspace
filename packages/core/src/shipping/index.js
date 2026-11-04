/**
 * Nomad Shared Core - Shipping (evidence-to-delivery lifecycle, borrowed from Cumora, MIT)
 */

const M = require('./shipping-model');
const { ShippingLedger, DEFAULT_SHIPPING_PATH } = require('./shipping-ledger');
const { handleShippingRequest } = require('./shipping-routes');

module.exports = {
  SHIP_STATE: M.SHIP_STATE,
  SHIP_FLOW: M.SHIP_FLOW,
  SQUARE_KINDS: M.SQUARE_KINDS,
  REQUIRED_PROOF_KINDS: M.REQUIRED_PROOF_KINDS,
  ShippingLedger,
  DEFAULT_SHIPPING_PATH,
  handleShippingRequest,
};
