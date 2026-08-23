/* ================= CHECKLISTS ================= */
function renderChecklists() {
  const c = $('#content');
  c.innerHTML = `
    <div class="grid-2">
      ${CHECKLIST_TEMPLATES.map(tp => {
        const total = tp.groups.reduce((a, g) => a + g.items.length, 0);
        return `<div class="card kb-card" onclick="navigate('/checklists/${tp.id}')">
          <h4>${tp.kind === 'install' ? '🏗️' : '🔧'} ${esc(tp.title[LANG] || tp.title.fa)}</h4>
          <p>${esc(tp.desc[LANG] || tp.desc.fa)}</p>
          <div class="kb-tags">
            ${typeBadge(tp.type)}
            <span class="badge b-gray">${faNum(total)} ${LANG === 'fa' ? 'مورد' : 'items'}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    <p class="calc-note" style="margin-top:18px">📖 ${t('standardRef')}</p>`;
}
/* Critical-checklist safety gate: an explicit, recorded acknowledgement
   before safety-sensitive work. Dismissal returns to the checklist list.
   The ack is stored in sessionStorage (per browser session) and an entry
   is added to the offline safety log. */
function renderSafetyGate(tp, selectedProject, ackKey) {
  setTimeout(() => {
    const cb = document.getElementById('safetyAck');
    const btn = document.getElementById('safetyContinue');
    if (!cb || !btn) return;
    const sync = () => { btn.disabled = !cb.checked; };
    cb.addEventListener('change', sync); sync();
    btn.onclick = async () => {
      if (!cb.checked) return;
      try {
        const entry = {
          id: _lsUid(), checklistId: tp.id, projectId: selectedProject || '',
          ts: Date.now(), technician: (state.user && state.user.name) || '',
          appVersion: '27'
        };
        await api('/safetyLogs', { method: 'POST', body: entry });
        if (!Array.isArray(state.safetyLogs)) state.safetyLogs = [];
        state.safetyLogs.unshift(entry);
      } catch (e) { /* never block the technician on a log failure */ }
      try { sessionStorage.setItem(ackKey, '1'); } catch (e) {}
      navigate('/checklists/' + tp.id + (selectedProject ? '?project=' + selectedProject : ''));
    };
  }, 0);
  return `
    <button class="btn btn-ghost btn-sm" onclick="navigate('/checklists')" style="margin-bottom:14px">${IC.back} ${t('checklists')}</button>
    <div class="card" style="border:2px solid var(--danger);max-width:560px;margin:0 auto">
      <div class="card-title" style="color:var(--danger)">⚠️ ${t('safetyTitle')} — ${esc(tp.title[LANG] || tp.title.fa)}</div>
      <div class="note-block" style="background:var(--danger-soft);border-color:var(--danger);margin-bottom:14px">
        <strong>${t('safetyCritical')}.</strong><br>
        ${esc(tp.desc[LANG] || tp.desc.fa)}
      </div>
      <ul style="font-size:13.5px;line-height:1.9;padding-inline-start:20px;margin:0 0 14px">
        <li>${LANG === 'fa' ? 'همیشه قبل از کار، برق اصلی را قطع، قفل و برچسب‌گذاری کنید (LOTO) و بی‌برقی را تأیید کنید.' : 'Always isolate, lock out and tag out (LOTO) the main supply before work and verify zero energy.'}</li>
        <li>${LANG === 'fa' ? 'هیچ مدار ایمنی یا وسیلهٔ حفاظتی را پل، بای‌پس یا از کار نیندازید. تجهیز ناایمن باید خارج از سرویس بماند.' : 'Never bridge, bypass or defeat a safety circuit or protective device. Unsafe equipment must remain out of service.'}</li>
        <li>${LANG === 'fa' ? 'از دستورالعمل سازنده و مقررات محلی پیروی کنید؛ این اپ جای قضاوت تخصصی شما نیست.' : 'Follow manufacturer instructions and local regulations; this app does not replace professional judgment.'}</li>
      </ul>
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:13.5px;cursor:pointer;margin-bottom:14px">
        <input type="checkbox" id="safetyAck" style="width:20px;height:20px;margin-top:2px" />
        <span>${t('safetyAck')}</span>
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="navigate('/checklists')">${t('safetyCancel')}</button>
        <button class="btn btn-danger" id="safetyContinue" disabled>${t('safetyContinue')}</button>
      </div>
    </div>`;
}

function renderChecklistDetail(idWithQuery) {
  const [tid, query] = idWithQuery.split('?');
  const params = new URLSearchParams(query || '');
  let selectedProject = params.get('project') || '';
  const tp = CHECKLIST_TEMPLATES.find(x => x.id === tid);
  const c = $('#content');
  if (!tp) {
    c.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p>
      <button class="btn btn-primary" onclick="navigate('/checklists')">${t('checklists')}</button></div>`;
    return;
  }
  // Critical checklists require an explicit safety acknowledgement once per session
  if (tp.riskLevel === 'critical') {
    const ackKey = 'zlift_safety_ack_' + tp.id;
    if (!sessionStorage.getItem(ackKey)) {
      c.innerHTML = renderSafetyGate(tp, selectedProject, ackKey);
      return;
    }
  }
  const eligible = state.projects.filter(p => p.elevatorType === tp.type || tp.type === 'both');
  if (selectedProject && !eligible.find(p => p.id === selectedProject)) selectedProject = '';

  function getInst() {
    return selectedProject ? state.checklists.find(x => x.projectId === selectedProject && x.templateId === tid) : null;
  }

  /* 4-state items: undefined/false=blank, true|'pass'=pass, 'fail'=fail, 'na'=N/A */
  const stateOf = v => v === true || v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : v === 'na' ? 'na' : 'blank';
  const nextState = { blank: 'pass', pass: 'fail', fail: 'na', na: 'blank' };
  const stIcon = { blank: '⬜', pass: '✅', fail: '❗', na: '➖' };
  let viewChecked = {}; // for no-project view mode

  function counts(checked) {
    const total = tp.groups.reduce((a, g) => a + g.items.length, 0);
    let pass = 0, fail = 0, na = 0;
    tp.groups.forEach(g => g.items.forEach(it => {
      const s = stateOf(checked[it.id]);
      if (s === 'pass') pass++; else if (s === 'fail') fail++; else if (s === 'na') na++;
    }));
    const done = pass + fail + na;
    return { total, pass, fail, na, done, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function draw() {
    const inst = getInst();
    const checked = inst ? inst.checked : viewChecked;
    const cn = counts(checked);
    const failedItems = [];
    tp.groups.forEach(g => g.items.forEach(it => { if (stateOf(checked[it.id]) === 'fail') failedItems.push(it); }));

    c.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="navigate('/checklists')" style="margin-bottom:14px">${IC.back} ${t('checklists')}</button>
      <div class="detail-head">
        <div class="grow">
          <h2 style="font-size:19px">${tp.kind === 'install' ? '🏗️' : '🔧'} ${esc(tp.title[LANG] || tp.title.fa)}</h2>
          <div class="sub">${typeBadge(tp.type)} ${inst ? `<span class="badge b-gray">${t('chLastUpdate')}: ${fmtDateTime(inst.updatedAt)}</span>` : ''}</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="field" style="margin-bottom:0">
          <label>${t('chSelectProject')}</label>
          <select id="chProject">
            <option value="">${t('chNoProject')}</option>
            ${eligible.map(p => `<option value="${p.id}" ${selectedProject === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="check-progress-wrap">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:7px;flex-wrap:wrap;gap:4px">
          <span>${t('chProgress')}</span>
          <span id="chStats">✅ ${faNum(cn.pass)} · ❗ ${faNum(cn.fail)} · ➖ ${faNum(cn.na)} — ${faNum(cn.pct)}٪</span>
        </div>
        <div class="mini-progress" style="height:9px;margin:0"><div class="fill" id="chFill" style="width:${cn.pct}%"></div></div>
        <div style="font-size:11.5px;color:var(--text-3);margin-top:7px">💡 ${t('chTapHint')}</div>
      </div>
      <div id="chFailedBox">${failedItems.length ? `
        <div class="card" style="border-inline-start:4px solid var(--danger);margin-bottom:14px">
          <div class="card-title" style="color:var(--danger);margin-bottom:8px">❗ ${t('chFailed')} (${faNum(failedItems.length)})</div>
          <ul style="padding-inline-start:20px;font-size:13.3px;color:var(--text-2)">${failedItems.map(it => `<li>${esc(it[LANG] || it.fa)}</li>`).join('')}</ul>
          ${selectedProject ? `<button class="btn btn-soft-danger btn-sm" style="margin-top:8px" onclick="chFailedToIssue('${tid}')">🔴 ${t('chFailToIssue')}</button>` : ''}
        </div>` : ''}</div>
      <div class="card">
        ${tp.groups.map(g => `
          <div class="check-group">
            <h4>${esc(g.title[LANG] || g.title.fa)}</h4>
            ${g.items.map(it => {
              const s = stateOf(checked[it.id]);
              return `<div class="check-item ci-${s}" data-item="${it.id}" role="button" tabindex="0" style="user-select:none">
                <span class="ci-state" style="font-size:17px;width:24px;text-align:center;flex-shrink:0">${stIcon[s]}</span>
                <span><span class="ci-text" style="${s === 'na' ? 'text-decoration:line-through;color:var(--text-3)' : s === 'fail' ? 'color:var(--danger);font-weight:600' : ''}">${esc(it[LANG] || it.fa)}</span>${it.ref ? `<span class="ci-ref">📖 ${esc(it.ref)} · <b>${esc(it.verificationStatus || STANDARD_VERIFICATION.UNVERIFIED)}</b></span>` : ''}</span>
              </div>`;
            }).join('')}
          </div>`).join('')}
        <p class="calc-note">📖 ${t('standardRef')}</p>
      </div>`;

    window._chCtx = { tid, selectedProject, tp, getInst, viewChecked };
    $('#chProject').onchange = e => {
      selectedProject = e.target.value;
      history.replaceState(null, '', '#/checklists/' + tid + (selectedProject ? '?project=' + selectedProject : ''));
      draw();
    };

    const save = debounce(async () => {
      const inst2 = getInst();
      if (!inst2) return;
      try { await api('/checklists', { method: 'POST', body: { projectId: selectedProject, templateId: tid, checked: inst2.checked } }); }
      catch (e) { toast(errMsg(e), 'err'); }
    }, 500);

    async function cycle(el) {
      const itemId = el.dataset.item;
      let store;
      if (selectedProject) {
        let inst2 = getInst();
        if (!inst2) {
          /* create the real record first, then keep its reference —
             state.checklists and the storage share the same array,
             so pushing a temporary object would poison the DB with a
             fake id ('tmp') that gets persisted. */
          try {
            const d = await api('/checklists', { method: 'POST', body: { projectId: selectedProject, templateId: tid, checked: {} } });
            inst2 = d.checklist;
            if (!state.checklists.includes(inst2)) state.checklists.push(inst2);
          } catch (e) {
            toast(errMsg(e), 'err');
            return;
          }
        }
        store = inst2.checked;
        inst2.updatedAt = Date.now();
      } else {
        store = viewChecked;
      }
      const cur = stateOf(store[itemId]);
      const nxt = nextState[cur];
      if (nxt === 'blank') delete store[itemId];
      else store[itemId] = nxt;
      // update this row in place
      const s = nxt;
      el.className = 'check-item ci-' + s;
      el.querySelector('.ci-state').textContent = stIcon[s];
      const txt = el.querySelector('.ci-text');
      txt.style.cssText = s === 'na' ? 'text-decoration:line-through;color:var(--text-3)' : s === 'fail' ? 'color:var(--danger);font-weight:600' : '';
      // update stats
      const cn2 = counts(store);
      $('#chStats').textContent = `✅ ${faNum(cn2.pass)} · ❗ ${faNum(cn2.fail)} · ➖ ${faNum(cn2.na)} — ${faNum(cn2.pct)}٪`;
      $('#chFill').style.width = cn2.pct + '%';
      // update failed box
      const failed = [];
      tp.groups.forEach(g => g.items.forEach(it => { if (stateOf(store[it.id]) === 'fail') failed.push(it); }));
      $('#chFailedBox').innerHTML = failed.length ? `
        <div class="card" style="border-inline-start:4px solid var(--danger);margin-bottom:14px">
          <div class="card-title" style="color:var(--danger);margin-bottom:8px">❗ ${t('chFailed')} (${faNum(failed.length)})</div>
          <ul style="padding-inline-start:20px;font-size:13.3px;color:var(--text-2)">${failed.map(it => `<li>${esc(it[LANG] || it.fa)}</li>`).join('')}</ul>
          ${selectedProject ? `<button class="btn btn-soft-danger btn-sm" style="margin-top:8px" onclick="chFailedToIssue('${tid}')">🔴 ${t('chFailToIssue')}</button>` : ''}
        </div>` : '';
      if (selectedProject) save();
    }

    c.querySelectorAll('.check-item[data-item]').forEach(el => {
      el.onclick = () => cycle(el);
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(el); } };
    });
  }
  draw();
}

async function chFailedToIssue(tid) {
  const ctx = window._chCtx;
  if (!ctx || ctx.tid !== tid || !ctx.selectedProject) return;
  const inst = ctx.getInst();
  const checked = inst ? inst.checked : ctx.viewChecked;
  const stOf = v => v === true || v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : v === 'na' ? 'na' : 'blank';
  const failed = [];
  ctx.tp.groups.forEach(g => g.items.forEach(it => { if (stOf(checked[it.id]) === 'fail') failed.push(it.fa); }));
  if (!failed.length) return;
  try {
    const d = await api('/issues', { method: 'POST', body: {
      title: (ctx.tp.title.fa || '') + ' — ' + faNum(failed.length) + ' ' + t('chFailed'),
      kind: 'open',
      projectId: ctx.selectedProject,
      note: failed.map((f, i) => faNum(i + 1) + '. ' + f).join('\n'),
      closed: false
    } });
    state.issues.unshift(d.item);
    toast(t('created'));
  } catch (e) { reportError(e, 'chFailedToIssue'); }
}
