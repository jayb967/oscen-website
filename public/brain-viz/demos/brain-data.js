/**
 * brain-data.js -- data layer for the Brain dashboard (reaction.html).
 *
 * Mirrors body-data.js: one WebSocket with typed-message dispatch, optional
 * REST polls gated by which module drawer is open, and small REST one-shots
 * for stimulus / simulation.
 *
 * One WebSocket carries every message type (kernel_decision, neuro_update,
 * init, ...). Modules attach to the callback they care about. WS is always
 * connected; REST polls only run when a module that needs them is open --
 * this protects the dashboard from useless load when the drawer is closed.
 *
 * Usage:
 *   import { BrainData } from './brain-data.js';
 *   const data = new BrainData();
 *   data.onNeuroUpdate = (state) => { ... };
 *   data.onKernelDecision = (d) => { ... };
 *   data.start({ wsUrl: 'ws://host/ws', apiBase: 'http://host' });
 *
 *   // module-gated REST polls (when the user opens that module's drawer)
 *   data.enablePoll('phase', 2000);     // -> onPhase()
 *   data.enableConceptResults(2000);    // -> onConceptResults()
 *   data.disablePoll('phase');
 *
 *   // one-shot REST
 *   const result = await data.simulateBelief('plant a flower');
 *   await data.injectObservation('sensor.image', pixels);
 */

export class BrainData {
    // Audio brain is the singular producer of these streams; they should
    // reach the Speech module regardless of which brain the viewer has
    // selected. Skips the per-brain filter for these types only.
    static _AUDIO_PASSTHROUGH_TYPES = new Set([
        'speech_execute',
        'speech_proposal',
        'audio_pcm',
        'audio_loop_health',
    ]);

    constructor() {
        // ── Event callbacks (attach what you need) ──
        // WebSocket-driven (always live):
        this.onKernelDecision = null;   // (d) => void  -- d.decision/verdict, d.action, d.beliefs/belief_ids
        this.onNeuroUpdate = null;      // (state) => void  -- step_count, firing_rates, neuromodulation, drives
        this.onSpeechEvent = null;      // (data, type) => void  -- type in 'speech_execute' | 'speech_proposal'
        this.onAudioPcm = null;         // ({pcm_b64, sample_rate, rms}) => void
        this.onConceptProbeResult = null; // (data) => void  -- live concept_probe_result push
        this.onAudioLoopHealth = null;  // ({gain, silence_threshold_rms, published_count, silent_count, last_rms, interval_s}) => void
        this.onStatus = null;           // ({connected, mode, msgCount}) => void

        // REST-poll-driven (only fire while their poll is enabled):
        this.onPhase = null;            // ({phase, plasticity, ...}) => void   -- from /api/neuromorphic
        this.onConceptResults = null;   // (results) => void                    -- from /api/concept/results
        this.onBenchmark = null;        // (data) => void                       -- from /api/benchmark/latest
        this.onHealth = null;           // (data) => void                       -- from /api/health (Energy module)

        // ── Internal state ──
        this._ws = null;
        this._wsUrl = null;
        // Default to empty string so `_apiBase + path` produces a same-origin
        // relative URL if start() hasn't been called yet. Otherwise consumers
        // that fetch before start() runs hit `null/api/...` (404).
        this._apiBase = '';
        this._reconnectTimer = null;
        this._reconnectAttempts = 0;
        this._polls = new Map();        // key -> {intervalMs, timerId, fetcher, callback}
        this._msgCount = 0;

        // Brain selector mirrors body-data.js. WS messages tagged with a
        // different ``brain`` field are filtered out so opening the 100k
        // brain doesn't poison 1m's state and vice versa.
        this.brain = '1m';

        // Exposed status
        this.connected = false;
        this.mode = 'idle';             // 'live' | 'connecting' | 'idle'
    }

    // ── Lifecycle ────────────────────────────────────────────────

