/**
 * body-guide.js — Dynamic teaching controls for the MuJoCo body.
 *
 * Adapts to any body model (pendulum, arm, walker, humanoid) by fetching
 * body info from the API. Controls are built dynamically based on the
 * actual joints, channels, and capabilities of the active body.
 *
 * Provides UI for human-in-the-loop motor teaching:
 *   - Joint sliders (guide to pose)
 *   - Push buttons (apply external force)
 *   - Reward buttons (good/bad feedback)
 *   - Training progress indicator
 *
 * Sends commands via WebSocket: { type: "mujoco_guide", data: {...} }
 *
 * Usage:
 *   import { BodyGuide } from './body-guide.js';
 *   const guide = new BodyGuide(containerEl, sendFn);
 *   guide.start(apiBase);
 */

// Body progression order for "next body" recommendations
const BODY_PROGRESSION = ['pendulum', 'arm_2dof', 'walker_4dof', 'humanoid_29dof'];

export class BodyGuide {
    constructor(container, sendFn) {
        this._container = container;
        this._send = sendFn;  // (data) => void -- sends via WS or REST
        this._joints = null;
        this._bodyInfo = null;
        this._sliders = {};
        this.onPreview = null;  // (channel) => void -- instant visual preview
        this._teachMode = false;
        this._teachRepeats = 3;
        this._teachBusy = false;
        this._statusEl = null;
        this._trainingEl = null;  // training progress container
        this._journeyEl = null;   // learning journey container
        this._journeyPastEl = null;
        this._journeyNextEl = null;
        this._journeySeen = new Set();  // advance_number dedup across fetch + live append
        this._journeyFetchToken = 0;    // monotonic; drops stale fetch responses on rapid brain switch
    }

    async start(apiBase, brain = '1m') {
        this._apiBase = apiBase;
        this._brain = brain;
        // Fetch body info (includes joints, channels, training state)
        try {
            const resp = await fetch(apiBase + `/api/mujoco/body-info?brain=${this._brain}`);
            const json = await resp.json();
            this._bodyInfo = json;
            this._joints = json.joints || [];
        } catch (e) {
            console.warn('Failed to fetch body info, falling back to joints:', e);
            try {
                const resp = await fetch(apiBase + `/api/mujoco/joints?brain=${this._brain}`);
                const json = await resp.json();
                this._joints = json.joints || [];
            } catch (e2) {
                console.warn('Failed to fetch joint info:', e2);
                this._joints = [];
            }
        }
        this._render();
    }

    /**
     * Switch which brain this panel is bound to. Triggers a re-fetch of
     * the per-brain training history so the Learning Journey reflects
     * the newly selected brain.
     */
    setBrain(brainId) {
        if (!brainId || brainId === this._brain) return;
        this._brain = brainId;
        this._journeySeen = new Set();
        if (this._journeyEl) {
            this._renderJourneySkeleton(this._journeyEl);
            this._fetchJourney();
        }
    }

    /**
     * Called when a mujoco_body_info WS message arrives.
     * Updates training progress display without full re-render.
     */
    updateBodyInfo(info) {
        this._bodyInfo = info;
        // If joints changed (body switch), full re-render
        const newJointNames = (info.joints || []).map(j => j.name).sort().join(',');
        const curJointNames = (this._joints || []).map(j => j.name).sort().join(',');
        if (newJointNames !== curJointNames) {
            this._joints = info.joints || [];
            this._render();
            return;
        }
        // Otherwise just update training progress
        this._updateTrainingDisplay(info.training);
    }

