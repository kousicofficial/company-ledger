import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './index.css';
import { companyApi } from './api.js';

/* ─── Display Helpers ────────────────────────────────────── */
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtDate = (d, time = false) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

/* ─── Frontend Status (for display colours only) ─────────── */
const getStatus = (total, settled, dueDate) => {
  if (settled >= total && total > 0)
    return { label: 'Fully Settled', code: 'SETTLED', cls: 'settled' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days  = Math.ceil((due - today) / 86400000);
  if (days < 0)   return { label: 'Overdue',   code: 'OVERDUE',  cls: 'danger',  delay: Math.abs(days) };
  if (days === 0)  return { label: 'Due Today', code: 'TODAY',    cls: 'orange' };
  if (days <= 3)   return { label: 'Due Soon',  code: 'NEARING',  cls: 'warning' };
  return              { label: 'On Track',  code: 'ON_TRACK', cls: 'primary' };
};

/* ─── Empty State ─────────────────────────────────────────── */
const EmptyState = ({ icon, title, sub }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    <p>{sub}</p>
  </div>
);

/* ─── Toast Notification ──────────────────────────────────── */
const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      <span>{toast.type === 'success' ? '✅' : '❌'}</span>
      <p>{toast.message}</p>
      <button onClick={onClose}>✕</button>
    </div>
  );
};

