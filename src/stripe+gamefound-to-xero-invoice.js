const { assert } = require("console");
const { table } = require("table");
const numeral = require("numeral");
const { DateTime } = require("luxon");
const { csv2obj, getCSVData } = require("./csv");
const stripeEmailmapping = require("../data/stripe-email-mapping.json");

const gamefoundOrdersFilename = process.argv[2];
const stripePayoutsFilename = process.argv[3];

if (!gamefoundOrdersFilename) {
  console.error("Missing Gamefound Orders (detailed) extract as first argument");
  process.exit(1);
}
if (!stripePayoutsFilename) {
  console.error("Missing Stripe payouts extract as second argument");
  process.exit(1);
}

/**
 * @typedef {object} StripePayout
 * @property {('Charge'|null)} type
 * @property {string} id
 * @property {StripeDate} created  'YYYY-MM-DD HH:mm'
 * @property {string} description
 * @property {number} amount
 * @property {'aud'} currency
 * @property {number} converted_amount
 * @property {number} fees
 * @property {number} net
 * @property {'aud'} converted_currency
 * @property {Email} details
 * @property {string} customer_id
 * @property {Email} customer_email
 */

/**
 * @typedef {object} GamefoundOrder
 * @property {Email} customeremail
 * @property {string} shippinglocationisocode
 * @property {number} shippingnetcost
 * @property {number} totalcost
 * @property {number} creditdiscount
 * @property {('PlacedAndPaid'|'PlacedAwaitingPayment'|'PlacedWithPaymentError'|'Canceled')} orderstate
 */

/**
 * @param {object[]} payouts
 * @returns {StripePayout[]}
 */
const toStripePayout = (payouts) => {
  /**
   * @type {StripePayout[]}
   */
  const deduped = payouts
    .map((payout) => ({
      ...payout,
      customer_email: `${
        stripeEmailmapping[payout.customer_email.toLowerCase()] || payout.customer_email
      }`.toLowerCase(),
      converted_amount: Number.parseFloat(payout.converted_amount),
      fees: Number.parseFloat(payout.fees),
      net: Number.parseFloat(payout.net),
      amount: Number.parseFloat(payout.amount),
    }))
    .reduce((all, payout) => {
      const existing = all.find((p) => p.customer_email === payout.customer_email);
      if (!existing) {
        return [...all, payout];
      }

      const existingSans = all.filter((p) => p.customer_email !== payout.customer_email);
      return [
        ...existingSans,
        {
          ...existing,
          converted_amount: existing.converted_amount + payout.converted_amount,
          fees: existing.fees + payout.fees,
          net: existing.net + payout.net,
          amount: existing.amount + payout.amount,
        },
      ];
    }, []);

  return deduped;
};

/**
 * @param {object[]} orders
 * @returns {GamefoundOrder[]}
 */
const toGamefoundOrder = (orders) => {
  return orders
    .map((order) => ({
      customeremail: `${order.customeremail}`.toLowerCase(),
      shippinglocationisocode: order.shippinglocationisocode,
      shippingnetcost: Number.parseFloat(order.shippingnetcost),
      creditdiscount: Number.parseFloat(order.creditdiscount),
      totalcost: Number.parseFloat(order.totalcost),
      orderstate: order.orderstate,
    }))
    .filter((order) => order.orderstate === "PlacedAndPaid");
};

/**
 *
 * @param {StripePayout[]} records
 */
const pruneStripeEmptyType = (records) => {
  return records.filter(({ type }) => !!type);
};

const gamefound = toGamefoundOrder(csv2obj(getCSVData(gamefoundOrdersFilename, "utf-16le")));
const stripe = toStripePayout(pruneStripeEmptyType(csv2obj(getCSVData(stripePayoutsFilename))));
const stripeEmails = stripe.map((payout) => payout.customer_email);
const gamefoundInPayout = gamefound.filter((order) => stripeEmails.includes(order.customeremail));

