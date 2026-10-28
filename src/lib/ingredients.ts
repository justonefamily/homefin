import type { Course } from "./types";

/**
 * Built-in knowledge for common dishes: course + typical ingredients. Used as the fallback when no
 * ANTHROPIC_API_KEY is configured, and as a fast path for well-known names. The AI route handles the rest.
 */
const DB: [RegExp, Course, string[]][] = [
  [/\btacos?\b/i, "main", ["tortillas", "ground beef", "taco seasoning", "onion", "tomato", "lettuce", "shredded cheese", "sour cream", "salsa", "lime"]],
  [/\bburritos?\b/i, "main", ["large tortillas", "rice", "black beans", "chicken or beef", "cheese", "salsa", "sour cream"]],
  [/\bspaghetti|pasta|penne|fettuccine|alfredo\b/i, "main", ["pasta", "olive oil", "garlic", "onion", "tomato sauce", "parmesan", "ground beef or chicken"]],
  [/\blasagna\b/i, "main", ["lasagna noodles", "ground beef", "ricotta", "mozzarella", "parmesan", "marinara", "egg", "garlic"]],
  [/\bpizza\b/i, "main", ["pizza dough", "pizza sauce", "mozzarella", "toppings", "olive oil"]],
  [/\bsalmon\b/i, "main", ["salmon fillets", "lemon", "olive oil", "garlic", "salt", "pepper", "fresh herbs"]],
  [/\bstir[- ]?fry\b/i, "main", ["chicken or beef", "broccoli", "bell peppers", "carrots", "soy sauce", "garlic", "ginger", "sesame oil", "rice"]],
  [/\bfried chicken\b/i, "main", ["chicken pieces", "flour", "buttermilk", "eggs", "paprika", "oil for frying"]],
  [/\bgrilled chicken\b/i, "main", ["chicken breasts", "olive oil", "lemon", "garlic", "salt", "pepper"]],
  [/\bchicken\b/i, "main", ["chicken", "olive oil", "garlic", "onion", "salt", "pepper"]],
  [/\bburgers?\b/i, "main", ["ground beef", "burger buns", "cheese slices", "lettuce", "tomato", "onion", "pickles", "ketchup", "mustard"]],
  [/\bsteak\b/i, "main", ["steak", "butter", "garlic", "rosemary", "salt", "pepper"]],
  [/\bmeatloaf\b/i, "main", ["ground beef", "breadcrumbs", "egg", "onion", "ketchup", "worcestershire"]],
  [/\bchili\b/i, "main", ["ground beef", "kidney beans", "diced tomatoes", "onion", "chili powder", "cumin", "garlic"]],
  [/\bcurry\b/i, "main", ["chicken or chickpeas", "coconut milk", "curry paste or powder", "onion", "garlic", "ginger", "rice"]],
  [/\bjerk\b/i, "main", ["chicken", "jerk seasoning", "scotch bonnet", "scallions", "thyme", "allspice", "lime"]],
  [/\boxtail\b/i, "main", ["oxtail", "butter beans", "onion", "garlic", "thyme", "scallions", "browning", "allspice"]],
  [/\bcurry goat\b/i, "main", ["goat meat", "curry powder", "onion", "garlic", "scotch bonnet", "thyme", "potatoes"]],
  [/\bsoup\b/i, "main", ["broth", "onion", "carrots", "celery", "garlic", "protein of choice"]],
  [/\bsalad\b/i, "main", ["mixed greens", "tomato", "cucumber", "red onion", "dressing"]],
  [/\bsandwich(es)?\b/i, "main", ["bread", "deli meat", "cheese", "lettuce", "tomato", "mayo"]],
  [/\bquesadillas?\b/i, "main", ["tortillas", "shredded cheese", "chicken", "bell peppers", "onion"]],
  [/\benchiladas?\b/i, "main", ["tortillas", "shredded chicken", "enchilada sauce", "cheese", "onion"]],
  [/\bfajitas?\b/i, "main", ["chicken or steak", "bell peppers", "onion", "tortillas", "fajita seasoning", "lime"]],
  [/\bshrimp\b/i, "main", ["shrimp", "garlic", "butter", "lemon", "parsley"]],
  [/\bpancakes?\b/i, "main", ["flour", "eggs", "milk", "baking powder", "butter", "syrup"]],
  [/\boatmeal\b/i, "main", ["rolled oats", "milk", "banana", "honey", "cinnamon"]],
  [/\bomelet(te)?|scrambled eggs|eggs\b/i, "main", ["eggs", "butter", "cheese", "salt", "pepper"]],
  [/\bsmoothie\b/i, "drink", ["frozen berries", "banana", "yogurt", "milk or juice"]],
  [/\brice\b/i, "side", ["rice"]],
  [/\brice and peas\b/i, "side", ["rice", "kidney beans", "coconut milk", "scallions", "thyme"]],
  [/\bbeans\b/i, "side", ["beans", "onion", "garlic"]],
  [/\bmashed potatoes\b/i, "side", ["potatoes", "butter", "milk", "salt"]],
  [/\bfries\b/i, "side", ["potatoes", "oil", "salt"]],
  [/\bmac(aroni)? (and|&|n) cheese\b/i, "side", ["elbow pasta", "cheddar", "milk", "butter", "flour"]],
  [/\bcorn ?bread\b/i, "side", ["cornmeal", "flour", "eggs", "milk", "butter", "sugar"]],
  [/\bplantains?\b/i, "side", ["ripe plantains", "oil"]],
  [/\bquinoa\b/i, "side", ["quinoa"]],
  [/\bbroccoli\b/i, "veggie", ["broccoli", "olive oil", "garlic"]],
  [/\basparagus\b/i, "veggie", ["asparagus", "olive oil", "lemon"]],
  [/\bgreen beans\b/i, "veggie", ["green beans", "butter", "garlic"]],
  [/\bcollard greens|greens\b/i, "veggie", ["collard greens", "onion", "garlic", "smoked turkey or ham hock"]],
  [/\bcallaloo\b/i, "veggie", ["callaloo", "onion", "garlic", "scallions", "thyme"]],
  [/\bsalad\b/i, "veggie", ["lettuce", "tomato", "cucumber", "dressing"]],
  [/\bpeppers? (and|&) onions?\b/i, "veggie", ["bell peppers", "onion", "olive oil"]],
  [/\bcorn\b/i, "veggie", ["corn", "butter"]],
  [/\bcarrots?\b/i, "veggie", ["carrots", "butter", "honey"]],
  [/\bground beef\b/i, "meat", ["ground beef"]],
  [/\bchicken thighs|chicken breasts?|drumsticks|wings\b/i, "meat", ["chicken"]],
  [/\bpork chops?\b/i, "meat", ["pork chops"]],
  [/\bribs\b/i, "meat", ["ribs", "bbq sauce", "dry rub"]],
  [/\bturkey\b/i, "meat", ["turkey"]],
  [/\bchurros\b/i, "dessert", ["flour", "butter", "eggs", "sugar", "cinnamon", "oil for frying"]],
  [/\bbrownies?\b/i, "dessert", ["cocoa powder", "flour", "sugar", "eggs", "butter"]],
  [/\bcookies?\b/i, "dessert", ["flour", "butter", "sugar", "eggs", "chocolate chips", "vanilla"]],
  [/\bice cream\b/i, "dessert", ["ice cream"]],
  [/\bfruit (salad|bowl)\b/i, "dessert", ["strawberries", "grapes", "pineapple", "melon", "blueberries"]],
  [/\bcake\b/i, "dessert", ["flour", "sugar", "eggs", "butter", "baking powder", "vanilla"]],
  [/\bpie\b/i, "dessert", ["pie crust", "filling fruit", "sugar", "butter"]],
  [/\blemonade\b/i, "drink", ["lemons", "sugar", "water"]],
  [/\bagua fresca\b/i, "drink", ["fruit", "water", "sugar", "lime"]],
  [/\btea|coffee|juice|water|soda\b/i, "drink", []],
];

