// Demo scenarios. Pick one with ?s=<name> before the # (index.html?s=high-troponin); key D opens the demo panel.
// app.js patches window.CASES with it before anything is built. Every field is optional:
//   patient  the patient the app opens on, e.g. "P001"
//   now      fixed clock, "2026-09-30 17:45" (with ?s= the default is the dataset's generation time)
//   set      results: "PID.fact[.source][.n]=value[:STATUS]". Value in the unit shown on screen; STATUS is
//            DATA, CONFLICT, PICTURE or LOST; "P001.lvef=:LOST" keeps the value. n picks among repeats (1 = first).
//   name     rename: "P001.Given Family" (first word is the given name)
//   roles    which patient each seeded story uses, e.g. { fax: "P004" } (see ROLE in app.js)
// The URL takes set, name, p (patient) and t (clock) as well, on top of any scenario.
window.SCENARIOS = {
  default: {},
  "high-troponin": { patient: "P001", set: ["P001.troponin.ext_lab=912", "P001.lvef=35:PICTURE"] },
};
