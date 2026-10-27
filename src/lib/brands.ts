/** Brand colors for common institutions — used when Plaid doesn't supply one (manual accounts, billers). */
const BRANDS: [RegExp, string][] = [
  [/wells ?fargo/i, "#D71E28"], [/chase|jpmorgan/i, "#117ACA"], [/bank of america|bofa/i, "#E31837"], [/capital ?one/i, "#004977"],
  [/american express|amex/i, "#006FCF"], [/discover/i, "#FF6000"], [/citi/i, "#0A3D8F"], [/navy federal|nfcu/i, "#003366"],
  [/usaa/i, "#12395B"], [/ally/i, "#6C2C8F"], [/synchrony/i, "#3B6E8F"], [/rocket|quicken loans/i, "#C8102E"], [/nelnet/i, "#0066B3"],
  [/sofi/i, "#00A4E4"], [/pnc/i, "#F58025"], [/u\.?s\.? bank/i, "#0C2074"], [/truist|suntrust|bb&t/i, "#4B286D"], [/td bank/i, "#54B948"],
  [/credit karma/i, "#00C27F"], [/at&t|att\b/i, "#00A8E0"], [/xfinity|comcast/i, "#6138F5"], [/verizon/i, "#CD040B"], [/t-?mobile/i, "#E20074"],
  [/duke energy/i, "#00789E"], [/fpl|florida power/i, "#0057B8"], [/progressive/i, "#0046AD"], [/geico/i, "#1F3A93"], [/state farm/i, "#C8102E"],
  [/toyota/i, "#EB0A1E"], [/honda/i, "#CC0000"], [/kia/i, "#05141F"], [/ford/i, "#003478"], [/apple/i, "#1D1D1F"], [/paypal/i, "#003087"],
  [/venmo/i, "#008CFF"], [/cash app/i, "#00D632"], [/chime/i, "#1EC677"], [/fidelity/i, "#4E8A2E"], [/vanguard/i, "#96151D"], [/schwab/i, "#00A0DF"],
  [/robinhood/i, "#00C805"], [/regions/i, "#6CAC3F"], [/fifth third/i, "#1E5AA8"], [/huntington/i, "#5B8F22"], [/citizens/i, "#00843D"], [/m&t/i, "#007856"],
];

export const brandColorFor = (institution: string): string | undefined => BRANDS.find(([re]) => re.test(institution))?.[1];

/** Readable text color on a brand background. */
export const onBrand = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#141821" : "#ffffff";
};
