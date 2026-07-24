/* hub.js — shared loader for the table-hub site.
 *
 * The data has NO fixed hero: every page calls HUB.load(), which fetches
 * data/parsed_hands.json + data/names_map.json, lets the visitor pick who
 * they are (?p=Name, remembered in localStorage), and stamps is_hero /
 * hero_seat on the in-memory hands so the original hero-centric pages work
 * unchanged for ANY player.
 */
window.HUB = (function () {
  const PAGES = [
    ["stats.html", "Stats"],
    ["extended-stats.html", "Extended"],
  ];

  function injectNav() {
    const hdr = document.querySelector("header");
    if (!hdr || hdr.querySelector(".hub-nav")) return;
    hdr.querySelectorAll(".nav").forEach(n => n.remove());   // replace old text links
    const here = (location.pathname.split("/").pop() || "stats.html");
    const sel = localStorage.getItem("hub_player");
    const nav = document.createElement("nav");
    nav.className = "hub-nav";
    nav.style.cssText = "display:inline-flex;gap:8px;flex-wrap:wrap;margin-left:auto";
    nav.innerHTML = PAGES.map(([href, label]) => {
      const on = here === href;
      const url = sel ? `${href}?p=${encodeURIComponent(sel)}` : href;
      return `<a href="${url}" style="font-family:var(--ui);font-size:11px;text-decoration:none;` +
        `padding:5px 12px;border-radius:7px;border:1px solid ${on ? "var(--gold)" : "var(--line)"};` +
        `color:${on ? "var(--gold)" : "var(--dim)"};background:${on ? "rgba(217,164,65,.12)" : "#0e271f"}">` +
        `${label}</a>`;
    }).join("");
    const spacer = hdr.querySelector(".spacer");
    if (spacer) spacer.after(nav); else hdr.appendChild(nav);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", injectNav);
  else injectNav();

  function canonWith(map) {
    return (id, name) => map[id] || map[name] || name;
  }

  function stamp(hands, selected, canon) {
    for (const h of hands) {
      h.hero_seat = null;
      h.hero_id = selected;
      for (const p of h.players) {
        p.is_hero = canon(p.id, p.name) === selected;
        if (p.is_hero) h.hero_seat = p.seat;
      }
    }
  }

  function injectPicker(roster, selected) {
    const hdr = document.querySelector("header");
    if (!hdr) return;
    const wrap = document.createElement("span");
    wrap.style.cssText =
      "font-family:var(--mono);font-size:12px;color:var(--dim);display:inline-flex;align-items:center;gap:7px";
    wrap.innerHTML =
      'viewing as <select id="hubSel" style="background:#0e271f;color:var(--bone);' +
      'border:1px solid var(--line);border-radius:6px;padding:3px 7px;font-family:inherit;font-size:12px">' +
      roster.map(r => `<option${r === selected ? " selected" : ""}>${r}</option>`).join("") +
      "</select>";
    const brand = hdr.querySelector(".brand");
    if (brand) brand.after(wrap); else hdr.prepend(wrap);
    wrap.querySelector("select").onchange = e => {
      localStorage.setItem("hub_player", e.target.value);
      const u = new URL(location.href);
      u.searchParams.set("p", e.target.value);
      location.href = u.toString();
    };
  }

  async function load() {
    const [data, map] = await Promise.all([
      fetch("data/parsed_hands.json").then(r => { if (!r.ok) throw new Error("no data"); return r.json(); }),
      fetch("data/names_map.json").then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    const hands = data.hands || data;
    const canon = canonWith(map && typeof map === "object" ? map : {});
    const count = {};
    hands.forEach(h => h.players.forEach(p => {
      const k = canon(p.id, p.name);
      count[k] = (count[k] || 0) + 1;
    }));
    const roster = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    let selected = new URLSearchParams(location.search).get("p") ||
      localStorage.getItem("hub_player");
    if (!selected || !roster.includes(selected)) selected = roster[0];
    localStorage.setItem("hub_player", selected);
    stamp(hands, selected, canon);
    injectPicker(roster, selected);
    return { data, hands, map, selected, roster, canon };
  }

  return { load };
})();
