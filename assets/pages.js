"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const state = { data: null, model: null, example: null, mode: "learning", revealed: 0, selectedStep: 0, timer: null, allChanges: false };
  const labels = { state: "状态", incident_state: "工单状态", priority: "优先级", impact: "影响程度", urgency: "紧急程度", assigned_to: "负责人", assignment_group: "负责团队", problem_id: "关联问题单", caller_id: "报告人", short_description: "简要说明", description: "详细说明", active: "启用状态", department: "部门", user_name: "用户名", first_name: "名字", last_name: "姓氏", name: "名称", email: "电子邮箱", close_code: "解决方式", close_notes: "解决说明", resolved_at: "解决时间", resolved_by: "解决人", number: "编号", u_user: "关联人员", u_clearance_level: "访问级别", work_notes: "处理备注", comments: "备注", value: "记录内容", stage: "阶段" };
  const descriptions = { create_incident: "创建故障工单，观察优先级与关联业务记录。", create_user: "创建测试人员，观察人员及访问级别记录。", update_incident: "将工单分派给测试人员，观察工单流转。", add_comment: "添加处理备注，观察日志与关联记录。", resolve_incident: "解决故障工单，观察状态、解决说明及计时变化。" };
  const array = (value) => Array.isArray(value) ? value : [];
  const field = (value) => labels[value] || value || "字段";
  const valueText = (value) => value === null || value === undefined || value === "" ? "（空）" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const changeName = (change) => `${change.table || "记录"}.${field(change.field)}`;
  const percent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
  function node(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined && value !== null) element.textContent = String(value);
    return element;
  }
  function rawDetails(value, title = "原始结果") {
    const details = node("details", "raw-details");
    details.append(node("summary", "", title), node("pre", "", JSON.stringify(value, null, 2)));
    return details;
  }
  function currentModel() { return array(state.data?.models).find((item) => item.id === state.model); }
  function currentExample() { return array(currentModel()?.examples).find((item) => item.id === state.example); }
  function triggerSentence(trigger) {
    const label = field(trigger.field);
    const op = trigger.op || "changes";
    if (op === "changes") return `${label}发生变化`;
    if (op === "changes_to") return `${label}变为 ${valueText(trigger.value)}`;
    if (["equals", "is", "eq", "="].includes(op)) return `${label}为 ${valueText(trigger.value)}`;
    if (["not_equals", "is_not", "ne", "!="].includes(op)) return `${label}不为 ${valueText(trigger.value)}`;
    return `${label} ${op}${trigger.value === undefined ? "" : ` ${valueText(trigger.value)}`}`;
  }
  function ruleEffect(rule) {
    const target = `${rule.effect_table || rule.table}.${field(rule.effect_field)}`;
    if (rule.effect_kind === "lookup") return `${target}根据 ${array(rule.effect_lookup?.inputs).map(field).join("、")} 的对应关系确定`;
    if (rule.effect_kind === "computed") return `${target}由 ${array(rule.effect_formula?.inputs).map(field).join("、")} 计算生成`;
    if (rule.effect_kind === "transform") return `${target}按转换规则更新`;
    if (rule.effect_kind === "copy") return `${target}复制 ${field(rule.effect_source_field || rule.trigger_field)} 的值`;
    return `${target}变为 ${valueText(rule.effect_value)}`;
  }
  function renderRules() {
    const learning = state.data.learning || {};
    const rules = array(learning.rules);
    $("learning-sample-count").textContent = String(learning.sample_count ?? 20);
    $("learning-rule-count").textContent = String(learning.rules_count ?? rules.length);
    $("learning-status").textContent = "学习完成";
    $("rules-summary-count").textContent = `· ${rules.length} 条`;
    $("rules-list").replaceChildren(...rules.map((rule, index) => {
      const item = node("article", "learned-rule");
      const heading = node("div", "rule-heading");
      heading.append(node("code", "", rule.id || `规则 ${index + 1}`), node("span", "", rule.table || "业务规则"));
      if (Number.isFinite(rule.confidence)) heading.append(node("span", "rule-confidence", `置信度 ${percent(rule.confidence)}`));
      const conditions = [triggerSentence({ field: rule.trigger_field, op: rule.trigger_op, value: rule.trigger_value }), ...array(rule.additional_triggers).map(triggerSentence)];
      item.append(heading, node("p", "rule-condition", `当 ${conditions.join("，并且 ")}`), node("p", "rule-effect", `则 ${ruleEffect(rule)}`), rawDetails(rule, "查看规则结构"));
      return item;
    }));
  }
  function changeList(changes, predicted = false) {
    const rows = array(changes);
    if (!rows.length) return node("p", "prediction-empty", predicted ? "未预测到字段变化" : "没有记录到字段变化");
    const list = node("ul", "prediction-changes");
    for (const change of rows) {
      const item = node("li", "");
      item.append(node("strong", "", changeName(change)));
      const result = predicted ? `变为 ${valueText(change.value)}` : `${change.baseline_known === false ? "—" : valueText(change.old_value)} → ${valueText(change.value)}`;
      item.append(node("code", "", result));
      list.append(item);
    }
    return list;
  }
  function comparisonColumn(title, changes, predicted) {
    const column = node("div", `comparison-column${predicted ? "" : " archive-column"}`);
    column.append(node("h4", "", `${title} · ${array(changes).length} 项变化`), changeList(changes, predicted));
    return column;
  }
  function renderExample() {
    const model = currentModel();
    const examples = array(model?.examples);
    if (!examples.some((example) => example.id === state.example)) state.example = examples[0]?.id || null;
    $("learning-model").textContent = model?.label || "—";
    $("example-cards").replaceChildren(...examples.map((example, index) => {
      const button = node("button", `example-card${example.id === state.example ? " selected" : ""}`);
      button.type = "button";
      button.dataset.example = example.id;
      button.setAttribute("aria-pressed", String(example.id === state.example));
      button.append(node("span", "example-order", `CASE 0${index + 1}`), node("strong", "", example.title), node("span", "example-source", example.tool_name || example.action?.operation || ""), node("span", "example-phase", "查看预测与结果"));
      button.addEventListener("click", () => { state.example = example.id; renderExample(); });
      return button;
    }));
    const example = currentExample();
    if (!example) {
      $("example-status").textContent = "暂无样例";
      $("example-result").replaceChildren();
      return;
    }
    $("example-selected-title").textContent = example.title;
    $("example-selected-description").textContent = descriptions[example.tool_name] || "查看该操作的模型预测与 WoW 记录。";
    $("example-input").textContent = JSON.stringify(example.parameters || example.action || {}, null, 2);
    $("example-status").textContent = "预测完成";
    const comparison = node("div", "archive-comparison");
    comparison.append(comparisonColumn("模型预测", example.prediction?.changes, true), comparisonColumn("WoW 记录", example.actual?.changes, false));
    const metrics = node("div", "archive-metrics");
    metrics.append(node("strong", "", "对照结果"), node("span", "", `精确率 ${percent(example.metrics?.precision)}`), node("span", "", `召回率 ${percent(example.metrics?.recall)}`), node("span", "", `IoU ${percent(example.metrics?.iou)}`));
    const seconds = Number.isFinite(example.prediction?.seconds) ? ` · ${example.prediction.seconds.toFixed(1)} 秒` : "";
    $("example-result").replaceChildren(comparison, metrics, node("p", "prediction-meta", `${model.label}${seconds}`), rawDetails({ prediction: example.prediction, metrics: example.metrics, actual: example.actual }));
  }
  function stopAuto() {
    if (state.timer !== null) window.clearInterval(state.timer);
    state.timer = null;
  }
  function setMode(mode) {
    state.mode = mode;
    stopAuto();
    const learning = mode === "learning";
    $("learning-pane").hidden = !learning;
    $("workflow-pane").hidden = learning;
    $("mode-learning").classList.toggle("active", learning);
    $("mode-workflow").classList.toggle("active", !learning);
    $("mode-learning").setAttribute("aria-pressed", String(learning));
    $("mode-workflow").setAttribute("aria-pressed", String(!learning));
    renderWorkflow();
  }
  function renderChanges(step) {
    const changes = array(step?.actual?.changes);
    const businessTables = new Set(["incident", "sys_user", "problem", "u_user_group_clearance"]);
    const business = changes.filter((change) => businessTables.has(change.table) && !(change.old_value === "" && change.value === ""));
    const displayed = state.allChanges ? changes : business;
    $("changes-toggle").disabled = !step;
    $("changes-toggle").textContent = state.allChanges ? "仅看业务变化" : "显示全部观测";
    $("changes-toggle").setAttribute("aria-pressed", String(state.allChanges));
    $("changes-count").textContent = step ? `${displayed.length} 项${state.allChanges ? "观测" : "业务变化"}` : "等待回放";
    if (!step) {
      const empty = node("div", "data-empty");
      empty.append(node("strong", "", "等待第一条业务变化"), node("p", "", "这里显示操作前与操作后的字段值。"));
      $("changes-content").replaceChildren(empty);
      return;
    }
    if (!displayed.length) {
      $("changes-content").replaceChildren(node("p", "prediction-empty", "本步骤没有此类变化"));
      return;
    }
    const table = node("table", "change-table");
    const head = node("thead", "");
    const header = node("tr", "");
    ["字段", "操作前", "操作后"].forEach((title) => header.append(node("th", "", title)));
    head.append(header);
    const body = node("tbody", "");
    displayed.forEach((change) => {
      const row = node("tr", "");
      const name = node("td", "");
      name.append(node("span", "field-name", changeName(change)));
      if (change.record_id) name.append(node("span", "field-record", change.record_id));
      row.append(name, node("td", "old-value", change.baseline_known === false ? "—" : valueText(change.old_value)), node("td", "new-value", valueText(change.value)));
      body.append(row);
    });
    table.append(head, body);
    $("changes-content").replaceChildren(table);
  }
  function renderWorkflow() {
    const workflow = state.data?.workflow || {};
    const steps = array(workflow.steps);
    const selected = state.revealed > 0 ? steps[Math.min(state.selectedStep, state.revealed - 1)] : null;
    $("workflow-title").textContent = workflow.title || "故障工单处理";
    $("workflow-model").textContent = workflow.model_label || workflow.model || "模型预测";
    $("step-count").textContent = `${state.revealed} / ${steps.length}`;
    $("timeline").replaceChildren(...steps.map((step, index) => {
      const completed = index < state.revealed;
      const button = node("button", `timeline-item${completed ? " completed" : ""}${selected === step ? " active" : ""}`);
      button.type = "button";
      button.disabled = !completed;
      button.dataset.step = String(index + 1);
      button.setAttribute("aria-current", selected === step ? "step" : "false");
      const text = node("span", "timeline-text");
      text.append(node("span", "timeline-title", step.title), node("span", "timeline-meta", `${String(index + 1).padStart(2, "0")} · ${completed ? "已回放" : "等待回放"}`));
      button.append(node("span", "timeline-index", completed ? "✓" : index + 1), text);
      button.addEventListener("click", () => { state.selectedStep = index; renderWorkflow(); });
      return button;
    }));
    $("playback-status").textContent = state.timer !== null ? "回放中" : state.revealed === steps.length && steps.length ? "回放完成" : state.revealed ? "等待下一步" : "准备就绪";
    $("step-button").disabled = !steps.length || state.revealed >= steps.length || state.timer !== null;
    $("run-button").disabled = !steps.length || state.revealed >= steps.length;
    $("run-button").textContent = state.timer !== null ? "暂停回放" : "自动回放";
    $("reset-button").disabled = !steps.length;
    const completedCount = node("strong", "", state.revealed);
    completedCount.id = "metric-steps";
    completedCount.append(node("small", "", ` / ${steps.length}`));
    $("metric-steps").replaceWith(completedCount);
    $("metric-changes").textContent = String(steps.slice(0, state.revealed).reduce((sum, step) => sum + array(step.actual?.changes).length, 0));
    $("metric-verification").textContent = selected ? selected.verified ? "已验证" : "已记录" : "等待回放";
    $("metric-verification").classList.toggle("passed", !!selected?.verified);
    $("current-kicker").textContent = selected ? `STEP ${String(state.selectedStep + 1).padStart(2, "0")}` : "READY WHEN YOU ARE";
    $("current-title").textContent = selected?.title || "从第一步，看见业务变化";
    $("current-description").textContent = selected ? descriptions[selected.tool_name] || "查看该步骤的预测与系统记录。" : "点击“单步回放”，查看每一步的预测与结果。";
    $("step-tool").hidden = !selected;
    $("step-tool").textContent = selected?.tool_name || "";
    $("workflow-prediction").replaceChildren(selected ? changeList(selected.prediction?.changes, true) : node("p", "muted-empty", "等待第一步回放。"));
    $("workflow-parameters").hidden = !selected;
    $("workflow-input").textContent = selected ? JSON.stringify(selected.parameters || {}, null, 2) : "";
    renderChanges(selected);
  }
  function nextStep() {
    const total = array(state.data?.workflow?.steps).length;
    if (state.revealed >= total) { stopAuto(); renderWorkflow(); return; }
    state.selectedStep = state.revealed;
    state.revealed += 1;
    if (state.revealed >= total) stopAuto();
    renderWorkflow();
  }
  function bindEvents() {
    $("mode-learning").addEventListener("click", () => setMode("learning"));
    $("mode-workflow").addEventListener("click", () => setMode("workflow"));
    $("model-select").addEventListener("change", (event) => { state.model = event.target.value; renderExample(); });
    $("step-button").addEventListener("click", nextStep);
    $("reset-button").addEventListener("click", () => { stopAuto(); state.revealed = 0; state.selectedStep = 0; renderWorkflow(); });
    $("run-button").addEventListener("click", () => {
      if (state.timer !== null) { stopAuto(); renderWorkflow(); return; }
      state.timer = window.setInterval(nextStep, 1100);
      nextStep();
    });
    $("changes-toggle").addEventListener("click", () => { state.allChanges = !state.allChanges; renderWorkflow(); });
  }
  async function load() {
    try {
      const response = await fetch("./data/demo.json", { credentials: "omit" });
      if (!response.ok) throw new Error(`读取演示数据失败（${response.status}）`);
      const data = await response.json();
      if (!array(data.models).length || !array(data.workflow?.steps).length) throw new Error("演示数据不完整，请刷新页面。");
      state.data = data;
      state.model = data.models.some((model) => model.id === data.default_model) ? data.default_model : data.models[0].id;
      $("model-select").replaceChildren(...data.models.map((model) => {
        const option = node("option", "", model.label);
        option.value = model.id;
        return option;
      }));
      $("model-select").value = state.model;
      $("model-select").disabled = false;
      bindEvents();
      renderRules();
      renderExample();
      renderWorkflow();
      document.documentElement.dataset.ready = "true";
    } catch (error) {
      $("load-error").textContent = error.message || "演示数据加载失败，请刷新页面。";
      $("load-error").hidden = false;
      $("learning-status").textContent = "加载失败";
    }
  }
  load();
})();