    start({ wsUrl, apiBase }) {
        this._wsUrl = wsUrl;
        this._apiBase = apiBase || '';
        this.mode = 'connecting';
        this._emitStatus();
        this._connectWs();
    }

    stop() {
        if (this._ws) {
            try { this._ws.onclose = null; this._ws.close(); } catch (_) {}
            this._ws = null;
        }
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        for (const key of Array.from(this._polls.keys())) this.disablePoll(key);
        this.connected = false;
        this.mode = 'idle';
        this._emitStatus();
    }

    setBrain(brainId) {
        this.brain = brainId;
        this._msgCount = 0;
        this._emitStatus();
    }

    // ── WebSocket ────────────────────────────────────────────────

    _connectWs() {
        if (this._ws) return;
        try {
            this._ws = new WebSocket(this._wsUrl);
        } catch (_) {
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            this.connected = true;
            this.mode = 'live';
            this._reconnectAttempts = 0;
            this._emitStatus();
        };

        this._ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch (_) { return; }
            // Brain filter applies to per-brain state (mujoco, neuro_update,
            // etc.) but NOT to audio-brain-specific telemetry. The audio
            // brain is singular in the system and the Speech module is
            // about that brain regardless of which brain the viewer has
            // selected -- otherwise the panel goes dark whenever someone
            // is looking at the 1M humanoid.
            if (!BrainData._AUDIO_PASSTHROUGH_TYPES.has(msg.type)
                    && !this._matchesBrain(msg)) {
                return;
            }
            this._msgCount++;
            this._dispatch(msg);
        };

        this._ws.onclose = () => {
            this.connected = false;
            this.mode = 'idle';
            this._ws = null;
            this._emitStatus();
            this._scheduleReconnect();
        };

