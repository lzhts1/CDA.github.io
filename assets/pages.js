(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ids = ["A", "B", "C", "D"];
  const kinds = {read: "观察", write: "操作", add: "新增", update: "修订", retire: "退役", error: "未执行", stop: "完成"};
  const tables = {u_cda_wow_user: "用户", u_cda_wow_incident: "工单", u_cda_wow_problem: "问题单", u_cda_wow_hardware: "硬件"};
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const makeTrack = (events = [], initial = []) => ({events, initial, shown: 0, pending: null});
  const state = {
    data: null, mode: "replay", view: 0, focus: null, playing: false, frame: null, delay: null,
    replay: [], live: {tracks: ids.map(() => makeTrack()), ready: false, connected: false,
      info: null, cursor: 0, csrf: "", model: "", completed: [], status: "idle", busy: false,
      poll: null, polling: false, session: null, restoreBefore: null, error: ""}
  };
  const explorer = $("explorer");
  const tracks = () => state.mode === "replay" ? state.replay : state.live.tracks;
  const track = () => tracks()[state.view];
  const speed = () => Number($("speed-select").value) || 1;
  const isComplete = (index) => {
    const t = tracks()[index];
    return !!t && !t.pending && t.shown === t.events.length && (state.mode === "replay" ? t.events.length > 0 : state.live.completed.includes(ids[index]));
  };
  const firstUnfinished = () => ids.findIndex((_, i) => !isComplete(i));
  const canSelect = (index) => { const first = firstUnfinished(); return first === -1 || index <= first; };
  const displayEvent = () => {
    const t = track();
    return state.focus !== null ? t.events[state.focus] : t.pending ? t.events[t.pending.index] : t.events[t.shown - 1];
  };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function error(message = "") {
    $("error-message").textContent = message;
    $("error-message").hidden = !message;
  }
  function valueText(value) {
    if (value === null || value === "") return "（空）";
    return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  }
  function currentRules() {
    const t = track();
    return state.focus !== null ? t.events[state.focus].snapshot : t.shown > 0 ? t.events[t.shown - 1].snapshot : t.initial;
  }
  let memoryHighlightKey = "";
  function renderMemory() {
    const t = track();
    const event = state.focus !== null ? t.events[state.focus] : t.events[t.shown - 1];
    const rules = currentRules() || [];
    $("rule-total").textContent = String(rules.length).padStart(2, "0");
    $("rules-empty").hidden = rules.length > 0;
    const list = $("rules-list");
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    const changed = event && ["add", "update", "retire"].includes(event.kind) ? event.rule?.id : null;
    const appendRule = (rule, retired = false) => {
      const highlight = rule.id === changed;
      const row = element("div", `rule-row${highlight ? " highlight" : ""}${retired ? " retired-row" : ""}`);
      row.dataset.ruleId = rule.id;
      const table = tables[rule.table] || rule.table;
      const text = rule.text.startsWith(table + "：") ? rule.text.slice(table.length + 1) : rule.text;
      row.append(element("span", "rule-id", rule.id), element("span", "rule-table", table), element("span", "rule-text", text));
      row.append(element("span", `rule-badge${highlight ? " " + event.kind : ""}`, highlight ? kinds[event.kind] : "已保留"));
      $("rules-list").append(row);
    };
    // Retired entries leave active memory. Their before/after stays in the output.
    rules.forEach((rule) => appendRule(rule));
    list.scrollTop = scrollTop;
    const highlightKey = `${state.mode}:${state.view}:${event?.turn}:${state.focus}`;
    if (changed && highlightKey !== memoryHighlightKey) {
      const row = Array.from(list.children).find(node => node.dataset.ruleId === changed);
      if (row) {
        if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
        else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
      }
    }
    memoryHighlightKey = highlightKey;
    $("count-added").textContent = event?.stats?.added || 0;
    $("count-updated").textContent = event?.stats?.updated || 0;
    $("count-retired").textContent = event?.stats?.retired || 0;
  }
  function renderHistory() {
    const t = track();
    $("history-count").textContent = t.shown;
    $("history-list").replaceChildren();
    t.events.slice(0, t.shown).forEach((event, index) => {
      const button = element("button", `history-event${index === (state.focus ?? t.shown - 1) ? " selected" : ""}`);
      button.type = "button";
      button.disabled = state.mode === "live" && (state.live.status === "running" || !!t.pending || t.shown < t.events.length);
      button.append(element("span", "", String(event.turn).padStart(2, "0")), element("span", "", event.title), element("span", "", kinds[event.kind] || "观察"));
      button.addEventListener("click", () => {
        if (state.mode === "live" && (state.live.status === "running" || t.pending || t.shown < t.events.length)) return;
        pause(); state.focus = index; render();
      });
      $("history-list").append(button);
    });
  }
  function renderDiff(event, visible) {
    const node = $("rule-diff");
    node.replaceChildren();
    const show = visible && event && ["update", "retire"].includes(event.kind);
    node.hidden = !show;
    if (!show) return;
    if (event.before_rule) {
      const row = element("div", "diff-line diff-before");
      row.append(element("span", "", "−"), element("span", "", event.before_rule.text)); node.append(row);
    }
    if (event.kind === "update" && event.rule) {
      const row = element("div", "diff-line diff-after");
      row.append(element("span", "", "+"), element("span", "", event.rule.text)); node.append(row);
    }
  }
  function renderAction() {
    const t = track();
    const event = displayEvent();
    const waiting = state.mode === "live" && state.live.status === "running" && !t.pending && t.shown >= t.events.length;
    $("action-parameters").replaceChildren();
    $("rule-diff").hidden = true;
    if (!event) {
      $("action-tool").textContent = waiting ? "MODEL CALL" : "READY TO EXPLORE";
      $("action-title").textContent = state.view === 0 ? "先观察，再行动。" : "带着已有的记忆，继续探索。";
      $("action-kind").textContent = "INPUT";
      $("action-parameters").append(element("p", "empty-copy", state.view === 0 ? "每一轮展示 AI 实际选择的操作与参数。" : `已继承 ${t.initial.length} 条规则认识，等待新的观察。`));
      $("narrative-output").textContent = waiting ? "模型正在选择下一步操作…" : state.view === 0 ? "点击「开始探索」，观察第一条规则如何形成。" : "世界已经变化。已有的规则，会被保留、修订，还是退役？";
      $("typing-status").textContent = waiting ? "正在调用模型" : state.view === 0 ? "规则记忆从空白开始" : `从世界 ${ids[state.view - 1]} 继续`;
      $("turn-label").textContent = `WORLD ${ids[state.view]} · READY`;
      $("output-kind").textContent = "OBSERVATION → MEMORY";
      return;
    }
    $("action-tool").textContent = event.tool;
    $("action-title").textContent = event.title;
    $("action-kind").textContent = kinds[event.kind] || "观察";
    const entries = Object.entries(event.parameters || {});
    for (const [key, value] of entries) {
      const row = element("div", "parameter-row");
      row.append(element("span", "parameter-key", key), element("span", "parameter-value", valueText(value)));
      $("action-parameters").append(row);
    }
    if (!entries.length) $("action-parameters").append(element("p", "empty-copy", event.kind === "stop" ? "本世界探索结束，保留当前规则表。" : "本轮没有额外输入参数。"));
    const isTyping = !!t.pending && state.focus === null;
    $("narrative-output").textContent = isTyping ? t.pending.chars.slice(0, Math.floor(t.pending.visible)).join("") : event.narrative;
    $("typing-status").textContent = state.focus !== null ? "正在回看已完成的探索" : isTyping ? "正在呈现探索结果" : waiting ? "模型正在选择下一步操作…" : event.kind === "stop" ? "本世界探索已完成" : ["add", "update", "retire"].includes(event.kind) ? "规则表已同步更新" : "等待下一轮探索";
    $("turn-label").textContent = `WORLD ${ids[state.view]} · TURN ${String(event.turn).padStart(2, "0")}`;
    $("output-kind").textContent = ["add", "update", "retire"].includes(event.kind) ? "UPDATING MEMORY" : "OBSERVING THE WORLD";
    renderDiff(event, !isTyping);
  }
  function renderControls() {
    if (!state.data) return;
    const t = track();
    const complete = isComplete(state.view);
    const live = state.mode === "live";
    const running = live && state.live.status === "running";
    const presenting = live && state.live.completed.includes(ids[state.view]) && !complete;
    const viewingPast = state.focus !== null && state.focus !== t.shown - 1;
    explorer.dataset.mode = state.mode;
    explorer.dataset.world = ids[state.view];
    explorer.dataset.playing = String(live ? running || !!t.pending : state.playing);
    explorer.dataset.complete = String(complete);
    explorer.dataset.eventIndex = String(t.pending?.index ?? t.shown - 1);
    explorer.classList.toggle("is-playing", live ? running || !!t.pending : state.playing);
    explorer.classList.toggle("typing", !!t.pending && state.focus === null);
    explorer.classList.toggle("reviewing", viewingPast);
    ids.forEach((id, index) => {
      const button = $("world-" + id);
      button.disabled = !canSelect(index) || (running && index !== ids.indexOf(state.live.info?.world));
      button.setAttribute("aria-selected", String(index === state.view));
      button.classList.toggle("complete", isComplete(index));
      button.querySelector(".world-indicator").textContent = isComplete(index) ? "✓" : String(index + 1).padStart(2, "0");
    });
    $("mode-replay").setAttribute("aria-pressed", String(!live));
    $("mode-live").setAttribute("aria-pressed", String(live));
    $("world-name").textContent = `世界 ${ids[state.view]}`;
    $("world-status").textContent = viewingPast ? "回看记录" : complete ? "已完成" : live ? state.live.error ? "探索中断" : running ? "探索中" : "准备开始" : state.playing ? "探索中" : t.shown || t.pending ? "已暂停" : "准备开始";
    $("world-progress").textContent = `${t.shown} / ${live && !state.live.completed.includes(ids[state.view]) ? "…" : t.events.length}`;
    $("progress-fill").style.width = `${complete ? 100 : t.events.length ? t.shown / t.events.length * 100 : 0}%`;
    $("play-button").disabled = live ? !state.live.ready || state.live.busy || running || presenting || state.live.status === "failed" || complete : complete;
    $("play-button").textContent = live ? running ? "正在探索…" : presenting ? "正在呈现结果…" : state.live.busy ? "正在连接…" : complete ? "本世界已完成" : "开始实时探索 ↗" : complete ? "本世界已完成" : state.playing ? "暂停" : t.shown || t.pending ? "继续探索 ↗" : "开始探索 ↗";
    $("step-button").disabled = live || complete;
    $("speed-select").disabled = false;
    $("restart-button").disabled = live && (running || state.live.busy || !state.live.connected);
    $("next-world").disabled = !complete || state.view === 3;
    $("next-world").textContent = state.view === 3 ? "四个世界探索完成 ✓" : `进入世界 ${ids[state.view + 1]} →`;
    $("model-label").textContent = live ? "探索模型" : "回放模型";
    $("recorded-model").hidden = live && state.live.connected;
    $("recorded-model").textContent = live ? "等待连接" : state.data.model === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : state.data.model;
    $("model-select").hidden = !live || !state.live.connected;
    $("model-select").disabled = running || state.live.cursor > 0 || state.live.busy;
    $("mode-caption").textContent = live ? state.live.connected ? "模型 API · ServiceNow" : "连接本地后端" : "真实探索记录 · 逐字回放";
    $("live-connection").hidden = !live || state.live.connected;
    $("source-caption").textContent = live ? "实时探索 · 独立运行" : `四世界探索记录 · Run ${String(state.data.source?.repetition || 1).padStart(2, "0")}`;
    $("memory-caption").textContent = state.view === 3 ? "↳ 四个世界，共用一份持续维护的规则记忆。" : "↳ 本世界的规则记忆将带入下一个世界。";
  }
  function render() {
    if (!state.data) return;
    renderControls(); renderAction(); renderMemory(); renderHistory();
  }
  function cancelAnimation() {
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    clearTimeout(state.delay);
    state.frame = state.delay = null;
  }
  function pause() {
    state.playing = false; cancelAnimation();
    if (track()?.pending) track().pending.last = null;
  }
  function finishEvent() {
    const t = track();
    if (!t.pending) return;
    t.shown = t.pending.index + 1; t.pending = null;
    if (state.mode === "replay" && isComplete(state.view)) state.playing = false;
    render();
  }
  function pump() {
    state.frame = null;
    state.delay = null;
    if (!state.data) return;
    const t = track();
    if (state.mode === "replay" && !state.playing) return;
    if (!t.pending) {
      if (t.shown >= t.events.length) { renderControls(); return; }
      const event = t.events[t.shown];
      t.pending = {index: t.shown, chars: Array.from(event.narrative || ""), visible: 0, last: null};
      state.focus = null; render();
    }
    if (reducedMotion.matches) {
      finishEvent(); state.delay = setTimeout(pump, 100); return;
    }
    function tick(time) {
      const p = t.pending;
      if (!p || (state.mode === "replay" && !state.playing)) return;
      if (p.last !== null) p.visible = Math.min(p.chars.length, p.visible + (time - p.last) * 0.028 * speed());
      p.last = time;
      $("narrative-output").textContent = p.chars.slice(0, Math.floor(p.visible)).join("");
      if (p.visible >= p.chars.length) {
        finishEvent(); state.frame = null;
        state.delay = setTimeout(pump, 280 / speed());
      } else state.frame = requestAnimationFrame(tick);
    }
    state.frame = requestAnimationFrame(tick);
  }
  function selectWorld(index) {
    if (!canSelect(index)) return;
    pause(); state.view = index; state.focus = null; render();
    if (state.mode === "live") pump();
  }
  function step() {
    if (state.mode !== "replay" || !state.data || isComplete(state.view)) return;
    pause(); state.focus = null;
    const t = track();
    if (t.pending) finishEvent();
    else if (t.shown < t.events.length) { t.shown += 1; render(); }
  }
  async function api(path, payload) {
    const options = {credentials: "same-origin", signal: AbortSignal.timeout(15000)};
    if (payload !== undefined) {
      options.method = "POST";
      options.headers = {"Content-Type": "application/json", "X-CSRF-Token": state.live.csrf};
      options.body = JSON.stringify(payload);
    }
    const response = await fetch(path, options);
    let result;
    try { result = await response.json(); } catch { throw new Error("服务暂时没有响应，请检查本地探索服务。"); }
    if (!response.ok) throw new Error(result.message || (typeof result.error === "string" ? result.error : result.error?.message) || "探索请求未完成，请检查后端状态。");
    return result;
  }
  function applyStatus(info) {
    const live = state.live;
    live.info = {...live.info, ...info};
    if ("ready" in info) live.ready = Boolean(info.ready);
    live.status = info.status || "idle";
    live.completed = info.completed_worlds || [];
    if ("session_id" in info) live.session = info.session_id;
    if (info.session_id && info.model) {
      live.model = info.model;
      $("model-select").value = live.model;
    }
    if (info.csrf_token) live.csrf = info.csrf_token;
    if (info.error) { live.error = typeof info.error === "string" ? info.error : info.error.message || "本次探索中断，请重新开始。"; if (state.mode === "live") error(live.error); }
    else if (info.status !== "failed") { live.error = ""; if (state.mode === "live") error(); }
    // An untouched next world inherits exactly the previous completed snapshot.
    for (let i = 1; i < 4; i++) {
      const previous = live.tracks[i - 1], next = live.tracks[i];
      if (live.completed.includes(ids[i - 1])) next.initial = previous.events.at(-1)?.snapshot || previous.initial;
    }
  }
  async function pollLive() {
    const live = state.live;
    if (live.polling || !live.connected) return;
    live.polling = true;
    let pollAgain = false;
    try {
      const data = await api(`/api/exploration/events?after=${live.cursor}`);
      if (data.reset_required || (live.session && live.session !== data.session_id)) {
        if (state.mode === "live") cancelAnimation();
        live.tracks = ids.map(() => makeTrack()); live.cursor = 0;
        live.session = data.session_id;
        if (state.mode === "live") { state.view = 0; state.focus = null; }
        applyStatus(data);
        live.restoreBefore = Math.max(0, ids.indexOf(data.world));
        pollAgain = true;
        render();
        return;
      }
      const fresh = data.events || [];
      for (const event of fresh) {
        const index = ids.indexOf(event.world || data.world);
        if (index >= 0) live.tracks[index].events.push(event);
      }
      live.cursor = data.cursor ?? live.cursor;
      applyStatus(data);
      if (live.restoreBefore !== null) {
        for (let i = 0; i < live.restoreBefore; i++) {
          if (live.completed.includes(ids[i])) {
            live.tracks[i].shown = live.tracks[i].events.length;
            live.tracks[i].pending = null;
          }
        }
        if (state.mode === "live") state.view = live.restoreBefore;
        live.restoreBefore = null;
      }
      if (state.mode === "live") {
        renderControls();
        if (!state.frame && !state.delay) pump();
        if (!track().pending) render();
      }
    } catch (reason) {
      if (state.mode === "live") error(reason.message);
    } finally {
      live.polling = false;
      clearTimeout(live.poll);
      if (pollAgain || live.status === "running" || live.busy) live.poll = setTimeout(pollLive, pollAgain ? 10 : 700);
    }
  }
  async function connectLive() {
    if (location.hostname.endsWith("github.io")) { render(); return; }
    try {
      const info = await api("/api/exploration/status");
      const live = state.live;
      if (!info.session_id || (live.session && live.session !== info.session_id)) {
        if (state.mode === "live") { cancelAnimation(); state.view = 0; state.focus = null; }
        live.tracks = ids.map(() => makeTrack()); live.cursor = 0;
        live.error = ""; live.restoreBefore = null;
      }
      live.connected = true; applyStatus(info);
      const options = info.models || info.model_options || [];
      $("model-select").replaceChildren();
      for (const model of options) {
        const option = element("option", "", typeof model === "string" ? model : model.label || model.id);
        option.value = typeof model === "string" ? model : model.id;
        $("model-select").append(option);
      }
      if (info.session_id) live.model = info.model;
      else live.model ||= info.model || $("model-select").value;
      $("model-select").value = live.model;
      if (live.cursor === 0 && info.session_id && ids.includes(info.world)) live.restoreBefore = ids.indexOf(info.world);
      if (!live.ready && state.mode === "live") error("实时探索配置尚未就绪，请检查本地服务的模型和实例配置。");
      await pollLive();
    } catch {
      state.live.connected = false;
      if (state.mode === "live") error("启动本地探索服务后，即可开始实时探索。");
    }
    render();
  }
  async function startLive() {
    const live = state.live;
    if (!live.ready || live.busy || live.status === "running" || live.completed.includes(ids[state.view])) return;
    live.busy = true; error(); renderControls();
    try {
      const info = await api("/api/exploration/start", {world: ids[state.view], model: live.model});
      applyStatus(info);
      if (state.mode === "live") state.focus = null;
      clearTimeout(live.poll); await pollLive();
    } catch (reason) { error(reason.message); }
    finally { live.busy = false; renderControls(); }
  }
  async function restart() {
    pause(); state.focus = null;
    if (state.mode === "replay") {
      state.replay = state.data.worlds.map((world) => makeTrack(world.events, world.initial_rules));
      state.view = 0; error(); render(); return;
    }
    const live = state.live;
    if (live.status === "running" || !live.connected || live.busy) return;
    live.busy = true; renderControls();
    try {
      const info = await api("/api/exploration/reset", {});
      clearTimeout(live.poll); live.tracks = ids.map(() => makeTrack()); live.cursor = 0;
      live.error = ""; live.session = info.session_id; applyStatus(info);
      if (state.mode === "live") { state.view = 0; error(); }
    } catch (reason) { error(reason.message); }
    finally { live.busy = false; render(); }
  }
  const views = {replay: 0, live: 0};
  async function setMode(mode) {
    if (state.mode === mode || !state.data) return;
    views[state.mode] = state.view; pause(); state.mode = mode; state.view = views[mode]; state.focus = null;
    error(); render();
    if (mode === "live") await connectLive();
  }
  $("mode-replay").addEventListener("click", () => setMode("replay"));
  $("mode-live").addEventListener("click", () => setMode("live"));
  ids.forEach((id, index) => $("world-" + id).addEventListener("click", () => selectWorld(index)));
  $("play-button").addEventListener("click", () => {
    if (state.mode === "live") { startLive(); return; }
    if (state.playing) { pause(); renderControls(); return; }
    if (isComplete(state.view)) return;
    state.focus = null; state.playing = true; cancelAnimation(); pump(); renderControls();
  });
  $("step-button").addEventListener("click", step);
  $("restart-button").addEventListener("click", restart);
  $("next-world").addEventListener("click", () => { if (isComplete(state.view) && state.view < 3) selectWorld(state.view + 1); });
  $("model-select").addEventListener("change", () => { state.live.model = $("model-select").value; });
  document.addEventListener("visibilitychange", () => { if (document.hidden && state.mode === "replay" && state.playing) { pause(); renderControls(); } });
  async function initialize() {
    try {
      const response = await fetch("./data/exploration.json", {credentials: "omit"});
      if (!response.ok) throw new Error("无法读取探索记录，请刷新页面重试。");
      const data = await response.json();
      if (data.schema !== "cda.exploration.v1" || data.worlds?.map(w => w.id).join("") !== "ABCD") throw new Error("探索记录格式不匹配。");
      state.data = data;
      state.replay = data.worlds.map((world) => makeTrack(world.events, world.initial_rules));
      render();
    } catch (reason) { error(reason.message); }
  }
  initialize();
})();