    _render() {
        const el = this._container;
        el.innerHTML = '';
        const info = this._bodyInfo;
        const bodyName = info ? info.body_name : 'unknown';
        const description = info ? info.description : '';

        // Section: Body Identity
        el.appendChild(this._makeSection('Active Body', () => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'line-height:1.6;';
            const name = document.createElement('div');
            name.style.cssText = 'font-size:14px;font-weight:600;color:#22d3ee;';
            name.textContent = _formatBodyName(bodyName);
            wrap.appendChild(name);
            if (description) {
                const desc = document.createElement('div');
                desc.style.cssText = 'font-size:10px;color:#6b7c93;margin-top:2px;';
                desc.textContent = description;
                wrap.appendChild(desc);
            }
            // Stats row
            const stats = document.createElement('div');
            stats.style.cssText = 'font-size:10px;color:#8b8b8b;margin-top:4px;display:flex;gap:12px;';
            const nj = info ? info.num_joints : 0;
            const channels = info ? (info.channels || []) : [];
            stats.innerHTML = `<span>${nj} joint${nj !== 1 ? 's' : ''}</span>` +
                `<span>${channels.length} channel${channels.length !== 1 ? 's' : ''}</span>`;
            wrap.appendChild(stats);
            return wrap;
        }));

        // Section: Training Progress
        el.appendChild(this._makeSection('Training Progress', () => {
            const wrap = document.createElement('div');
            wrap.className = 'training-progress';
            this._trainingEl = wrap;
            this._updateTrainingDisplay(info ? info.training : null);
            return wrap;
        }));

        // Section: Learning Journey (past mastered tasks + future bodies).
        // Phase 2.6.3 (2026-06-03). Data comes from /api/training/history,
        // refreshed on body switch and live-appended via appendLiveAdvance.
        el.appendChild(this._makeSection('Learning Journey', () => {
            const wrap = document.createElement('div');
            wrap.className = 'learning-journey';
            wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
            this._journeyEl = wrap;
            this._renderJourneySkeleton(wrap);
            this._fetchJourney();
            return wrap;
        }));

        // Section: Teach Mode toggle
        el.appendChild(this._makeSection('Teach Mode', () => {
            const wrap = document.createElement('div');
            wrap.className = 'guide-btn-row';
            wrap.style.alignItems = 'center';

            const toggle = document.createElement('button');
            toggle.className = 'guide-btn teach-toggle';
            toggle.textContent = 'Teach: OFF';
            toggle.onclick = () => {
                this._teachMode = !this._teachMode;
                toggle.textContent = this._teachMode ? 'Teach: ON' : 'Teach: OFF';
                toggle.classList.toggle('active', this._teachMode);
            };
            wrap.appendChild(toggle);

            const repLabel = document.createElement('span');
            repLabel.style.cssText = 'color:#aaa;font-size:12px;margin-left:8px;';
            repLabel.textContent = 'Reps:';
            wrap.appendChild(repLabel);

            const repSel = document.createElement('select');
            repSel.className = 'guide-select';
            for (const n of [1, 3, 5, 10]) {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                if (n === 3) opt.selected = true;
                repSel.appendChild(opt);
            }
            repSel.onchange = () => { this._teachRepeats = parseInt(repSel.value); };
            wrap.appendChild(repSel);

            const status = document.createElement('span');
            status.className = 'teach-status';
            status.style.cssText = 'color:#ccc;font-size:12px;margin-left:12px;';
            this._statusEl = status;
            wrap.appendChild(status);

            return wrap;
        }));

        // Section: Push (only if we have pushable bodies)
        const pushBodies = info ? (info.pushable_bodies || []) : [];
        if (pushBodies.length > 0) {
            el.appendChild(this._makeSection('Push (Balance Training)', () => {
                const row = document.createElement('div');
                row.className = 'guide-btn-row';
                // Build push buttons dynamically from pushable bodies
                // Use the root body as the primary push target
                const rootBody = info ? info.root_body : 'torso';
                const pushTargets = this._buildPushTargets(rootBody, pushBodies);
                for (const push of pushTargets) {
                    const btn = document.createElement('button');
                    btn.className = 'guide-btn push';
                    btn.textContent = push.label;
                    btn.onclick = () => this._sendPush(push.body, push.force);
                    row.appendChild(btn);
                }
                return row;
            }));
        }

