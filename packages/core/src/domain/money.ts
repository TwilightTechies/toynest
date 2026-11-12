// ToyNest sells in India. Money is held as integer minor units (paise: ₹1 = 100 paise) everywhere in
// the domain, the database and tool calls, and is only turned into text at the edge, here.
export const STORE_CURRENCY = "INR";
export const STORE_LOCALE = "en-IN";

// en-IN groups the Indian way (₹1,24,999). Whole rupees drop the decimals (₹599); anything else
// shows paise (₹599.50), so a fractional amount is never silently rounded in front of a customer.
export function formatMoney(minor: number, currency: string = STORE_CURRENCY): string {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat(STORE_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100);
}