assert(gamefoundInPayout.length === stripeEmails.length, `Stripe records don't match Gamefound`);
if (gamefoundInPayout.length !== stripeEmails.length) {
  const gamefoundEmails = gamefoundInPayout.map((order) => order.customeremail);
  const emailGap = stripeEmails.filter((email) => !gamefoundEmails.includes(email));
  console.log({ stripeEmails, gamefoundEmails, emailGap });
  console.log(stripe);
}

/**
 * @param {StripePayout[]} payouts
 * @param {GamefoundOrder[]} orders
 * @returns {number}
 */
const calculateExtraSales = (payouts, orders) => {
  return payouts
    .filter((payout) => {
      const order = orders.find((order) => order.customeremail === payout.customer_email);

      return !!order;
    })
    .map((payout) => {
      const order = orders.find((order) => order.customeremail === payout.customer_email);
      if (!order) {
        return 0;
      }

      const amountExtraPaid = order.totalcost - order.creditdiscount;
      const amountMinusShipping = amountExtraPaid - order.shippingnetcost;

      return amountMinusShipping;
    })
    .reduce((total, amount) => {
      return total + amount;
    }, 0);
};

/**
 * @param {StripePayout[]} payouts
 * @param {GamefoundOrder[]} orders
 * @returns {number}
 */
const calculateShipping = (payouts, orders) => {
  return payouts
    .filter((payout) => {
      const payoutOrder = orders.find((order) => order.customeremail === payout.customer_email);

      return !!payoutOrder;
    })
    .map((payout) => {
      const payoutOrder = orders.find((order) => order.customeremail === payout.customer_email);
      if (!payoutOrder) {
        return 0;
      }

      assert(
        payoutOrder.shippingnetcost <= payout.converted_amount,
        `Shipping Net Cost is less than converted amount "${payout.customer_email}"`
      );

      return payoutOrder.shippingnetcost;
    })
    .reduce((total, amount) => {
      return total + amount;
    }, 0);
};

/**
 * @param {GamefoundOrder} order
 */
const auOrdersOnly = (order) => order.shippinglocationisocode === "AU";
const nonAuOrdersOnly = (order) => order.shippinglocationisocode !== "AU";

const gstSales = calculateExtraSales(stripe, gamefoundInPayout.filter(auOrdersOnly));
const gstShipping = calculateShipping(stripe, gamefoundInPayout.filter(auOrdersOnly));
const nonGstSales = calculateExtraSales(stripe, gamefoundInPayout.filter(nonAuOrdersOnly));
const noGstShipping = calculateShipping(stripe, gamefoundInPayout.filter(nonAuOrdersOnly));
const gst = (gstShipping + gstSales) / 11;
const payoutTotal = stripe.reduce((t, payout) => t + payout.converted_amount, 0);
const stripeFees = stripe.reduce((t, payout) => t + payout.fees, 0);

const total = gstSales + gstShipping + nonGstSales + noGstShipping;
assert(payoutTotal === total, `${payoutTotal} === ${total}`);

const maxPayoutDate = stripe.map((payout) => {
  return DateTime.fromFormat(payout.created, "yyyy-MM-dd HH:mm");
});

maxPayoutDate.sort((a, b) => +b - +a);

console.info(
  table(
    [
      ["Payout Date", maxPayoutDate[0].toLocaleString(DateTime.DATE_SHORT)],
      ["Shipping Non-AU", numeral(noGstShipping).format("$0.00")],
      ["Extra Non-AU", numeral(nonGstSales).format("$0.00")],
      ["Shipping AU", numeral(gstShipping).format("$0.00")],
      ["Extra AU", numeral(gstSales).format("$0.00")],
      ["GST AU", numeral(gst).format("$0.00")],
      ["Payout Total", numeral(total).format("$0.00")],
      ["Stripe Fees", numeral(stripeFees).format("$0.00")],
    ],
    {
      columns: [{ alignment: "left" }, { alignment: "right" }],
    }
  )
);