        // Section: Reward (one pair per active channel)
        const channels = info ? (info.channels || []) : [];
        if (channels.length > 0) {
            el.appendChild(this._makeSection('Reward Signal', () => {
                const row = document.createElement('div');
                row.className = 'guide-btn-row';
                for (const ch of channels) {
                    const good = document.createElement('button');
                    good.className = 'guide-btn reward-good';
                    good.textContent = ch.slice(0, 5) + ' Good';
                    good.onclick = () => this._sendReward(ch, true);
                    row.appendChild(good);

                    const bad = document.createElement('button');
                    bad.className = 'guide-btn reward-bad';
                    bad.textContent = ch.slice(0, 5) + ' Bad';
                    bad.onclick = () => this._sendReward(ch, false);
                    row.appendChild(bad);
                }
                return row;
            }));
        }

        // Section: Joint Sliders -- grouped by channel
        if (this._joints && this._joints.length > 0) {
            // Group joints by channel
            const channelGroups = {};
            for (const j of this._joints) {
                const ch = j.channel || 'other';
                if (!channelGroups[ch]) channelGroups[ch] = [];
                channelGroups[ch].push(j);
            }
            for (const [ch, joints] of Object.entries(channelGroups)) {
                const label = ch.charAt(0).toUpperCase() + ch.slice(1) + ' Joints';
                el.appendChild(this._makeSection(label, () => {
                    const wrap = document.createElement('div');
                    wrap.className = 'guide-sliders';
                    for (const j of joints) {
                        const row = document.createElement('div');
                        row.className = 'slider-row';

                        const labelEl = document.createElement('span');
                        labelEl.className = 'slider-label';
                        labelEl.textContent = this._shortName(j.name);

                        const input = document.createElement('input');
                        input.type = 'range';
                        input.className = 'slider-input';
                        input.min = j.range_deg[0];
                        input.max = j.range_deg[1];
                        input.value = 0;
                        input.step = 1;

                        const val = document.createElement('span');
                        val.className = 'slider-val';
                        val.textContent = '0';

                        input.oninput = () => {
                            val.textContent = input.value;
                        };
                        input.onchange = () => {
                            if (this._teachMode) {
                                this._sendPose(this._getAllSliderValues());
                            } else {
                                this._sendPose({ [j.name]: parseInt(input.value) });
                            }
                        };

                        this._sliders[j.name] = input;
                        row.appendChild(labelEl);
                        row.appendChild(input);
                        row.appendChild(val);
                        wrap.appendChild(row);
                    }
                    return wrap;
                }));
            }
        }

        // Waiting message if no joints loaded yet
        if (!this._joints || this._joints.length === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'color:#6b7c93;font-size:11px;padding:8px;text-align:center;';
            msg.textContent = 'Waiting for body info from neuromorphic service...';
            el.appendChild(msg);
        }

