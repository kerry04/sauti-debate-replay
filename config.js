/* Sauti Debate Replay — live-mode configuration.
   Deployed build: live mode OFF (backendUrl null) — the page plays recorded
   runs and says so. To run live against a MiroFish backend you control:
     1. Run the MiroFish backend (Flask, port 5001) on a machine you can reach.
     2. Set backendUrl to that backend's public base URL and simulationId to
        the running simulation's id.
     3. The page polls GET {backendUrl}/api/simulation/{id}/posts every 15s
        and shows a LIVE badge. No keys, tokens, or cookies are used or stored.
   Never put a backend URL, key, or credential into this file in a public repo
   unless that backend is intentionally public. */
window.SAUTI_LIVE = {
  backendUrl: null,
  simulationId: null
};