/** Most specific pattern wins: "rice and peas" beats "rice", "curry goat" beats "curry". */
const ORDERED = [...DB].sort((a, b) => b[0].source.length - a[0].source.length);

export function guessDish(name: string): { course: Course; ingredients: string[]; confident: boolean } {
  const hit = ORDERED.find(([re]) => re.test(name));
  if (hit) return { course: hit[1], ingredients: hit[2], confident: true };
  return { course: "main", ingredients: [], confident: false };
}

/** Split a pasted block into dish names: one per line, or comma/semicolon-separated; strips bullets/numbers. */
export const parseDishList = (text: string) =>
  [...new Set(text.split(/\r?\n|,|;/).map((s) => s.replace(/^[\s\-\*•\d\.\)]+/, "").trim()).filter((s) => s.length > 1))];

/** Normalize an ingredient for de-duplication across dishes ("Onion" / "onions" / "1 onion"). */
export const normalizeIngredient = (s: string) =>
  s.toLowerCase().replace(/^[\d\/\.\s]+(cups?|tbsp|tsp|lbs?|oz|cloves?|cans?|bunch(es)?|pieces?)?\s*(of)?\s*/, "").replace(/\s+/g, " ").trim().replace(/(es|s)$/, (m, _p, off, str) => (/(ss|us|is)$/.test(str) ? m : ""));
