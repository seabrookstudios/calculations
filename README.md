# calculations
Scripts for common administrative tasks

## Stripe + Gamefound -> Xero Invoice
I use this script to take a Stripe Payout and the Gamefound orders list to work out what proportion of the item in Xero has GST applicable.

I manually create the invoice in Xero and add the line items as per the output of this script. Eventually, when reconciling I will add a separate Bank Fee to capture the merchant fee.

```
node src/stripe+gamefound-to-xero-invoice.js "./data/gamefound.csv" "./data/stripe-payout.csv
```

The gamefound extra is an `Orders (detailed)` as CSV
The stripe payout is taken from the payout details page on the stripe dashboard where I hit export.
