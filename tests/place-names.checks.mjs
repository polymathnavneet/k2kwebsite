import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const src = readFileSync("lib/places.ts", "utf8").replace(/^import .*$/gm, "");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { pickName, pickPrecise } = await import("data:text/javascript," + encodeURIComponent(js));

/**
 * Real answers from Nominatim at zoom 14, recorded by querying it for points
 * on the route. The `expected` column is the place a person standing there
 * would give if you asked them where they were.
 *
 * Every `county` in this file is a tehsil: an administrative block tens of
 * kilometres wide, named after one town inside it. Publishing one is what put
 * Navneet in "Sarojani Nagar" while he stood thirty kilometres from it.
 */
const cases = [
  ["Lucknow, where the bug was found", "Lucknow", {
    county: "Sarojani Nagar", state_district: "Lucknow", state: "Uttar Pradesh",
  }],
  ["Kanyakumari, the first step", "Kanyakumari", {
    suburb: "Kundal", city_district: "Agastheeswaram", town: "Kanyakumari",
    county: "Agastheeswaram", state_district: "Kanniyakumari", state: "Tamil Nadu",
  }],
  ["Rewa, where he became an author", "Rewa", {
    city_district: "Rewa", county: "Huzur Tahsil", state_district: "Rewa", state: "Madhya Pradesh",
  }],
  ["Madurai", "Madurai", {
    suburb: "Balarengapuram", city: "Madurai", county: "Madurai South",
    state_district: "Madurai", state: "Tamil Nadu",
  }],
  ["Bettiah", "Bettiah", {
    city: "Bettiah", county: "Bettiah", state_district: "West Champaran", state: "Bihar",
  }],
  ["Varanasi", "Varanasi", {
    city: "Varanasi", county: "Sadar", state_district: "Varanasi", state: "Uttar Pradesh",
  }],
  ["Hyderabad", "Hyderabad", {
    suburb: "Ward 78 Gunfoundry", city_district: "Greater Hyderabad Municipal Corporation Central Zone",
    city: "Hyderabad", county: "Nampally mandal", state_district: "Hyderabad", state: "Telangana",
  }],
  ["Bengaluru", "Bengaluru", {
    suburb: "Ashokanagar", city_district: "Bengaluru Central City Corporation", city: "Bengaluru",
    county: "Bangalore North", state_district: "Bengaluru Urban", state: "Karnataka",
  }],
  ["Nagpur", "Nagpur", {
    suburb: "Mominpura", city: "Nagpur", county: "Nagpur Urban Taluka",
    state_district: "Nagpur", state: "Maharashtra",
  }],
  ["Srinagar, the last step", "Srinagar", {
    suburb: "Karan Nagar", city: "Srinagar", county: "Srinagar (South)",
    state_district: "Srinagar", state: "Jammu and Kashmir",
  }],
  // "Jammu district" is not how anybody says it.
  ["Jammu, where only the district is named", "Jammu", {
    county: "Jammu", state_district: "Jammu district", state: "Jammu and Kashmir",
  }],
  // A village on a road between towns: the smallest real settlement wins.
  ["a village between towns", "Piprahwa", {
    village: "Piprahwa", county: "Naugarh", state_district: "Siddharthnagar", state: "Uttar Pradesh",
  }],
];

for (const [label, expected, address] of cases) {
  const got = pickName(address);
  assert.equal(got, expected, `${label}: expected ${expected}, got ${got}`);
  console.log(`# ✓ ${label} -> ${got}`);
}

// The rule stated directly: a tehsil name is never published, even when it is
// the only administrative label Nominatim offers below the state.
const tehsilOnly = pickName({ county: "Sarojani Nagar", state: "Uttar Pradesh" });
assert.equal(tehsilOnly, "", "a lone county must be refused, not published as the place");
console.log("# ✓ a lone tehsil is refused rather than published");

// Refusing is safe: processPoints keeps the previous place when the lookup
// returns nothing, so a refusal shows the last known town, never a wrong one.
assert.equal(pickName({}), "");
console.log("# ✓ an empty answer is empty, not a guess");

// --- the corner of the town, not just the town ---------------------------
//
// "Lucknow" is three hundred and fifty square kilometres. True, and no answer
// at all to somebody asking where the man is. These are the same real replies
// at zoom 18, which keeps every town name above and adds the detail under it.
const fine = [
  ["his own fix in Lucknow", "Bagiamau · 226030", {
    suburb: "Bagiamau", county: "Sarojani Nagar", state_district: "Lucknow",
    state: "Uttar Pradesh", postcode: "226030",
  }],
  ["Srinagar", "Karan Nagar · 190010", {
    suburb: "Karan Nagar", city: "Srinagar", county: "Srinagar (South)",
    state_district: "Srinagar", state: "Jammu and Kashmir", postcode: "190010",
  }],
  // A neighbourhood beats a suburb: it is the smaller of the two.
  ["Madurai", "Poondhotam · 625014", {
    neighbourhood: "Poondhotam", suburb: "Ward 52", city: "Madurai",
    state_district: "Madurai", state: "Tamil Nadu", postcode: "625014",
  }],
  // In a village the village name already is the precise answer, so the line
  // carries the postcode alone rather than repeating the place.
  ["a small town with nothing finer", "486001", {
    city: "Rewa", city_district: "Rewa", county: "Huzur Tahsil",
    state_district: "Rewa", state: "Madhya Pradesh", postcode: "486001",
  }],
  // A "suburb" that merely repeats the town adds nothing and is dropped.
  ["Bettiah, where the suburb repeats the town", "845438", {
    residential: "Bettiah", city: "Bettiah", county: "Bettiah",
    state_district: "West Champaran", state: "Bihar", postcode: "845438",
  }],
  ["nothing at all", "", { state: "Bihar" }],
];

for (const [label, expected, address] of fine) {
  const got = pickPrecise(address);
  assert.equal(got, expected, `${label}: expected "${expected}", got "${got}"`);
  console.log(`# ✓ ${label} -> "${got}"`);
}