        this._ws.onerror = () => { /* onclose will fire */ };
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        // Exponential backoff, capped at 10s -- matches openBeliefWs's prior shape.
        this._reconnectAttempts = Math.min(this._reconnectAttempts + 1, 6);
        const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 10000);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this._connectWs();
        }, delay);
    }

    _matchesBrain(msg) {
        // Messages without a ``brain`` field come from the 1M brain by
        // convention (body-data.js uses the same convention).
        const msgBrain = msg.brain || '1m';
        return msgBrain === this.brain;
    }

    _dispatch(msg) {
        const data = msg.data || msg;
        switch (msg.type) {
            case 'kernel_decision':
                if (this.onKernelDecision) this.onKernelDecision(data);
                break;
            case 'neuro_update':
                if (this.onNeuroUpdate) this.onNeuroUpdate(data);
                break;
            case 'init':
                // Initial bundle; some sub-fields are interesting.
                if (data && data.neuromorphic && this.onNeuroUpdate) {
                    this.onNeuroUpdate(data.neuromorphic);
                }
                break;
            case 'speech_execute':
            case 'speech_proposal':
                if (this.onSpeechEvent) this.onSpeechEvent(data, msg.type);
                break;
            case 'audio_pcm':
                if (this.onAudioPcm) this.onAudioPcm(data);
                break;
            case 'concept_probe_result':
                if (this.onConceptProbeResult) this.onConceptProbeResult(data);
                break;
            case 'audio_loop_health':
                if (this.onAudioLoopHealth) this.onAudioLoopHealth(data);
                break;
            default:
                // Other message types pass through silently; modules can
                // subscribe via setRawHandler() if they want them.
                if (this._rawHandler) this._rawHandler(msg);
        }
    }

    /** Escape hatch for modules that need a raw WS message type not in the dispatch above. */
    setRawHandler(fn) { this._rawHandler = fn; }

    /**
     * Chain a handler onto an existing `on*` callback rather than
     * overwriting it. Lets multiple modules subscribe to the same event
     * (e.g. Timeline and Energy both consume onNeuroUpdate) without each
     * one having to rewrite the `const _prev = ...; data.onX = ...`
     * boilerplate. Returns an unsubscribe function for symmetry.
     */
    chain(name, fn) {
        if (typeof fn !== 'function') return () => {};
        const prev = this[name];
        const wrapper = (...args) => {
            if (prev) {
                try { prev.apply(this, args); } catch (_) {}
            }
            try { fn.apply(this, args); } catch (_) {}
        };
        this[name] = wrapper;
        return () => {
            // Best-effort detach: if nobody chained after us, restore prev.
            if (this[name] === wrapper) this[name] = prev;
        };
    }

    // ── REST polls (module-drawer gated) ─────────────────────────

    /**
     * Generic poll. Pass a key, interval, fetcher (() => Promise<json>),
     * and a callback to receive the parsed result. Idempotent; calling
     * enablePoll twice with the same key just updates the interval.
     */
    enablePoll(key, intervalMs, fetcher, callback) {
        this.disablePoll(key);
        if (typeof fetcher !== 'function' || typeof callback !== 'function') return;
        const run = async () => {
            try {
                const data = await fetcher();
                if (data != null) callback(data);
            } catch (_) { /* swallow -- transient API errors are normal */ }
        };
        const timerId = setInterval(run, intervalMs);
        this._polls.set(key, { intervalMs, timerId, fetcher, callback });
        // Fire immediately so the module shows data before the first tick.
        run();
    }

    disablePoll(key) {
        const entry = this._polls.get(key);
        if (!entry) return;
        clearInterval(entry.timerId);
        this._polls.delete(key);
    }

    // ── Convenience: typed polls bound to known endpoints ────────
    //
    // Each module just calls one of these on drawer open and pairs it
    // with disablePoll(key) on drawer close. The key is the typed name
    // (``phase``, ``concept-results``, ...) so disablePoll is symmetric.

    enablePhasePoll(intervalMs = 2000) {
        this.enablePoll('phase', intervalMs,
            () => this._getJson('/api/neuromorphic').then(j => j && j.neuromorphic),
            (d) => { if (this.onPhase) this.onPhase(d); });
    }

    enableConceptResultsPoll(intervalMs = 3000) {
        this.enablePoll('concept-results', intervalMs,
            () => this._getJson('/api/concept/results'),
            (d) => { if (this.onConceptResults) this.onConceptResults(d); });
    }

    enableBenchmarkPoll(intervalMs = 5000) {
        this.enablePoll('benchmark', intervalMs,
            () => this._getJson('/api/benchmark/latest'),
            (d) => { if (this.onBenchmark) this.onBenchmark(d); });
    }

    enableHealthPoll(intervalMs = 5000) {
        this.enablePoll('health', intervalMs,
            () => this._getJson('/api/health'),
            (d) => { if (this.onHealth) this.onHealth(d); });
    }

    // ── REST one-shots ───────────────────────────────────────────

    /** Inject an observation into the brain via /api/observation. */
    async injectObservation(provenance, data) {
        return this._postJson('/api/observation', { provenance, data });
    }

    /** Fetch current brain state once (rather than via poll). */
    async fetchNeuroState() {
        const j = await this._getJson('/api/neuromorphic');
        return j ? j.neuromorphic : null;
    }

    /**
     * POST /api/beliefs/simulate. Returns {verdict, confidence, reasoning,
     * trace, ...} or {ok: false, error}.
     */
    async simulateBelief(action) {
        return this._postJson('/api/beliefs/simulate', { action, dry_run: true });
    }

    // ── HTTP helpers ─────────────────────────────────────────────

    async _getJson(path) {
        try {
            const resp = await fetch(this._apiBase + path);
            if (!resp.ok) return null;
            return await resp.json();
        } catch (_) {
            return null;
        }
    }

    async _postJson(path, body) {
        try {
            const resp = await fetch(this._apiBase + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return await resp.json();
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ── Status ───────────────────────────────────────────────────

    _emitStatus() {
        if (this.onStatus) {
            this.onStatus({
                connected: this.connected,
                mode: this.mode,
                msgCount: this._msgCount,
            });
        }
    }
}