/* ─── Loading Spinner ─────────────────────────────────────── */
const Spinner = () => (
  <div className="spinner-wrap">
    <div className="spinner" />
    <p>Loading companies…</p>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  /* ── Core State ── */
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [apiError,  setApiError]  = useState(null);
  const [toast,     setToast]     = useState(null);
  const [saving,    setSaving]    = useState(false);

  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  /* ── Search / Filter ── */
  const [activeMode,   setActiveMode]   = useState('ALL');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [showDrop,     setShowDrop]     = useState(false);
  const [selectedId,   setSelectedId]   = useState(null);

  /* ── Form ── */
  const [form,   setForm]   = useState({ name: '', totalAmount: '', settledAmount: '', dueDate: '' });
  const [editId, setEditId] = useState(null);
  const [delId,  setDelId]  = useState(null);

  const searchRef  = useRef(null);
  const settledRef = useRef(null);
  const formRef    = useRef(null);

  /* ── Theme persistence ── */
  useEffect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    document.body.classList.toggle('dark-mode', dark);
  }, [dark]);

  /* ── Close search dropdown on outside click ── */
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ═══════════════════════════════════════════════════════
     API FUNCTIONS
  ═══════════════════════════════════════════════════════ */
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  /** Fetch all companies from backend */
  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);
      const res = await companyApi.getAll({ limit: 200 });
      setCompanies(res.data.data.companies);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Load on mount */
  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  /** Create or Update */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const payload = {
      name:          form.name.trim(),
      totalAmount:   Number(form.totalAmount),
      settledAmount: Number(form.settledAmount) || 0,
      dueDate:       form.dueDate,
    };

    try {
      if (editId) {
        await companyApi.update(editId, payload);
        showToast('Company updated successfully');
      } else {
        await companyApi.create(payload);
        showToast('Company added successfully');
      }
      setForm({ name: '', totalAmount: '', settledAmount: '', dueDate: '' });
      setEditId(null);
      await fetchCompanies();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  /** Mark payment as fully cleared → PUT with settledAmount = totalAmount */
  const clearPayment = async (company) => {
    try {
      await companyApi.update(company._id, {
        settledAmount: company.totalAmount,
        note: 'Payment fully cleared',
      });
      showToast(`Payment cleared for ${company.name}`);
      await fetchCompanies();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  /** Delete company */
  const confirmDelete = async () => {
    if (!delId) return;
    try {
      await companyApi.remove(delId);
      showToast('Company deleted permanently');
      setDelId(null);
      if (selectedId === delId) setSelectedId(null);
      await fetchCompanies();
    } catch (err) {
      showToast(err.message, 'error');
      setDelId(null);
    }
  };

  /** Populate form with existing data for editing */
  const startEdit = (c) => {
    setForm({ name: c.name, totalAmount: c.totalAmount, settledAmount: c.settledAmount, dueDate: c.dueDate?.split('T')[0] ?? '' });
    setEditId(c._id);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  /** Reset company amounts for a new collaboration cycle */
  const startCycle = (c) => {
    setForm({ name: c.name, totalAmount: '', settledAmount: 0, dueDate: '' });
    setEditId(c._id);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  /* ═══════════════════════════════════════════════════════
     SEARCH / FILTER (mutually exclusive)
  ═══════════════════════════════════════════════════════ */
  const onSearch = useCallback((val) => {
    setSearchQuery(val);
    if (val) { setActiveMode('SEARCH'); setShowDrop(true); }
    else     { setActiveMode('ALL');    setShowDrop(false); setSelectedId(null); }
  }, []);

  const onFilterPick = useCallback((code) => {
    setActiveMode(code);
    setSearchQuery('');
    setSelectedId(null);
    setShowDrop(false);
    if (code === 'SETTLED') {
      setTimeout(() => settledRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, []);

  const pickSuggestion = useCallback((c) => {
    setSelectedId(c._id);
    setSearchQuery(c.name);
    setShowDrop(false);
  }, []);

  const doSearch = useCallback(() => {
    if (suggestions.length > 0) { setSelectedId(suggestions[0]._id); setShowDrop(false); }
  }, []); // eslint-disable-line

  /* ═══════════════════════════════════════════════════════
     DERIVED STATE
  ═══════════════════════════════════════════════════════ */
  const { displayList, overdueList, settledList, metrics, suggestions } = useMemo(() => {
    const isSearch = activeMode === 'SEARCH';
    const isFilter = activeMode !== 'SEARCH' && activeMode !== 'ALL';

    const sugg = searchQuery
      ? companies.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 6)
      : [];

    let list = [...companies];
    if (isSearch && searchQuery) {
      list = companies.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    } else if (isFilter) {
      list = companies.filter(c => {
        const st = getStatus(c.totalAmount, c.settledAmount, c.dueDate);
        if (activeMode === 'NEARING') return st.code === 'NEARING' || st.code === 'TODAY';
        return st.code === activeMode;
      });
    }

    const overdue = companies.filter(c => getStatus(c.totalAmount, c.settledAmount, c.dueDate).code === 'OVERDUE');
    const settled = companies.filter(c => getStatus(c.totalAmount, c.settledAmount, c.dueDate).code === 'SETTLED');
    const pending = companies.reduce((acc, c) => acc + Math.max(0, c.totalAmount - c.settledAmount), 0);

    return {
      displayList: list,
      overdueList: overdue,
      settledList: settled,
      suggestions: sugg,
      metrics: {
        pending,
        overdueCount: overdue.length,
        settledCount: settled.length,
        activeCount:  companies.length - settled.length,
      },
    };
  }, [companies, activeMode, searchQuery]);

  // fix doSearch closure over suggestions
  const doSearchFn = () => {
    if (suggestions.length > 0) { setSelectedId(suggestions[0]._id); setShowDrop(false); }
  };

  const selectedCompany = useMemo(() => companies.find(c => c._id === selectedId), [companies, selectedId]);

  const FILTERS = [
    { code: 'ALL',      label: 'All',      icon: '⬡' },
    { code: 'OVERDUE',  label: 'Overdue',  icon: '🔴' },
    { code: 'NEARING',  label: 'Due Soon', icon: '🟡' },
    { code: 'SETTLED',  label: 'Settled',  icon: '✅' },
    { code: 'ON_TRACK', label: 'On Track', icon: '🟢' },
  ];

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  return (
    <div className="app-root">
      {/* ─── TOAST ─── */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* ─── HEADER ─── */}
      <header className="site-header">
        <div className="brand">
          <span className="brand-icon">◈</span>
          <div>
            <h1>FinanceFlow <em>PRO</em></h1>
            <p>Smart Financial Ledger &amp; Analytics</p>
          </div>
        </div>
        <button className="theme-btn" onClick={() => setDark(d => !d)} title="Toggle theme">
          {dark ? '☀️' : '🌙'}
        </button>
      </header>

      {/* ─── API ERROR BANNER ─── */}
      {apiError && (
        <div className="error-banner">
          ⚠️ Could not connect to server: <strong>{apiError}</strong>
          <button className="link-btn" onClick={fetchCompanies}>Retry</button>
        </div>
      )}

      {/* ─── METRICS ─── */}
      <section className="metrics-row">
        {[
          { label: 'Total Pending', val: fmt(metrics.pending), cls: 'primary', icon: '💰' },
          { label: 'Overdue',       val: metrics.overdueCount,  cls: 'danger',  icon: '🚨' },
          { label: 'Active',        val: metrics.activeCount,   cls: 'warning', icon: '📂' },
          { label: 'Settled',       val: metrics.settledCount,  cls: 'success', icon: '🏆' },
        ].map(m => (
          <div className={`metric-card metric-${m.cls}`} key={m.label}>
            <span className="metric-icon">{m.icon}</span>
            <div>
              <p className="metric-label">{m.label}</p>
              <p className="metric-val">{m.val}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ─── SEARCH + FILTER ─── */}
      <section className="control-section">
        <div className="searchbar-wrap" ref={searchRef}>
          <div className="searchbar">
            <span className="search-ico">🔍</span>
            <input
              type="text"
              placeholder="Search company by name…"
              value={searchQuery}
              onFocus={() => { if (searchQuery) setShowDrop(true); }}
              onChange={e => onSearch(e.target.value)}
            />
            {searchQuery && (<button className="clear-btn" onClick={() => onSearch('')}>✕</button>)}
          </div>
          <button className="search-submit-btn" onClick={doSearchFn}>Search</button>
          {showDrop && suggestions.length > 0 && (
            <div className="autocomplete-drop">
              {suggestions.map(c => {
                const s = getStatus(c.totalAmount, c.settledAmount, c.dueDate);
                return (
                  <div key={c._id} className="auto-item" onClick={() => pickSuggestion(c)}>
                    <span className="auto-name">{c.name}</span>
                    <span className={`chip chip-${s.cls}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="filter-tabs">
          {FILTERS.map(f => (
            <button key={f.code} className={`filter-tab ${activeMode === f.code ? 'active' : ''}`}
              onClick={() => onFilterPick(f.code)}>
              <span>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
      </section>

      {activeMode === 'SEARCH' && searchQuery && (
        <p className="mode-hint">🔍 Showing results for "<strong>{searchQuery}</strong>"
          &nbsp;—&nbsp;<button className="link-btn" onClick={() => onSearch('')}>Clear Search</button>
        </p>
      )}
      {activeMode !== 'ALL' && activeMode !== 'SEARCH' && (
        <p className="mode-hint">Filtering by <strong>{FILTERS.find(f => f.code === activeMode)?.label}</strong>
          &nbsp;—&nbsp;<button className="link-btn" onClick={() => onFilterPick('ALL')}>Clear Filter</button>
        </p>
      )}

      {/* ─── SELECTED COMPANY DETAIL ─── */}
      {selectedCompany && (() => {
        const s = getStatus(selectedCompany.totalAmount, selectedCompany.settledAmount, selectedCompany.dueDate);
        const pending = selectedCompany.totalAmount - selectedCompany.settledAmount;
        return (
          <div className="detail-panel">
            <div className="detail-head">
              <div>
                <h2>{selectedCompany.name}</h2>
                <span className={`chip chip-${s.cls}`}>{s.label}</span>
              </div>
              <button className="close-btn" onClick={() => setSelectedId(null)}>✕ Close</button>
            </div>
            <div className="detail-grid">
              {[
                { l: 'Total',      v: fmt(selectedCompany.totalAmount),  c: 'inherit' },
                { l: 'Settled',    v: fmt(selectedCompany.settledAmount), c: 'var(--c-success)' },
                { l: 'Pending',    v: fmt(pending),                       c: 'var(--c-danger)' },
                { l: 'Due Date',   v: fmtDate(selectedCompany.dueDate),  c: 'inherit' },
                ...(selectedCompany.completionDate
                  ? [{ l: 'Settled On', v: fmtDate(selectedCompany.completionDate, true), c: 'var(--c-success)' }]
                  : []),
              ].map(item => (
                <div className="detail-stat" key={item.l}>
                  <p className="stat-label">{item.l}</p>
                  <p className="stat-val" style={{ color: item.c }}>{item.v}</p>
                </div>
              ))}
            </div>
            {(selectedCompany.history || []).length > 0 && (
              <div className="history-log">
                <h4>Payment History</h4>
                {selectedCompany.history.map((h, i) => (
                  <div key={i} className="history-row">
                    <span>{fmtDate(h.date, true)}</span>
                    {h.note
                      ? <span style={{ color: 'var(--txt-3)', fontStyle: 'italic' }}>{h.note}</span>
                      : <span className="hist-amt">+{fmt(h.amountAdded)}</span>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── ACTIVE LEDGERS ─── */}
      <div className="section-header">
        <h2>Active Ledgers</h2>
        <span className="count-badge">{displayList.length}</span>
      </div>

      {loading ? <Spinner /> : displayList.length === 0 ? (
        <EmptyState icon="📭" title="No Companies Found"
          sub={activeMode === 'SEARCH' ? `No companies match "${searchQuery}"` : 'No ledgers match the selected filter.'} />
      ) : (
        <div className="cards-grid">
          {displayList.map(c => {
            const s   = getStatus(c.totalAmount, c.settledAmount, c.dueDate);
            const pct = Math.min(100, Math.round((c.settledAmount / c.totalAmount) * 100));
            return (
              <div key={c._id} className={`ledger-card border-${s.cls}`}>
                <div className="card-top">
                  <h3>{c.name}</h3>
                  <span className={`chip chip-${s.cls}`}>{s.label}</span>
                </div>
                <div className="card-amounts">
                  <div>
                    <p className="amt-label">Total Amount</p>
                    <p className="amt-val">{fmt(c.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="amt-label">Pending</p>
                    <p className="amt-val danger">{fmt(c.totalAmount - c.settledAmount)}</p>
                  </div>
                  <div>
                    <p className="amt-label">Settled</p>
                    <p className="amt-val" style={{ color: 'var(--c-success)' }}>{fmt(c.settledAmount)}</p>
                  </div>
                  <div>
                    <p className="amt-label">Due Date</p>
                    <p className="amt-val">{fmtDate(c.dueDate)}</p>
                  </div>
                </div>
                <div className="progress-wrap">
                  <div className="progress-bar" style={{ width: `${pct}%` }} />
                </div>
                <p className="progress-label">{pct}% settled</p>
                <div className="card-actions">
                  {s.code !== 'SETTLED' && (
                    <button className="btn btn-cleared" onClick={() => clearPayment(c)}>✓ Clear Payment</button>
                  )}
                  <button className="btn btn-icon" onClick={() => startEdit(c)} title="Edit">✏️</button>
                  <button className="btn btn-icon danger" onClick={() => setDelId(c._id)} title="Delete">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── ADD / EDIT FORM ─── */}
      <section className="form-card" ref={formRef}>
        <h2 className="section-title">{editId ? '✏️ Edit Record' : '＋ Add New Ledger'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            {[
              { name: 'name',          label: 'Company Name', type: 'text',   placeholder: 'Acme Corp' },
              { name: 'totalAmount',   label: 'Total (₹)',    type: 'number', placeholder: '0' },
              { name: 'settledAmount', label: 'Settled (₹)',  type: 'number', placeholder: '0' },
              { name: 'dueDate',       label: 'Due Date',     type: 'date',   placeholder: '' },
            ].map(f => (
              <div className="field" key={f.name}>
                <label>{f.label}</label>
                <input type={f.type} name={f.name} value={form[f.name]}
                  onChange={e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))}
                  required placeholder={f.placeholder} disabled={saving} />
              </div>
            ))}
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (editId ? 'Saving…' : 'Adding…') : (editId ? 'Save Changes' : 'Add Company')}
            </button>
            {editId && (
              <button type="button" className="btn btn-ghost" disabled={saving}
                onClick={() => { setEditId(null); setForm({ name: '', totalAmount: '', settledAmount: '', dueDate: '' }); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* ─── OVERDUE TABLE ─── */}
      <div className="section-header">
        <h2 className="text-danger">🚨 Critical Overdue</h2>
        <span className="count-badge badge-danger">{overdueList.length}</span>
      </div>
      {overdueList.length === 0 ? (
        <EmptyState icon="🎉" title="No Overdue Companies" sub="All payments are on track." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Company</th><th>Due Date</th><th>Pending</th><th>Delay in Days</th><th>Actions</th></tr></thead>
            <tbody>
              {overdueList.map(c => (
                <tr key={c._id}>
                  <td className="fw-bold">{c.name}</td>
                  <td>{fmtDate(c.dueDate)}</td>
                  <td className="text-danger fw-bold">{fmt(c.totalAmount - c.settledAmount)}</td>
                  <td><span className="chip chip-danger">{getStatus(c.totalAmount, c.settledAmount, c.dueDate).delay} Days Late</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm btn-outline" onClick={() => startEdit(c)}>Edit</button>
                      <button className="btn btn-sm btn-outline danger" onClick={() => setDelId(c._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── SETTLED TABLE ─── */}
      <div className="section-header" ref={settledRef}>
        <h2 className="text-success">✅ Settlement History</h2>
        <span className="count-badge badge-success">{settledList.length}</span>
      </div>
      {settledList.length === 0 ? (
        <EmptyState icon="📋" title="No Settled Records Yet" sub="Mark payments as cleared to see them here." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Company</th><th>Amount Settled</th><th>Completed On</th><th>Actions</th></tr></thead>
            <tbody>
              {settledList.map(c => (
                <tr key={c._id}>
                  <td className="fw-bold">{c.name}</td>
                  <td className="text-success fw-bold">{fmt(c.settledAmount)}</td>
                  <td>{fmtDate(c.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => startCycle(c)}>New Cycle</button>
                      <button className="btn btn-sm btn-outline danger" onClick={() => setDelId(c._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── DELETE MODAL ─── */}
      {delId && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-icon">🗑</div>
            <h2>Delete Record?</h2>
            <p>Permanently remove <strong>{companies.find(c => c._id === delId)?.name}</strong>? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDelId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