        // Section: Reset
        const resetBtn = document.createElement('button');
        resetBtn.className = 'guide-btn reset-btn';
        resetBtn.textContent = 'Reset Body';
        resetBtn.onclick = () => this._sendReset();
        el.appendChild(resetBtn);
    }

    _updateTrainingDisplay(training) {
        const el = this._trainingEl;
        if (!el) return;
        el.innerHTML = '';

        if (!training) {
            el.innerHTML = '<div style="color:#6b7c93;font-size:11px;">No training data yet</div>';
            return;
        }

        // Current task
        const taskRow = document.createElement('div');
        taskRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
        const taskLabel = document.createElement('span');
        taskLabel.style.cssText = 'color:#c8d6e5;font-size:12px;font-weight:600;';
        taskLabel.textContent = _formatTaskName(training.current_task);
        const taskBadge = document.createElement('span');
        taskBadge.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:3px;' +
            'background:rgba(34,211,238,0.15);color:#22d3ee;';
        taskBadge.textContent = training.current_task_channel || '';
        taskRow.appendChild(taskLabel);
        taskRow.appendChild(taskBadge);
        el.appendChild(taskRow);

        // Progress bar: successes / advance_threshold
        const pct = Math.min(100, (training.successes / Math.max(1, training.advance_threshold)) * 100);
        const barOuter = document.createElement('div');
        barOuter.style.cssText = 'height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin-bottom:4px;';
        const barInner = document.createElement('div');
        barInner.style.cssText = `height:100%;width:${pct}%;background:linear-gradient(90deg,#22d3ee,#38d97a);border-radius:3px;transition:width 0.3s;`;
        barOuter.appendChild(barInner);
        el.appendChild(barOuter);

        // Stats line
        const statsRow = document.createElement('div');
        statsRow.style.cssText = 'display:flex;justify-content:space-between;font-size:10px;color:#6b7c93;';
        statsRow.innerHTML =
            `<span>Successes: ${training.successes}/${training.advance_threshold}</span>` +
            `<span>Advances: ${training.total_advances}</span>`;
        el.appendChild(statsRow);

        // Velocity metrics (if available)
        if (training.velocity) {
            const v = training.velocity;
            const velRow = document.createElement('div');
            velRow.style.cssText = 'display:flex;justify-content:space-between;font-size:9px;color:#8b9cb3;margin-top:2px;';
            const rateStr = v.success_rate_per_min > 0 ? `${v.success_rate_per_min.toFixed(1)}/min` : '--';
            const etaStr = v.eta_seconds ? _formatDuration(v.eta_seconds) : '--';
            const avgStr = v.avg_cycle_seconds ? _formatDuration(v.avg_cycle_seconds) : '--';
            velRow.innerHTML =
                `<span>Rate: ${rateStr}</span>` +
                `<span>ETA: ${etaStr}</span>` +
                `<span>Avg cycle: ${avgStr}</span>`;
            el.appendChild(velRow);
        }

        // Task pipeline
        if (training.task_list && training.task_list.length > 1) {
            const pipeline = document.createElement('div');
            pipeline.style.cssText = 'display:flex;gap:3px;margin-top:6px;flex-wrap:wrap;';
            for (let i = 0; i < training.task_list.length; i++) {
                const chip = document.createElement('span');
                const isActive = i === training.current_task_idx;
                const isDone = i < training.current_task_idx;
                chip.style.cssText = 'font-size:9px;padding:2px 5px;border-radius:3px;' +
                    (isActive
                        ? 'background:rgba(34,211,238,0.25);color:#22d3ee;font-weight:600;'
                        : isDone
                            ? 'background:rgba(56,217,122,0.15);color:#38d97a;'
                            : 'background:rgba(255,255,255,0.05);color:#6b7c93;');
                chip.textContent = _formatTaskName(training.task_list[i]);
                pipeline.appendChild(chip);
            }
            el.appendChild(pipeline);
        }

        // Curriculum complete notification
        if (training.curriculum_complete) {
            const notice = document.createElement('div');
            notice.style.cssText = 'margin-top:8px;padding:6px 8px;border-radius:4px;' +
                'background:rgba(56,217,122,0.15);border:1px solid rgba(56,217,122,0.3);' +
                'color:#38d97a;font-size:11px;text-align:center;';
            const bodyName = this._bodyInfo ? this._bodyInfo.body_name : '';
            const nextBody = _nextBodyInProgression(bodyName);
            notice.innerHTML = 'Curriculum complete! ' +
                (nextBody ? `Consider switching to <b>${_formatBodyName(nextBody)}</b>` : 'All bodies trained.');
            el.appendChild(notice);
        }
    }

    _renderJourneySkeleton(wrap) {
        wrap.innerHTML = '';
        // Past advances
        const pastBox = document.createElement('div');
        pastBox.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
        const pastTitle = document.createElement('div');
        pastTitle.style.cssText = 'font-size:9px;color:#6b7c93;text-transform:uppercase;letter-spacing:0.5px;';
        pastTitle.textContent = 'Mastered';
        const pastList = document.createElement('div');
        pastList.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:140px;overflow-y:auto;';
        pastList.innerHTML = '<div style="color:#6b7c93;font-size:10px;">Loading...</div>';
        pastBox.appendChild(pastTitle);
        pastBox.appendChild(pastList);
        wrap.appendChild(pastBox);
        this._journeyPastEl = pastList;

        // Next bodies
        const nextBox = document.createElement('div');
        nextBox.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
        const nextTitle = document.createElement('div');
        nextTitle.style.cssText = 'font-size:9px;color:#6b7c93;text-transform:uppercase;letter-spacing:0.5px;';
        nextTitle.textContent = 'Coming Next';
        const nextList = document.createElement('div');
        nextList.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
        nextBox.appendChild(nextTitle);
        nextBox.appendChild(nextList);
        wrap.appendChild(nextBox);
        this._journeyNextEl = nextList;
    }

    async _fetchJourney() {
        if (!this._apiBase || !this._brain) return;
        const token = ++this._journeyFetchToken;
        const brainAtFetch = this._brain;
        try {
            const resp = await fetch(
                this._apiBase + `/api/training/history?brain=${brainAtFetch}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            // Drop response if the user switched brains while the request
            // was in flight, otherwise the older fetch could overwrite the
            // newer brain's panel.
            if (token !== this._journeyFetchToken || brainAtFetch !== this._brain) {
                return;
            }
            this._journeySeen = new Set();
            this._renderJourneyAdvances(data.advances || []);
            this._renderJourneyNextBodies(data.next_bodies || []);
        } catch (e) {
            if (token !== this._journeyFetchToken) return;
            console.warn('Failed to load training history:', e);
            if (this._journeyPastEl) {
                this._journeyPastEl.innerHTML =
                    '<div style="color:#6b7c93;font-size:10px;">History unavailable</div>';
            }
        }
    }

    _renderJourneyAdvances(advances) {
        const list = this._journeyPastEl;
        if (!list) return;
        list.innerHTML = '';
        if (!advances.length) {
            list.innerHTML = '<div style="color:#6b7c93;font-size:10px;">No advances recorded yet</div>';
            return;
        }
        for (const a of advances) {
            this._appendJourneyEntry(a);
        }
        // Scroll to most recent (bottom).
        list.scrollTop = list.scrollHeight;
    }

    _appendJourneyEntry(adv) {
        const list = this._journeyPastEl;
        if (!list) return;
        // Guard against duplicates (memory recall + live append + re-fetch).
        const num = adv.advance_number;
        if (num != null) {
            if (this._journeySeen.has(num)) return;
            this._journeySeen.add(num);
        }
        // Clear "no advances yet" placeholder on first real entry.
        if (list.children.length === 1
            && list.children[0].textContent
            && list.children[0].textContent.startsWith('No advances')) {
            list.innerHTML = '';
        }
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;line-height:1.4;';
        const dot = document.createElement('span');
        const colors = {
            locomotion: '#22aaff', manipulation: '#38d97a',
            head: '#f5c842', speech: '#a855f7',
        };
        dot.style.cssText = `width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${colors[adv.task_channel] || '#6b7c93'};`;
        const label = document.createElement('span');
        label.style.cssText = 'color:#c8d6e5;flex:1;';
        label.textContent = _formatTaskName(adv.prev_task);
        const meta = document.createElement('span');
        meta.style.cssText = 'color:#6b7c93;font-size:9px;flex-shrink:0;';
        const when = _formatRelativeTime(adv.mastered_at);
        const cycle = adv.cycle_duration_s
            ? _formatDuration(adv.cycle_duration_s) : '';
        meta.textContent = when ? (cycle ? `${when} · ${cycle}` : when) : cycle;
        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(meta);
        list.appendChild(row);
    }

    _renderJourneyNextBodies(nextBodies) {
        const list = this._journeyNextEl;
        if (!list) return;
        list.innerHTML = '';
        if (!nextBodies.length) {
            list.innerHTML = '<div style="color:#6b7c93;font-size:10px;">No future bodies planned</div>';
            return;
        }
        for (const b of nextBodies) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;line-height:1.4;';
            const badge = document.createElement('span');
            const isPlanned = b.status === 'planned';
            const isAvailable = b.status === 'available';
            badge.style.cssText = 'font-size:8px;padding:1px 5px;border-radius:3px;flex-shrink:0;' +
                (isPlanned
                    ? 'background:rgba(245,200,66,0.15);color:#f5c842;'
                    : isAvailable
                        ? 'background:rgba(56,217,122,0.15);color:#38d97a;'
                        : 'background:rgba(255,255,255,0.05);color:#6b7c93;');
            badge.textContent = (b.status || '').toUpperCase();
            const label = document.createElement('span');
            label.style.cssText = 'color:#c8d6e5;flex:1;';
            label.textContent = b.label || b.name || '?';
            row.appendChild(badge);
            row.appendChild(label);
            row.title = b.description || '';
            list.appendChild(row);
        }
    }

    appendLiveAdvance(evt) {
        // Hook for body.html: called from data.onTrainingAdvance so the
        // panel updates without waiting for the next /api/training/history
        // poll. evt is the raw curriculum_advance NATS payload.
        if (!evt || evt.advance_number == null) return;
        this._appendJourneyEntry({
            prev_task: evt.prev_task,
            task_channel: evt.task_channel,
            advance_number: evt.advance_number,
            cycle_duration_s: evt.cycle_duration_s,
            mastered_at: evt.mastered_at,
        });
        if (this._journeyPastEl) {
            this._journeyPastEl.scrollTop = this._journeyPastEl.scrollHeight;
        }
    }

    _buildPushTargets(rootBody, pushBodies) {
        // Build push directions for the root body
        const targets = [];
        if (rootBody) {
            targets.push({ label: 'Push Fwd', body: rootBody, force: [0, 15, 0] });
            targets.push({ label: 'Push Back', body: rootBody, force: [0, -15, 0] });
            targets.push({ label: 'Push Right', body: rootBody, force: [15, 0, 0] });
            targets.push({ label: 'Push Left', body: rootBody, force: [-15, 0, 0] });
        }
        return targets;
    }

    _shortName(name) {
        // "r_shoulder_pitch" -> "Sh Pitch", "swing" -> "Swing", "hip_r" -> "Hip R"
        const parts = name.replace(/^[rl]_/, '').split('_');
        const abbr = {
            shoulder: 'Sh', hip: 'Hip', ankle: 'Ankle', wrist: 'Wrist',
            waist: 'Waist', neck: 'Neck', knee: 'Knee', elbow: 'Elbow',
            swing: 'Swing',
        };
        return parts.map(p => abbr[p] || (p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
    }

    _makeSection(title, contentFn) {
        const sec = document.createElement('div');
        sec.className = 'guide-section';
        const h = document.createElement('div');
        h.className = 'guide-section-title';
        h.textContent = title;
        sec.appendChild(h);
        sec.appendChild(contentFn());
        return sec;
    }

    _sendPose(joints) {
        const ch = this._detectChannel(joints);
        if (ch && this.onPreview) this.onPreview(ch);

        if (this._teachMode) {
            this._send({ action: 'teach', joints, repeats: this._teachRepeats });
            this._setTeachStatus(`Teaching ${this._teachRepeats}x...`);
        } else {
            this._send({ action: 'pose', joints });
        }
    }

    _setTeachStatus(msg) {
        if (this._statusEl) this._statusEl.textContent = msg;
    }

    updateTeachProgress(current, total) {
        if (current >= total) {
            this._setTeachStatus(`Done (${total}/${total})`);
            setTimeout(() => this._setTeachStatus(''), 3000);
        } else {
            this._setTeachStatus(`Teaching ${current}/${total}...`);
        }
    }

    _getAllSliderValues() {
        const joints = {};
        for (const [name, slider] of Object.entries(this._sliders)) {
            joints[name] = parseInt(slider.value) || 0;
        }
        return joints;
    }

    _sendPush(body, force) {
        const ch = 'locomotion';
        if (this.onPreview) this.onPreview(ch);
        this._send({ action: 'push', body, force });
    }

    _sendReward(channel, success) {
        this._send({ action: 'reward', channel, success });
    }

    _sendReset() {
        this._send({ action: 'reset' });
        for (const [, slider] of Object.entries(this._sliders)) {
            slider.value = 0;
            slider.nextElementSibling.textContent = '0';
        }
    }

    _detectChannel(joints) {
        if (!this._bodyInfo) return null;
        // Build joint->channel map from body info
        const jcMap = {};
        for (const j of (this._bodyInfo.joints || [])) {
            jcMap[j.name] = j.channel;
        }
        const counts = {};
        for (const [name, angle] of Object.entries(joints)) {
            if (Math.abs(angle) < 0.5) continue;
            const ch = jcMap[name];
            if (ch) counts[ch] = (counts[ch] || 0) + 1;
        }
        let best = null, bestN = 0;
        for (const [ch, n] of Object.entries(counts)) {
            if (n > bestN) { best = ch; bestN = n; }
        }
        return best;
    }

    /**
     * Show a transient notification toast for training events.
     */
    showAdvanceNotification(data) {
        const isComplete = data.curriculum_complete;
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;' +
            'padding:12px 18px;border-radius:8px;font-size:12px;max-width:320px;' +
            'opacity:1;transition:opacity 0.3s ease;' +
            (isComplete
                ? 'background:rgba(56,217,122,0.95);color:#fff;border:1px solid #38d97a;'
                : 'background:rgba(34,211,238,0.9);color:#fff;border:1px solid #22d3ee;');
        const titleText = isComplete ? 'Curriculum Complete!' : 'Task Advanced!';
        const detailText = isComplete
            ? `All tasks mastered (advance #${data.advance_number}). Ready for next body.`
            : `${data.prev_task} completed (advance #${data.advance_number}, cycle ${_formatDuration(data.cycle_duration_s)})`;
        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:600;margin-bottom:3px;';
        titleEl.textContent = titleText;
        const detailEl = document.createElement('div');
        detailEl.style.cssText = 'opacity:0.9;';
        detailEl.textContent = detailText;
        toast.appendChild(titleEl);
        toast.appendChild(detailEl);
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s';
            setTimeout(() => toast.remove(), 500);
        }, isComplete ? 10000 : 5000);
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function _formatBodyName(name) {
    const names = {
        'pendulum': 'Pendulum (1-DOF)',
        'arm_2dof': 'Arm (2-DOF)',
        'walker_4dof': 'Walker (4-DOF)',
        'humanoid_29dof': 'Humanoid (29-DOF)',
    };
    return names[name] || name || 'Unknown';
}

function _formatDuration(seconds) {
    if (!seconds || seconds < 0) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function _formatTaskName(name) {
    const names = {
        'pendulum_balance': 'Pendulum Balance',
        'supported_stand': 'Supported Stand',
        'stand': 'Stand',
        'head_track': 'Head Track',
        'balance': 'Balance',
        'reach': 'Reach',
        'reach_and_hold': 'Reach & Hold',
        'precision_reach': 'Precision Reach',
        'tracking': 'Tracking',
        'sequence_reach': 'Sequence Reach',
        'walk_first_step': 'Walk First Step',
        'walk_short': 'Walk Short',
        'walk': 'Walk',
        'speech_babbling': 'Speech Babbling',
        'speech_first_words': 'First Words',
        'speech_tokens': 'Speech Tokens',
        'speech_repeat': 'Speech Repeat',
        'speech_association': 'Speech Association',
        'speech_echolalia': 'Echolalia',
        'speech_sequence': 'Speech Sequence',
        'speech_composition': 'Speech Composition',
        'speech_turn_taking': 'Turn Taking',
    };
    return names[name] || name || '?';
}

function _formatRelativeTime(epochSeconds) {
    if (epochSeconds == null || epochSeconds === 0) return '';
    const now = Date.now() / 1000;
    const delta = now - epochSeconds;
    if (delta < 0) return 'just now';
    if (delta < 60) return `${Math.round(delta)}s ago`;
    if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
    return `${Math.round(delta / 86400)}d ago`;
}

function _nextBodyInProgression(currentName) {
    const idx = BODY_PROGRESSION.indexOf(currentName);
    if (idx < 0 || idx >= BODY_PROGRESSION.length - 1) return null;
    return BODY_PROGRESSION[idx + 1];
}
