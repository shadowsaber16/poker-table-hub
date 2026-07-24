/* ============================================================================
   gto.js — Tier 1 preflop reference-chart advisor.

   IMPORTANT: these are standard *reference* ranges across four stack depths,
   not a live solve. They cover the spots that are effectively solved and
   compress to charts: opening (RFI) and facing a single raise heads-up.
   Multiway / limped / 3-bet+ pots are marked off-chart rather than guessed.
   Against weak opponents the higher-EV play is often an *exploit*, not the
   chart line — so treat flagged deviations as "worth reviewing", not "wrong".
   ============================================================================ */
(function (global) {
  "use strict";

  var RORDER = "23456789TJQKA";
  function ridx(r) { return RORDER.indexOf(r); }

  // ----- range-string expander -> Set of 169 hand tokens -----
  function expand(str) {
    var out = {};
    (str || "").split(",").map(function (s) { return s.trim(); })
      .filter(Boolean).forEach(function (tok) {
        var m;
        if ((m = tok.match(/^([2-9TJQKA])\1\+$/))) {            // pair and up
          for (var i = ridx(m[1]); i < 13; i++) out[RORDER[i] + RORDER[i]] = 1;
        } else if ((m = tok.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/))) { // pair range
          var a = ridx(m[1]), b = ridx(m[2]); if (a > b) { var t = a; a = b; b = t; }
          for (var j = a; j <= b; j++) out[RORDER[j] + RORDER[j]] = 1;
        } else if ((m = tok.match(/^([2-9TJQKA])\1$/))) {        // single pair
          out[m[1] + m[1]] = 1;
        } else if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])\+$/))) { // XYs+/XYo+
          var hi = m[1], su = m[3], lo = ridx(m[2]), hiI = ridx(hi);
          for (var k = lo; k < hiI; k++) out[hi + RORDER[k] + su] = 1;
        } else if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])$/))) { // single combo
          var x = m[1], y = m[2]; if (ridx(x) < ridx(y)) { var z = x; x = y; y = z; }
          out[x + y + m[3]] = 1;
        }
      });
    return out;
  }

  function handToken(c1, c2) {
    var r1 = c1.slice(0, -1), s1 = c1.slice(-1);
    var r2 = c2.slice(0, -1), s2 = c2.slice(-1);
    r1 = r1 === "10" ? "T" : r1; r2 = r2 === "10" ? "T" : r2;
    if (r1 === r2) return r1 + r2;
    var hi = r1, lo = r2;
    if (ridx(r1) < ridx(r2)) { hi = r2; lo = r1; }
    return hi + lo + (s1 === s2 ? "s" : "o");
  }

  // ----- positions (same algorithm as the stats engine) -----
  function positions(hand) {
    var ring = hand.players.map(function (p) { return p.seat; }).sort(function (a, b) { return a - b; });
    var n = ring.length;
    var sbA = hand.actions.find(function (a) { return a.action === "post_small_blind"; });
    var bbA = hand.actions.find(function (a) { return a.action === "post_big_blind"; });
    var sb = sbA && sbA.seat, bb = bbA && bbA.seat;
    var idx = function (s) { return ring.indexOf(s); };
    var btn = hand.dealer_seat;
    if (ring.indexOf(btn) < 0 && sb != null) btn = ring[(idx(sb) - 1 + n) % n];
    var pos = {};
    ring.forEach(function (seat) {
      var fb = (idx(seat) - idx(btn) + n) % n;
      pos[seat] = fb === 0 ? "BTN" : fb === 1 ? "SB" : fb === 2 ? "BB" : fb === n - 1 ? "CO" : "EP/MP";
    });
    if (sb != null) pos[sb] = "SB";
    if (bb != null) pos[bb] = "BB";
    return pos;
  }

  // ----- depth buckets -----
  function depthBucket(bb) { return bb <= 20 ? "low" : bb <= 50 ? "medium" : bb <= 150 ? "deep" : "ultra"; }
  var DEPTH_LABEL = {
    low: "Low (≤20bb)", medium: "Medium (20–50bb)", deep: "Deep (50–150bb)", ultra: "Ultra-deep (150bb+)"
  };
  var OPEN_SIZE = { low: "~2bb (often jam)", medium: "~2.2bb", deep: "~2.5bb", ultra: "~3bb" };

  // ----- RFI (open) ranges by depth & position -----
  var RFI = {
    low: {
      "EP/MP": "66+,ATs+,KQs,AQo+",
      "CO":    "44+,A8s+,KTs+,QJs,JTs,AJo+,KQo",
      "BTN":   "22+,A2s+,K9s+,QTs+,JTs,T9s,A8o+,KTo+,QJo",
      "SB":    "22+,A4s+,K9s+,QTs+,JTs,A9o+,KJo+"
    },
    medium: {
      "EP/MP": "66+,A9s+,A5s,KTs+,QJs,AJo+,KQo",
      "CO":    "44+,A5s+,K9s+,Q9s+,J9s+,T9s,98s,87s,ATo+,KJo+",
      "BTN":   "22+,A2s+,K8s+,Q9s+,J8s+,T8s+,97s+,86s+,76s,65s,A4o+,K9o+,QTo+,JTo",
      "SB":    "22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,A8o+,KTo+,QJo"
    },
    deep: {
      "EP/MP": "55+,A8s+,A5s,A4s,KTs+,QTs+,JTs,T9s,98s,AJo+,KQo",
      "CO":    "33+,A2s+,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,65s,54s,ATo+,KJo+,QJo",
      "BTN":   "22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,64s+,54s,A2o+,K9o+,Q9o+,J9o+,T9o,98o",
      "SB":    "22+,A2s+,K7s+,Q8s+,J8s+,T8s+,97s+,86s+,76s,65s,54s,A7o+,A5o,A4o,K9o+,Q9o+,JTo"
    },
    ultra: {
      "EP/MP": "55+,A7s+,A5s,A4s,KTs+,QTs+,JTs,T9s,98s,87s,AJo+,KQo",
      "CO":    "22+,A2s+,K8s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,65s,54s,ATo+,KJo+,QJo",
      "BTN":   "22+,A2s+,K4s+,Q7s+,J7s+,T7s+,96s+,85s+,74s+,64s+,53s+,A2o+,K8o+,Q9o+,J9o+,T9o,98o",
      "SB":    "22+,A2s+,K6s+,Q8s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A5o+,K9o+,Q9o+,JTo"
    }
  };

  // ----- facing a single raise: 3-bet / call by depth & raiser bucket -----
  var DEF = {
    low: {
      early: { tb: "99+,AQs+,AKo", call: "88-22,AJs,KQs,QJs,JTs,AQo" },
      late:  { tb: "77+,A9s+,A5s,KQs,AQo+,KQo", call: "66-22,ATs+,KTs+,QTs+,JTs,T9s,ATo+,KJo+" }
    },
    medium: {
      early: { tb: "TT+,AKs,AKo,AQs", call: "99-22,AJs+,KQs,QJs,JTs,T9s,AQo,KQo" },
      late:  { tb: "99+,AQs+,AJs,A5s,A4s,KQs,AQo+", call: "88-22,ATs+,KTs+,QTs+,J9s+,T9s,98s,87s,ATo+,KJo+" }
    },
    deep: {
      early: { tb: "TT+,AKs,AKo,AQs,A5s", call: "99-22,AJs+,KQs,KJs,QJs,JTs,T9s,98s,AQo,AJo,KQo" },
      late:  { tb: "99+,AJs+,A5s,A4s,A3s,KQs,AQo+,KQo", call: "88-22,ATs+,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,76s,65s,ATo+,KJo+,QJo" }
    },
    ultra: {
      early: { tb: "TT+,AKs,AKo,AQs,A5s,A4s", call: "99-22,ATs+,KQs,KJs,QJs,JTs,T9s,98s,87s,AQo,AJo,KQo" },
      late:  { tb: "99+,AJs+,A5s,A4s,A3s,A2s,KQs,KJs,AQo+,KQo", call: "88-22,A2s+,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,76s,65s,54s,ATo+,KJo+,QJo" }
    }
  };
  // BB defends wider (closing the action with a discount) — extra calls merged in
  var BB_EXTRA = {
    low:    "K9s+,Q9s+,J9s+,T9s,A7o+,K9o+,QTo+",
    medium: "K5s+,Q7s+,J7s+,T7s+,96s+,86s+,75s+,65s,A4o+,K9o+,Q9o+,JTo,T9o",
    deep:   "K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,A2o+,K7o+,Q8o+,J8o+,T8o,98o,87o,76o",
    ultra:  "K2s+,Q2s+,J4s+,T6s+,95s+,84s+,74s+,63s+,53s+,A2o+,K5o+,Q7o+,J8o+,T8o,98o,87o,76o,65o"
  };

  function inSet(set, tok) { return !!set[tok]; }

  // ----- main evaluator: GTO verdict for one player's preflop decision -----
  function evalPreflop(hand, seat) {
    var player = (hand.players || []).find(function (p) { return p.seat === seat; });
    if (!player) return null;
    var holes = player.hole_cards;
    if (!holes || holes.length < 2 || holes.indexOf(null) >= 0) return null; // cards unknown
    var token = handToken(holes[0], holes[1]);

    var pos = positions(hand);
    var myPos = pos[seat];
    var bb = hand.big_blind || 1;
    var depth = depthBucket((player.stack || 0) / bb);

    // walk preflop actions to find this player's first voluntary decision + state before it
    var pf = (hand.actions || []).filter(function (a) { return a.street === "preflop"; });
    var raiseCount = 0, limps = 0, callsAfterRaise = 0, lastRaiser = null, myAction = null, found = false;
    for (var i = 0; i < pf.length; i++) {
      var a = pf[i];
      var isPost = a.action.indexOf("post") === 0;
      if (a.seat === seat && !isPost && !found) { myAction = a.action; found = true; break; }
      if (a.action === "raise") { raiseCount++; lastRaiser = a.seat; }
      else if (a.action === "call") { if (raiseCount === 0) limps++; else callsAfterRaise++; }
    }
    if (!found) return null; // no voluntary decision (e.g., won in BB unopened)

    var base = { token: token, pos: myPos, depth: depth, depthLabel: DEPTH_LABEL[depth], actual: myAction };

    // classify situation
    if (raiseCount === 0 && limps === 0) {                 // RFI
      if (!RFI[depth][myPos]) return Object.assign(base, { situation: "offchart", reason: "no open chart for " + myPos });
      var openSet = expand(RFI[depth][myPos]);
      var rec = inSet(openSet, token) ? "raise" : "fold";
      var match = (rec === "raise" && myAction === "raise") || (rec === "fold" && myAction === "fold");
      return Object.assign(base, {
        situation: "RFI", recAction: rec,
        recLabel: rec === "raise" ? ("open " + OPEN_SIZE[depth]) : "fold",
        sizeHint: rec === "raise" ? OPEN_SIZE[depth] : "", match: match
      });
    }
    if (raiseCount === 0 && limps > 0) return Object.assign(base, { situation: "offchart", reason: "limped pot" });
    if (raiseCount >= 2) return Object.assign(base, { situation: "offchart", reason: "3-bet+ pot" });
    if (callsAfterRaise > 0) return Object.assign(base, { situation: "offchart", reason: "multiway (callers before you)" });

    // facing a single raise, heads-up to us
    var rPos = pos[lastRaiser];
    var bucket = (rPos === "EP/MP") ? "early" : "late";   // CO/BTN/SB treated as late
    var cell = DEF[depth][bucket];
    var tbSet = expand(cell.tb);
    var callSet = expand(cell.call);
    if (myPos === "BB") { var ex = expand(BB_EXTRA[depth]); for (var kk in ex) callSet[kk] = 1; }
    var rec2 = inSet(tbSet, token) ? "3bet" : (inSet(callSet, token) ? "call" : "fold");
    var match2 = (rec2 === "3bet" && myAction === "raise") ||
                 (rec2 === "call" && myAction === "call") ||
                 (rec2 === "fold" && myAction === "fold");
    return Object.assign(base, {
      situation: "vs-open", vsPos: rPos, recAction: rec2,
      recLabel: rec2 === "3bet" ? "3-bet" : rec2, match: match2
    });
  }

  global.GTO = {
    positions: positions, handToken: handToken, evalPreflop: evalPreflop,
    depthBucket: depthBucket, DEPTH_LABEL: DEPTH_LABEL, _expand: expand,
    RFI: RFI, DEF: DEF, BB_EXTRA: BB_EXTRA, OPEN_SIZE: OPEN_SIZE
  };
})(typeof window !== "undefined" ? window : globalThis);
