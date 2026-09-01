/**
 * The site's own domain name, once it has one.
 *
 * Navneet's phone cannot resolve *.workers.dev on his mobile network - Indian
 * ISPs block the whole parent domain - so the tracker has never been able to
 * reach the site, and neither can any reader on the same network. That is not
 * something the site can fix from its own side; it needs an address of its own.
 *
 * These are the pure parts of wiring one up, kept apart from the deploy scripts
 * so they can be tested without a Cloudflare account. Everything here is inert
 * until a SITE_DOMAIN secret exists: a deploy with no domain behaves exactly as
 * it does today, which matters because a half-configured domain must never be
 * the reason the live site stops.
 */

/** Letters, digits and hyphens, at least two labels, no leading or trailing dot. */
const SHAPE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * What was typed, as a bare hostname - or "" if it was not one.
 *
 * People paste "https://alongwalk.in/" because that is what a browser shows
 * them, and a deploy that rejects it for being a URL is being pedantic about
 * something it can simply understand.
 */
export function cleanDomain(value) {
  let text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  text = text.replace(/^[a-z]+:\/\//, "");   // https://
  text = text.replace(/\/.*$/, "");          // /any/path
  text = text.replace(/:\d+$/, "");          // :443
  text = text.replace(/^\.+|\.+$/g, "");     // stray dots
  if (text.length > 253) return "";
  return SHAPE.test(text) ? text : "";
}

/**
 * The names to ask Cloudflare about, most specific first.
 *
 * A zone is the domain somebody actually bought. "walk.alongwalk.in" is served
 * by the "alongwalk.in" zone, and "alongwalk.co.in" is its own zone despite
 * having three labels - which is why this walks the suffixes and asks, rather
 * than guessing that a zone is always the last two labels.
 */
export function zoneCandidates(domain) {
  const labels = cleanDomain(domain).split(".").filter(Boolean);
  if (labels.length < 2) return [];
  const names = [];
  for (let start = 0; start <= labels.length - 2; start += 1) {
    names.push(labels.slice(start).join("."));
  }
  return names;
}

/**
 * What to put in the worker's routes, given the domain and the zone it sits in.
 *
 * When the domain *is* the zone - he bought alongwalk.in and wants the site at
 * alongwalk.in - www is added too, because half the people who type it will
 * type www and a domain that only answers to one of the two looks broken. When
 * he asked for a subdomain, only that subdomain is bound: inventing
 * "www.walk.alongwalk.in" would be nonsense.
 */
export function routesFor(domain, zoneName) {
  const site = cleanDomain(domain);
  if (!site) return [];
  const routes = [{ pattern: site, custom_domain: true }];
  if (cleanDomain(zoneName) === site) routes.push({ pattern: `www.${site}`, custom_domain: true });
  return routes;
}
