import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, auth, db, LOCAL } from "./backend";
import { getLang, setLang, t, useLang } from "./i18n";
import logoImg from "./logo.png";

// field: [key, label, type?, options?]
const MODULES = {
  customers: { label: "Customers", icon: "👥", fields: [
    ["code", "Code", "readonly"], ["name", "Name"], ["phone", "Phone"], ["address", "Address"],
    ["nicNo", "NIC number"], ["nicAddress", "NIC address"], ["date", "Date", "date"], ["fileNo", "Customer file no"],
    ["projectName", "Project name"], ["budget", "Budget (LKR)", "number"], ["projectValue", "Project value (LKR)", "number"],
    ["projectStatus", "Project status", "select", ["Ongoing", "Completed"]],
    ["status", "Status", "select", ["Lead", "Quoted", "Won", "Lost"]]] },
  projects: { label: "Projects", icon: "☀️", fields: [
    ["title", "Project"], ["customer", "Customer"], ["capacityKw", "Capacity (kW)", "number"],
    ["value", "Value (LKR)", "number"],
    ["stage", "Stage", "select", ["Survey", "Design", "Installation", "CEB Approval", "Commissioned"]],
    ["date", "Start date", "date"],
    ["panelSerials", "Panel Serial Numbers (one per line)"],
    ["cebAddress", "CEB Address"]] },
  inventory: { label: "Inventory", icon: "📦", fields: [
    ["item", "Item"], ["category", "Category", "select", ["Panel", "Inverter", "Battery", "Cable", "Mounting", "Other"]],
    ["qty", "Qty", "number"], ["minQty", "Min qty", "number"], ["unitCost", "Unit cost", "number"]] },
  invoices: { label: "Bills & invoices", icon: "🧾", fields: [
    ["no", "Invoice #"], ["customer", "Customer"], ["amount", "Amount (LKR)", "number"],
    ["status", "Status", "select", ["Unpaid", "Partial", "Paid"]], ["date", "Date", "date"]] },
  quotations: { label: "Quotations", icon: "📝", fields: [
    ["no", "Quote #"], ["customer", "Customer"], ["cebAddress", "CEB Address"],
    ["capacityKw", "Capacity (kW)", "number"], ["amount", "Amount (LKR)", "number"],
    ["panelSerials", "Panel Serial Numbers (one per line)"],
    ["status", "Status", "select", ["Draft", "Sent", "Accepted", "Rejected"]], ["date", "Date", "date"]] },
  siteVisits: { label: "Site Visits", icon: "📍", fields: [
    ["customer", "Customer"], ["address", "Address"], ["type", "Type", "select", ["Survey", "Installation", "Maintenance"]],
    ["technician", "Technician"], ["date", "Date", "date"], ["status", "Status", "select", ["Scheduled", "Done", "Cancelled"]]] },
  suppliers: { label: "Suppliers", icon: "🏭", fields: [
    ["name", "Supplier"], ["phone", "Phone"], ["email", "Email"], ["supplies", "Supplies"]] },
  purchaseOrders: { label: "Purchase Orders", icon: "🛒", fields: [
    ["no", "PO #"], ["supplier", "Supplier"], ["item", "Item (match inventory)"], ["qty", "Qty", "number"],
    ["cost", "Total cost", "number"], ["status", "Status", "select", ["Ordered", "Received", "Cancelled"]], ["date", "Date", "date"]] },
  employees: { label: "Employees", icon: "🧑‍🔧", fields: [
    ["name", "Name"], ["role", "Role", "select", ["Admin", "Engineer", "Technician", "Sales", "Accounts"]],
    ["phone", "Phone"], ["salary", "Salary (LKR)", "number"], ["status", "Status", "select", ["Active", "Inactive"]]] },
  attendance: { label: "Attendance", icon: "🕒", fields: [
    ["employee", "Employee"], ["date", "Date", "date"], ["status", "Status", "select", ["Present", "Absent", "Leave", "Half Day"]]] },
  expenses: { label: "Expenses", icon: "💸", fields: [
    ["title", "Title"], ["category", "Category"],
    ["amount", "Amount (LKR)", "number"], ["date", "Date", "date"]] },
  adminExpenses: { label: "Admin expenses", icon: "🏦", fields: [
    ["title", "Title"], ["category", "Category"],
    ["amount", "Amount (LKR)", "number"], ["date", "Date", "date"], ["note", "Note"]] },
};

const PAY_METHODS = ["Cash", "Cheque", "Bank transfer"];

const REL = {
  customer: ["customers", "name"],
  supplier: ["suppliers", "name"],
  employee: ["employees", "name"],
  technician: ["employees", "name"],
  item: ["inventory", "item"],
};

const today = () => new Date().toISOString().slice(0, 10);

const printDoc = (title, r, fields) => {
  // Quotations — RAM GREEN format
  if (title === "Quotations") { printQuotation(r); return; }
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups to print"); return; }
  const rows = fields.map(([k, l, kind]) => {
    const raw = r[k] ?? "—";
    const val = kind === "number" ? fmt(r[k]) : (kind === "select" ? t(raw) : raw);
    return `<tr><td>${escHtml(t(l))}</td><td>${escHtml(val)}</td></tr>`;
  }).join("");
  const when = new Date().toLocaleString(getLang() === "ta" ? "ta-LK" : "en-LK");
  w.document.write(`<!doctype html><html lang="${getLang() === "ta" ? "ta" : "en"}"><head><title>${escHtml(t(title))}</title><style>
    body{font-family:"Noto Sans Tamil","Nirmala UI",system-ui,sans-serif;padding:40px;color:#111}h1{margin:0;color:#166534;font-size:28px}
    h2{margin:.3rem 0 0;font-size:22px}p{color:#4b5563}table{width:100%;border-collapse:collapse;margin-top:18px}
    td{border:1px solid #d1d5db;padding:12px 14px;font-size:16px}td:first-child{width:240px;background:#f0fdf4;font-weight:700}
  </style></head><body><h1>Ram Green Solar Energy</h1><h2>${escHtml(t(title))}</h2>
  <p>${escHtml(t("Printed {when}", { when }))}</p><table>${rows}</table></body></html>`);
  w.document.close(); w.focus(); w.print();
};

function printQuotation(q) {
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups to print"); return; }
  // Items — use quotItems if available, else single line
  const items = q.quotItems?.length ? q.quotItems : [{ no: "01", desc: q.capacityKw ? `${q.capacityKw}kW Solar System` : "Solar System", qty: 1, unitPrice: Number(q.amount || 0), amount: Number(q.amount || 0) }];
  const itemRows = items.map((it, i) => `
    <tr>
      <td style="text-align:center">${escHtml(String(it.no || String(i+1).padStart(2,"0")))}</td>
      <td>${escHtml(it.desc || "—")}</td>
      <td style="text-align:center">${it.qty || ""}</td>
      <td style="text-align:right">${it.unitPrice ? fmt(it.unitPrice) : ""}</td>
      <td style="text-align:right">${fmt(it.amount || Number(it.qty||1)*Number(it.unitPrice||0))}</td>
    </tr>`).join("");
  const total = items.reduce((s, it) => s + Number(it.amount || Number(it.qty||1)*Number(it.unitPrice||0)), 0);
  // Panel serial numbers
  const serials = q.panelSerials ? String(q.panelSerials).split("\n").map((s,i) => s.trim()).filter(Boolean) : [];
  const serialTable = serials.length ? `
    <table style="margin-top:18px;width:auto;min-width:260px">
      <thead><tr><th style="text-align:center">NO</th><th>Panel Serial Numbers</th></tr></thead>
      <tbody>${serials.map((s,i) => `<tr><td style="text-align:center">${String(i+1).padStart(2,"0")}</td><td>${escHtml(s)}</td></tr>`).join("")}</tbody>
    </table>` : "";
  w.document.write(`<!doctype html><html><head><title>Quotation</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"Times New Roman",serif;font-size:12px;color:#111;padding:28px 36px}
    .header{display:flex;align-items:flex-start;gap:18px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
    .logo-box{width:64px;height:64px;border:2px solid #166534;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none;font-size:9px;font-weight:700;color:#166534;text-align:center;padding:4px}
    .co-name{font-size:20px;font-weight:800;letter-spacing:.04em}
    .co-sub{font-size:10.5px;color:#444;margin-top:3px;line-height:1.5}
    .cust-table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11.5px}
    .cust-table td{border:1px solid #aaa;padding:5px 10px}
    .cust-table td:first-child{width:140px;background:#f0fdf4;font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:11.5px}
    th{background:#e8f5e9;border:1px solid #888;padding:6px 8px;font-weight:700}
    td{border:1px solid #aaa;padding:5px 8px;vertical-align:top}
    .total-row td{font-weight:800;background:#f5f5f5;font-size:12.5px}
    .thankyou{text-align:center;margin-top:16px;font-size:13px;font-style:italic;font-weight:700}
    @media print{body{padding:10px 16px}}
  </style></head><body>
  <div class="header">
    <img src="${logoImg}" alt="RAM Green Energy" width="70" height="70" style="border-radius:50%;flex:none"/>
    <div>
      <div class="co-name">RAM GREEN ENERGY (PVT) LTD.</div>
      <div class="co-sub">No.135B, 1st Floor, Inner harbor Road, Orr's hill, Trincomalee.<br>
      026-2221400 / 0775158810 / 0775512831</div>
    </div>
  </div>
  <table class="cust-table">
    <tr><td>Name</td><td>${escHtml(q.customer || "—")}</td></tr>
    <tr><td>CEB Address</td><td>${escHtml(q.cebAddress || "—")}</td></tr>
    <tr><td>NIC Address</td><td>${escHtml(q.nicAddress || "—")}</td></tr>
    <tr><td>NIC Number</td><td>${escHtml(q.nicNo || "—")}</td></tr>
    <tr><td>Tel number</td><td>${escHtml(q.phone || "—")}</td></tr>
    <tr><td>Date</td><td>${escHtml(q.date || "—")}</td></tr>
  </table>
  <table>
    <thead><tr><th style="width:40px">NO</th><th>Description</th><th style="width:50px">Qty</th><th style="width:100px">Unit Price</th><th style="width:100px">Amount</th></tr></thead>
    <tbody>
      ${itemRows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">TOTAL</td>
        <td style="text-align:right">${fmt(total)}.00</td>
      </tr>
      <tr><td colspan="5" style="text-align:center;padding:8px;font-weight:700">THANK YOU</td></tr>
    </tbody>
  </table>
  ${serialTable}
  </body></html>`);
  w.document.close(); w.focus(); w.print();
}

const exportCsv = (label, fields, rows) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [fields.map(([, l]) => esc(l)).join(","), ...rows.map((r) => fields.map(([k]) => esc(r[k])).join(","))];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = `${label.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

const fmt = (n) => Number(n || 0).toLocaleString("en-LK");

const nextClientCode = (customers) => {
  const max = customers.reduce((m, c) => {
    const hit = String(c.code || "").match(/^RG-C(\d+)$/i);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `RG-C${String(max + 1).padStart(3, "0")}`;
};

const hasBudget = (c) => Number(c?.budget) > 0;

const spentFor = (expenses, clientId) => expenses
  .filter((e) => e.clientId && e.clientId === clientId)
  .reduce((s, e) => s + Number(e.amount || 0), 0);

const clientMoney = (customer, expenses) => {
  const budget = Number(customer?.budget || 0);
  const projectValue = Number(customer?.projectValue || 0);
  const spent = spentFor(expenses, customer?.id);
  const remaining = budget - spent;
  const profit = projectValue - spent;
  const ratio = budget > 0 ? spent / budget : (spent > 0 ? Infinity : 0);
  const margin = projectValue ? (profit / projectValue) * 100 : null;
  return { budget, projectValue, spent, remaining, profit, ratio, margin };
};

const marginText = (margin) => (margin == null || Number.isNaN(margin) ? "—" : `${margin.toFixed(1)}%`);

const expenseColumns = [
  ["clientCode", "Client code"], ["clientName", "Client name"],
  ...[["title", "Title"], ["category", "Category"], ["amount", "Amount (LKR)", "number"], ["date", "Date"]],
];

function expenseCell(r, k, kind) {
  if (k === "clientCode") return r.clientId ? (r.clientCode || "—") : t("Unassigned");
  if (k === "clientName") return r.clientId ? (r.clientName || "—") : t("General expense");
  if (kind === "number") return fmt(r[k]);
  return r[k] || "—";
}

async function saveExpense({ form, editing, customers, expenses }) {
  const client = customers.find((c) => c.id === form.clientId);
  if (!client) { toast("Choose a client"); return false; }
  const category = String(form.category || "").trim();
  if (!category) { toast("Type a category"); return false; }
  const amount = Number(form.amount || 0);
  if (amount < 0 || [form.amount].some((n) => Number(n) < 0)) { toast("Numbers cannot be negative"); return false; }
  const spent = expenses
    .filter((e) => e.clientId === client.id && e.id !== editing)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  if (hasBudget(client) && spent + amount > Number(client.budget)) {
    const over = spent + amount - Number(client.budget);
    if (!window.confirm(t("This will exceed the budget by {n}. Continue?", { n: fmt(over) }))) return false;
  }
  const data = {
    title: form.title || "",
    category,
    amount,
    date: form.date || today(),
    clientId: client.id,
    clientCode: client.code || "",
    clientName: client.name || "",
  };
  if (editing) await updateDoc(doc(db, "expenses", editing), data);
  else await addDoc(collection(db, "expenses"), { ...data, createdAt: serverTimestamp() });
  return true;
}

function useCol(name, enabled) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    const q = query(collection(db, name), orderBy("createdAt", "desc"));
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [name, enabled]);
  return rows;
}

function Login({ theme, onToggle }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, pw); } catch (e) { setErr(e.code || e.message || "Invalid email or password"); }
  };
  return (
    <div className="login">
      <Orbs />
      <form className="card pop" onSubmit={submit}>
        <Logo big /><h1>Ram Green Solar</h1>
        <p className="muted">{t("Energy ERP — sign in")}</p>
        {LOCAL && <p className="muted">{t("Demo mode: admin@ramgreen.com / admin123")}</p>}
        <input placeholder={t("Email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder={t("Password")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <p className="err">{t(err)}</p>}
        <button className="btn">{t("Sign in")}</button>
      </form>
    </div>
  );
}

function Dashboard({ data, go, openClient }) {
  const { customers, projects, inventory, invoices } = data;
  const expenses = data.expenses || [];
  const adminExpenses = data.adminExpenses || [];
  const kw = projects.filter((p) => p.stage === "Commissioned").reduce((s, p) => s + Number(p.capacityKw || 0), 0);
  const paid = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + Number(i.amount || 0), 0);
  const due = invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + Number(i.amount || 0), 0);
  const exp = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const adminExp = adminExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const low = inventory.filter((i) => Number(i.qty) <= Number(i.minQty || 0));
  const overBudget = customers.filter((c) => hasBudget(c) && spentFor(expenses, c.id) > Number(c.budget)).length;
  const stages = MODULES.projects.fields[4][3];
  const max = Math.max(1, ...stages.map((s) => projects.filter((p) => p.stage === s).length));
  const stats = [
    ["Customers", customers.length], ["Active projects", projects.filter((p) => p.stage !== "Commissioned").length],
    ["Installed (kW)", fmt(kw)], ["Revenue (LKR)", fmt(paid)], ["Outstanding (LKR)", fmt(due)],
    ["Client expenses (LKR)", fmt(exp)], ["Admin expenses (LKR)", fmt(adminExp)], ["Net (LKR)", fmt(paid - exp - adminExp)], ["Over budget", overBudget], ["Low stock", low.length],
  ];
  const rows = [...customers].sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
  return (
    <>
      <div className="quick">{["customers", "quotations", "invoices", "purchaseOrders"].map((k) => <button key={k} onClick={() => go(k)}><Ic n={k} /> {t(MODULES[k].label)}</button>)}</div>
      <div className="stats">{stats.map(([l, v], i) => <div className="card stat" key={l} style={{ "--i": i }}><span className="muted">{t(l)}</span><b><CountUp v={v} /></b></div>)}</div>
      <div className="grid2">
        <div className="card"><h3>{t("Project pipeline")}</h3>
          {stages.map((s) => { const c = projects.filter((p) => p.stage === s).length;
            return <div className="bar" key={s}><span>{t(s)}</span><i style={{ width: `${(c / max) * 100}%` }} /><em>{c}</em></div>; })}
        </div>
        <div className="card"><h3>{t("Low stock alerts")}</h3>
          {low.length === 0 ? <p className="muted">{t("All stock levels are above their minimum.")}</p> :
            low.map((i) => <div className="alert" key={i.id}><span>{t("{item} — {qty} left (min {min})", { item: i.item, qty: i.qty, min: i.minQty })}</span></div>)}
          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => go("inventory")}>{t("Open inventory")}</button>
        </div>
      </div>
      <div className="card">
        <h3>{t("Client profitability")}</h3>
        <div className="scroll"><table>
          <thead><tr><th>{t("Code")}</th><th>{t("Client")}</th><th>{t("Budget")}</th><th>{t("Spent")}</th><th>{t("Remaining")}</th><th>{t("Profit/Loss")}</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const m = clientMoney(c, expenses);
              const over = hasBudget(c) && m.spent > m.budget;
              const tone = over || m.profit < 0 ? "loss" : m.profit > 0 ? "profit" : "";
              return (
                <tr key={c.id} className={`clickable ${tone}`} onClick={() => openClient(c.id)}>
                  <td>{c.code || "—"}</td><td>{c.name || "—"}</td>
                  <td>{fmt(m.budget)}</td><td>{fmt(m.spent)}</td><td>{fmt(m.remaining)}</td><td>{fmt(m.profit)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">{t("No clients yet.")}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

const count = (n, one, many) => t(n === 1 ? `{n} ${one}` : `{n} ${many}`, { n });

function sums(name, rows) {
  if (name === "invoices") {
    const paid = rows.filter((i) => i.status === "Paid").reduce((s, i) => s + Number(i.amount || 0), 0);
    const due = rows.filter((i) => i.status !== "Paid").reduce((s, i) => s + Number(i.amount || 0), 0);
    return [t("Paid LKR {n}", { n: fmt(paid) }), t("Outstanding LKR {n}", { n: fmt(due) }), count(rows.length, "invoice", "invoices")];
  }
  if (name === "quotations") {
    const open = rows.filter((q) => !["Rejected", "Accepted"].includes(q.status)).reduce((s, q) => s + Number(q.amount || 0), 0);
    return [t("Open quotes LKR {n}", { n: fmt(open) }), count(rows.length, "quotation", "quotations")];
  }
  if (name === "expenses" || name === "adminExpenses") {
    const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
    return [t("Total LKR {n}", { n: fmt(total) }), count(rows.length, "expense", "expenses")];
  }
  if (name === "inventory") {
    const value = rows.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitCost || 0), 0);
    const low = rows.filter((i) => Number(i.qty) <= Number(i.minQty || 0)).length;
    return [t("Stock value LKR {n}", { n: fmt(value) }), t("{n} below minimum", { n: low }), count(rows.length, "item", "items")];
  }
  if (name === "projects") {
    const kw = rows.reduce((s, p) => s + Number(p.capacityKw || 0), 0);
    return [t("{n} kW quoted or installed", { n: fmt(kw) }), count(rows.length, "project", "projects")];
  }
  return [count(rows.length, "record", "records")];
}

// Generate avatar initials from a name
const initials = (name) => {
  const parts = String(name || "?").trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
};

// Deterministic hue from name string
const nameHue = (name) => {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + (name || "").charCodeAt(i)) % 360;
  return h;
};

function CustomerAvatar({ name, size = 38 }) {
  const hue = nameHue(name);
  return (
    <span className="cust-avatar" style={{ "--hue": hue, width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function CustomerToolbar({ theme, onToggle }) {
  const { lang } = useLang();
  const [dmPop, setDmPop] = useState(false);
  const [langPop, setLangPop] = useState(false);
  const triggerPop = (setter) => { setter(true); setTimeout(() => setter(false), 600); };
  const isDark = theme === "dark";
  return (
    <div className="cust-tools">
      {/* Dark mode toggle */}
      <button
        type="button"
        className={`cust-tool-btn${isDark ? " cust-tool-active" : ""}${dmPop ? " cust-tool-pop" : ""}`}
        title={isDark ? t("Switch to Light mode") : t("Switch to Dark mode")}
        aria-pressed={isDark}
        onClick={() => { triggerPop(setDmPop); onToggle(); }}
      >
        <span className="cust-tool-ico">
          {isDark ? (
            /* sun icon */
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            /* moon icon */
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </span>
      </button>

      {/* Language toggle */}
      <button
        type="button"
        className={`cust-tool-btn${langPop ? " cust-tool-pop" : ""}`}
        title={lang === "ta" ? "Switch to English" : "தமிழுக்கு மாறு"}
        onClick={() => { triggerPop(setLangPop); setLang(lang === "ta" ? "en" : "ta"); }}
      >
        <span className="cust-tool-ico">
          {/* globe / language icon */}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </span>
      </button>
    </div>
  );
}

function Crud({ name, role, onOpenCustomer, theme, onToggle, goToCustomer }) {
  const { label } = MODULES[name];
  const fields = MODULES[name].fields.filter(([k]) => k !== "salary" || role === "admin");
  const rows = useCol(name, true);
  const customers = useCol("customers", true);
  const suppliers = useCol("suppliers", true);
  const employees = useCol("employees", true);
  const inventory = useCol("inventory", true);
  const lists = { customers, suppliers, employees, inventory };
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const statusField = fields.find(([k]) => k === "status" || k === "stage");
  const columns = name === "expenses" ? expenseColumns : fields;

  const set = (k, value) => setForm((f) => ({ ...f, [k]: value }));
  const edit = (r) => {
    const { id, createdAt, ...rest } = r;
    setEditing(id); setForm(rest);
    document.getElementById("entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const save = async (e) => {
    e.preventDefault();
    const data = { ...form };
    fields.forEach(([k, , kind]) => {
      if (kind === "number") data[k] = Number(data[k] || 0);
      if (kind === "date" && !data[k]) data[k] = today();
    });
    if (fields.some(([k, , kind]) => kind === "number" && data[k] < 0)) return toast("Numbers cannot be negative");
    if (name === "customers") {
      const prev = editing ? rows.find((r) => r.id === editing) : null;
      data.code = prev?.code || nextClientCode(rows);
      // Auto-create inventory record for new customer
      if (!editing) {
        await addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
        await addDoc(collection(db, "inventory"), {
          item: `${data.name || "Customer"} — Solar System`,
          category: "Other",
          qty: 0,
          minQty: 0,
          unitCost: Number(data.projectValue || 0),
          customerName: data.name || "",
          customerCode: data.code || "",
          note: `Auto-created for customer ${data.code || data.name}`,
          createdAt: serverTimestamp(),
        });
        toast("Record saved"); setForm({}); setEditing(null);
        return;
      }
    }
    if (name === "expenses") {
      const ok = await saveExpense({ form: data, editing, customers, expenses: rows });
      if (!ok) return;
      toast(editing ? "Record updated" : "Record saved"); setForm({}); setEditing(null);
      return;
    }
    if (name === "adminExpenses") {
      data.category = String(data.category || "").trim();
      if (!data.category) return toast("Type a category");
    }
    if (editing) await updateDoc(doc(db, name, editing), data);
    else await addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
    toast(editing ? "Record updated" : "Record saved"); setForm({}); setEditing(null);
  };
  const setStatus = async (r, status) => {
    await updateDoc(doc(db, name, r.id), { status });
    toast("Marked {status}", { status });
  };
  const advance = async (r) => {
    const stages = MODULES.projects.fields.find(([k]) => k === "stage")[3];
    const i = Math.max(0, stages.indexOf(r.stage));
    const next = stages[Math.min(stages.length - 1, stages.indexOf(r.stage) === -1 ? 0 : i + 1)];
    await updateDoc(doc(db, "projects", r.id), { stage: next });
    toast("Moved to {stage}", { stage: next });
  };
  const receive = async (r) => {
    const it = inventory.find((i) => i.item?.toLowerCase() === r.item?.toLowerCase());
    if (it) await updateDoc(doc(db, "inventory", it.id), { qty: Number(it.qty || 0) + Number(r.qty || 0) });
    else await addDoc(collection(db, "inventory"), { item: r.item, category: "Other", qty: Number(r.qty), minQty: 0,
      unitCost: Number(r.cost || 0) / Math.max(1, Number(r.qty)), createdAt: serverTimestamp() });
    await updateDoc(doc(db, name, r.id), { status: "Received" });
    toast("Stock added to inventory");
  };
  const toProject = async (r) => {
    const ref = await addDoc(collection(db, "projects"), {
      title: `${r.customer || "Customer"} ${r.capacityKw || ""} kW`.trim(),
      customer: r.customer || "",
      capacityKw: Number(r.capacityKw || 0),
      value: Number(r.amount || 0),
      stage: "Survey",
      date: today(),
      panelSerials: r.panelSerials || "",
      cebAddress: r.cebAddress || "",
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "quotations", r.id), { status: "Accepted", projectId: ref.id });
    toast("Project created from this quotation");
  };
  const toInvoice = async (r) => {
    const ref = await addDoc(collection(db, "invoices"), {
      no: `INV-${String(r.no || "").replace(/\D/g, "") || Date.now().toString().slice(-6)}`,
      customer: r.customer || "", amount: Number(r.amount || 0), status: "Unpaid", paymentMethod: "",
      date: today(), createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "quotations", r.id), { status: "Accepted", invoiceId: ref.id });
    toast("Invoice created from this quotation");
  };
  const shown = rows.filter((r) => {
    const hit = JSON.stringify(r).toLowerCase().includes(search.toLowerCase());
    const statusOk = !statusField || !filter || r[statusField[0]] === filter;
    const clientOk = name !== "expenses" || !clientFilter || (clientFilter === "unassigned" ? !r.clientId : r.clientId === clientFilter);
    return hit && statusOk && clientOk;
  });

  return (
    <>
      {name === "customers" && <CustomerToolbar theme={theme} onToggle={onToggle} />}
      <form id="entry-form" className="card form" onSubmit={save}>
        {name === "expenses" && (
          <label>{t("Client")}
            <select value={form.clientId || ""} onChange={(e) => set("clientId", e.target.value)} required>
              <option value="">{t("Select client")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code || "—"} — {c.name}</option>)}
            </select>
          </label>
        )}
        {fields.map(([k, l, kind, opts]) => {
          const rel = REL[k];
          const options = rel ? [...new Set(lists[rel[0]].map((row) => row[rel[1]]).filter(Boolean))] : [];
          const moneyModule = name === "expenses" || name === "adminExpenses";
          const required = kind !== "readonly" && (k === fields.find((f) => f[2] !== "readonly")?.[0] || (moneyModule && (k === "amount" || k === "category")));
          const codePreview = name === "customers" && k === "code" ? (editing ? (form.code || "—") : nextClientCode(customers)) : (form[k] ?? "");
          const suggest = k === "category" ? [...new Set(rows.map((row) => row.category).filter(Boolean))] : options;
          const listId = rel || k === "category" ? `list-${name}-${k}` : undefined;
          return (
            <label key={k}>{t(l)}
              {kind === "readonly" ? (
                <input value={codePreview} readOnly />
              ) : kind === "select" ? (
                <select value={form[k] || ""} onChange={(e) => set(k, e.target.value)} required>
                  <option value="">{t("Select {label}", { label: getLang() === "ta" ? t(l) : l.toLowerCase() })}</option>
                  {opts.map((o) => <option key={o} value={o}>{t(o)}</option>)}
                </select>
              ) : k === "panelSerials" ? (
                <textarea placeholder={t("One serial number per line\n2620107340926391\n2620107340934028")}
                  value={form[k] ?? ""} rows={5} autoComplete="off"
                  onChange={(e) => set(k, e.target.value)}
                  style={{ fontFamily: "monospace", fontSize: "0.85rem" }} />
              ) : (
                <>
                  <input list={listId} placeholder={k === "category" ? t("Type category") : t(l)} type={kind || "text"}
                    value={form[k] ?? ""} required={required} autoComplete="off"
                    onChange={(e) => set(k, e.target.value)} />
                  {listId && <datalist id={listId}>{suggest.map((o) => <option key={o} value={o} />)}</datalist>}
                </>
              )}
            </label>
          );
        })}
        <div className="form-actions">
          <button className="btn">{editing ? t("Update record") : t("Save record")}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm({}); }}>{t("Cancel")}</button>}
        </div>
      </form>
      <div className="card">
        <div className="pills">{sums(name, rows).map((p) => <b key={p}>{p}</b>)}</div>
        <div className="toolbar">
          <input className="search" placeholder={t("Search {label}", { label: getLang() === "ta" ? t(label) : label.toLowerCase() })} value={search} onChange={(e) => setSearch(e.target.value)} />
          {name === "expenses" && (
            <select className="client-filter" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">{t("All clients")}</option>
              <option value="unassigned">{t("Unassigned")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code || "—"} — {c.name}</option>)}
            </select>
          )}
          <button type="button" className="btn ghost" onClick={() => exportCsv(t(label), columns.map(([k, l, kind]) => [k, t(l), kind]), shown.map((r) => Object.fromEntries(columns.map(([k, , kind]) => [k, name === "expenses" ? expenseCell(r, k, kind) : (kind === "select" ? t(r[k] || "") : r[k])]))))}>{t("Export CSV")}</button>
        </div>
        {statusField && (
          <div className="filters">
            <button type="button" className={!filter ? "on" : ""} onClick={() => setFilter("")}>{t("All")}</button>
            {statusField[3].map((o) => <button type="button" key={o} className={filter === o ? "on" : ""} onClick={() => setFilter(o)}>{t(o)}</button>)}
          </div>
        )}
        <div className="scroll"><table>
          <thead><tr>
            {name === "customers" && <th></th>}
            {columns.map(([k, l]) => <th key={k}>{t(l)}</th>)}
            <th>{t("Actions")}</th>
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={`${name === "customers" ? "clickable" : ""} ${name === "inventory" && Number(r.qty) <= Number(r.minQty || 0) ? "low" : ""}`}
                onClick={() => name === "customers" && onOpenCustomer?.(r.id)}>
                {name === "customers" && (
                  <td className="avatar-cell" onClick={(e) => { e.stopPropagation(); onOpenCustomer?.(r.id); }}>
                    <CustomerAvatar name={r.name} />
                  </td>
                )}
                {columns.map(([k, , kind]) => (
                  <td key={k}
                    className={name === "projects" && k === "customer" && goToCustomer ? "cust-link-cell" : ""}
                    onClick={name === "projects" && k === "customer" && goToCustomer ? (e) => { e.stopPropagation(); goToCustomer(r.customer); } : undefined}
                  >
                    {name === "expenses" ? expenseCell(r, k, kind)
                      : name === "projects" && k === "customer" && goToCustomer
                        ? <span className="cust-link">{r[k] || "—"}</span>
                        : (kind === "number" ? fmt(r[k]) : (kind === "select" ? t(r[k] || "—") : (r[k] || "—")))}
                  </td>
                ))}
                <td className="acts" onClick={(e) => e.stopPropagation()}>
                  {name === "projects" && r.stage !== "Commissioned" && <button type="button" className="btn sm" onClick={() => advance(r)}>{t("Next stage")}</button>}
                  {name === "quotations" && <>
                    <button type="button" className="btn sm ghost" onClick={() => {
                      const cust = customers.find((c) => c.name === r.customer) || {};
                      printQuotation({ ...r, nicAddress: r.nicAddress || cust.nicAddress || "", nicNo: r.nicNo || cust.nicNo || "", phone: r.phone || cust.phone || "" });
                    }}>{t("Print")}</button>
                    {!["Accepted", "Rejected"].includes(r.status) && <button type="button" className="btn sm" onClick={() => setStatus(r, "Accepted")}>{t("Accept")}</button>}
                    {!["Accepted", "Rejected"].includes(r.status) && <button type="button" className="btn sm ghost" onClick={() => setStatus(r, "Rejected")}>{t("Reject")}</button>}
                    {!r.projectId && r.status !== "Rejected" && <button type="button" className="btn sm" onClick={() => toProject(r)}>{t("Create project")}</button>}
                    {!r.invoiceId && r.status !== "Rejected" && <button type="button" className="btn sm" onClick={() => toInvoice(r)}>{t("Create invoice")}</button>}
                  </>}
                  {name === "purchaseOrders" && r.status === "Ordered" && <>
                    <button type="button" className="btn sm" onClick={() => receive(r)}>{t("Receive stock")}</button>
                    <button type="button" className="btn sm ghost" onClick={() => setStatus(r, "Cancelled")}>{t("Cancel order")}</button>
                  </>}
                  {name === "purchaseOrders" && <button type="button" className="btn sm ghost" onClick={() => printDoc(label, r, fields)}>{t("Print")}</button>}
                  {name === "siteVisits" && !["Done", "Cancelled"].includes(r.status) && <button type="button" className="btn sm" onClick={() => setStatus(r, "Done")}>{t("Mark done")}</button>}
                  {name === "siteVisits" && <button type="button" className="btn sm ghost" onClick={() => printDoc(label, r, fields)}>{t("Print")}</button>}
                  {name === "employees" && role === "admin" && (
                    <button type="button" className="btn sm ghost" onClick={() => setStatus(r, r.status === "Active" ? "Inactive" : "Active")}>
                      {r.status === "Active" ? t("Deactivate") : t("Activate")}
                    </button>
                  )}
                  {name === "customers" && <button type="button" className="btn sm" onClick={() => onOpenCustomer?.(r.id)}>{t("Open")}</button>}
                  <button type="button" className="btn sm ghost" onClick={() => edit(r)}>{t("Edit")}</button>
                  {role === "admin" && <button type="button" className="btn sm danger" onClick={() => window.confirm(t("Delete this record?")) && deleteDoc(doc(db, name, r.id)).then(() => toast("Record deleted"))}>{t("Delete")}</button>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={columns.length + (name === "customers" ? 2 : 1)} className="muted">{t("No matching records. Save one with the form above.")}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

function ClientDetail({ id, role, onBack }) {
  const customers = useCol("customers", true);
  const expenses = useCol("expenses", true);
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(true), [customers]);
  const client = customers.find((c) => c.id === id);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  if (!loaded) return <div className="card"><p>{t("Loading client…")}</p></div>;
  if (!client) return <div className="card"><p>{t("This client is no longer available.")}</p><button className="btn" onClick={onBack}>{t("Back to customers")}</button></div>;
  const m = clientMoney(client, expenses);
  const tone = m.ratio > 1 ? "over" : m.ratio >= 0.7 ? "warn" : "ok";
  const pctLabel = m.ratio === Infinity ? t("Over budget") : t("{n}% of budget", { n: Math.round(m.ratio * 100) });
  const usedCategories = [...new Set(expenses.map((e) => e.category).filter(Boolean))];
  const mine = expenses.filter((e) => e.clientId === client.id);
  const edit = (r) => {
    const { id: eid, createdAt, clientCode, clientName, ...rest } = r;
    setEditing(eid); setForm(rest);
    document.getElementById("client-expense")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const save = async (e) => {
    e.preventDefault();
    const ok = await saveExpense({ form: { ...form, clientId: client.id }, editing, customers, expenses });
    if (!ok) return;
    toast(editing ? "Expense updated" : "Expense saved");
    setForm({}); setEditing(null);
  };
  const result = m.profit < 0 ? "loss" : "profit";
  return (
    <>
      <button type="button" className="btn ghost back" onClick={onBack}>{t("Back to customers")}</button>
      <div className="card client-head">
        <p className="muted">{client.code || t("No code yet")}</p>
        <h2>{client.name}</h2>
        <p>{client.projectName || t("No project name")} · {t(client.projectStatus || "Ongoing")}</p>
      </div>
      {client.projectStatus === "Completed" ? (
        <div className={`badge-result ${result}`}>
          {t(m.profit < 0 ? "LOSS" : "PROFIT")}: LKR {fmt(Math.abs(m.profit))}
          <small>{t("Margin {m}", { m: marginText(m.margin) })}</small>
        </div>
      ) : (
        <div className="card">
          <h3>{t("Projected profit/loss")}</h3>
          <b className={result}>{t(m.profit < 0 ? "LOSS" : "PROFIT")}: LKR {fmt(Math.abs(m.profit))}</b>
          <p className="muted">{t("Margin {m}", { m: marginText(m.margin) })}. {t("Same formula as the final result: project value minus spent.")}</p>
        </div>
      )}
      <div className="stats">
        <div className="card stat"><span className="muted">{t("Budget")}</span><b>LKR {fmt(m.budget)}</b></div>
        <div className="card stat"><span className="muted">{t("Total spent")}</span><b>LKR {fmt(m.spent)}</b></div>
        <div className={`card stat ${m.remaining < 0 ? "bad" : ""}`}><span className="muted">{t("Remaining")}</span><b>LKR {fmt(m.remaining)}</b></div>
        <div className="card stat"><span className="muted">{t("Project value")}</span><b>LKR {fmt(m.projectValue)}</b></div>
        <div className={`card stat ${m.profit < 0 ? "bad" : "good"}`}><span className="muted">{t("Profit/Loss")}</span><b>LKR {fmt(m.profit)}</b></div>
      </div>
      <div className="card">
        <h3>{t("Budget used")}</h3>
        <div className={`meter ${tone}`}><i style={{ width: `${Math.min(m.ratio === Infinity ? 100 : m.ratio * 100, 100)}%` }} /></div>
        <p className="muted">{pctLabel}</p>
      </div>
      <form id="client-expense" className="card form" onSubmit={save}>
        <h3 style={{ gridColumn: "1 / -1" }}>{editing ? t("Update expense") : t("Add expense")}</h3>
        <label>{t("Title")}<input value={form.title ?? ""} required placeholder={t("Title")} onChange={(e) => set("title", e.target.value)} /></label>
        <label>{t("Category")}
          <input value={form.category ?? ""} required placeholder={t("Type category")} list="client-categories" autoComplete="off" onChange={(e) => set("category", e.target.value)} />
          <datalist id="client-categories">{usedCategories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label>{t("Amount (LKR)")}<input type="number" value={form.amount ?? ""} required onChange={(e) => set("amount", e.target.value)} /></label>
        <label>{t("Date")}<input type="date" value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} /></label>
        <div className="form-actions">
          <button className="btn">{editing ? t("Update expense") : t("Save expense")}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm({}); }}>{t("Cancel")}</button>}
        </div>
      </form>
      <div className="card">
        <h3>{t("This client's expenses")}</h3>
        <div className="scroll"><table>
          <thead><tr><th>{t("Title")}</th><th>{t("Category")}</th><th>{t("Amount (LKR)")}</th><th>{t("Date")}</th><th>{t("Actions")}</th></tr></thead>
          <tbody>
            {mine.map((r) => (
              <tr key={r.id}>
                <td>{r.title || "—"}</td><td>{r.category || "—"}</td><td>{fmt(r.amount)}</td><td>{r.date || "—"}</td>
                <td className="acts">
                  <button type="button" className="btn sm ghost" onClick={() => edit(r)}>{t("Edit")}</button>
                  {role === "admin" && <button type="button" className="btn sm danger" onClick={() => window.confirm(t("Delete this record?")) && deleteDoc(doc(db, "expenses", r.id)).then(() => toast("Record deleted"))}>{t("Delete")}</button>}
                </td>
              </tr>
            ))}
            {mine.length === 0 && <tr><td colSpan={5} className="muted">{t("No expenses for this client yet.")}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

const escHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const blankQuotItem = () => ({ desc: "", qty: 1, unitPrice: 0 });

function QuotationDesk({ role, rows, customers }) {
  const blank = () => ({
    no: "", customer: "", cebAddress: "", date: today(),
    status: "Draft",
    quotItems: [blankQuotItem()],
    panelSerials: "",
  });
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i, k, v) => setForm((f) => ({ ...f, quotItems: f.quotItems.map((it, n) => n === i ? { ...it, [k]: v } : it) }));
  const openNew = () => { setEditing(null); setForm(blank()); };
  const openEdit = (r) => {
    setEditing(r.id);
    setForm({
      no: r.no || "", customer: r.customer || "", cebAddress: r.cebAddress || "",
      date: r.date || today(), status: r.status || "Draft",
      quotItems: r.quotItems?.length ? r.quotItems.map((it) => ({ ...it })) : [blankQuotItem()],
      panelSerials: r.panelSerials || "",
    });
    document.getElementById("quot-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const total = form ? form.quotItems.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0) : 0;
  const save = async (e) => {
    e.preventDefault();
    if (!form.customer.trim()) return toast("Choose a customer");
    const data = {
      no: form.no.trim() || `Q-${Date.now().toString().slice(-6)}`,
      customer: form.customer.trim(),
      cebAddress: form.cebAddress.trim(),
      date: form.date || today(),
      status: form.status || "Draft",
      quotItems: form.quotItems.map((it) => ({ desc: it.desc || "", qty: Number(it.qty || 0), unitPrice: Number(it.unitPrice || 0) })),
      panelSerials: form.panelSerials || "",
      amount: form.quotItems.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0),
      capacityKw: 0,
      createdAt: editing ? undefined : serverTimestamp(),
    };
    if (!editing) { delete data.createdAt; await addDoc(collection(db, "quotations"), { ...data, createdAt: serverTimestamp() }); }
    else await updateDoc(doc(db, "quotations", editing), data);
    toast(editing ? "Quotation updated" : "Quotation saved");
    setForm(null); setEditing(null);
  };
  const setStatus = async (r, status) => { await updateDoc(doc(db, "quotations", r.id), { status }); toast("Marked {status}", { status }); };
  const toProject = async (r) => {
    const ref = await addDoc(collection(db, "projects"), {
      title: `${r.customer || "Customer"} Solar Project`,
      customer: r.customer || "", capacityKw: Number(r.capacityKw || 0),
      value: Number(r.amount || 0), stage: "Survey", date: today(),
      panelSerials: r.panelSerials || "", cebAddress: r.cebAddress || "",
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "quotations", r.id), { status: "Accepted", projectId: ref.id });
    toast("Project created from this quotation");
  };
  const toInvoice = async (r) => {
    await addDoc(collection(db, "invoices"), {
      no: `INV-${Date.now().toString().slice(-6)}`, customer: r.customer || "",
      amount: Number(r.amount || 0), status: "Unpaid", paymentMethod: "", date: today(), createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "quotations", r.id), { status: "Accepted" });
    toast("Invoice created from this quotation");
  };
  const shown = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()) && (!filter || r.status === filter));
  const statusOpts = ["Draft", "Sent", "Accepted", "Rejected"];
  return (
    <>
      <div className="quick">
        <button type="button" onClick={openNew}>{t("New quotation")}</button>
      </div>
      {form && (
        <form id="quot-editor" className="card" onSubmit={save}>
          <h3>{editing ? t("Edit Quotation") : t("New Quotation")}</h3>
          <div className="form">
            <label>{t("Quote #")}<input value={form.no} placeholder="Q-001" onChange={(e) => set("no", e.target.value)} /></label>
            <label>{t("Customer")}
              <input list="quot-customers" value={form.customer} required onChange={(e) => set("customer", e.target.value)} />
              <datalist id="quot-customers">{customers.map((c) => <option key={c.id} value={c.name}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>)}</datalist>
            </label>
            <label>{t("CEB Address")}<input value={form.cebAddress} placeholder="No. 16/10 A Central Road..." onChange={(e) => set("cebAddress", e.target.value)} /></label>
            <label>{t("Date")}<input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label>
            <label>{t("Status")}
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {statusOpts.map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            </label>
          </div>
          <h3>{t("Items")}</h3>
          <div className="lines-header">
            <span>{t("Description")}</span>
            <span>{t("Qty")}</span>
            <span>{t("Unit Price (LKR)")}</span>
            <span>{t("Amount")}</span>
            <span></span>
          </div>
          <div className="lines">
            {form.quotItems.map((it, i) => (
              <div className="line" key={i}>
                <input className="desc" placeholder={t("e.g. Solis 5kW Inverter S/N-...")} value={it.desc} onChange={(e) => setLine(i, "desc", e.target.value)} />
                <input type="number" aria-label={t("Qty")} value={it.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
                <input type="number" aria-label={t("Unit Price")} value={it.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} />
                <b>LKR {fmt(Number(it.qty || 0) * Number(it.unitPrice || 0))}</b>
                <button type="button" className="btn sm ghost line-actions" disabled={form.quotItems.length === 1} onClick={() => set("quotItems", form.quotItems.filter((_, n) => n !== i))}>{t("Remove")}</button>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => set("quotItems", [...form.quotItems, blankQuotItem()])}>{t("Add line")}</button>
          </div>
          <div className="bill-totals">
            <p className="grand"><span>{t("Total")}</span><b>LKR {fmt(total)}</b></p>
          </div>
          <label style={{ marginTop: "1rem" }}>{t("Panel Serial Numbers (one per line)")}
            <textarea value={form.panelSerials} rows={6} placeholder={"2620107340926391\n2620107340934028\n..."} autoComplete="off"
              onChange={(e) => set("panelSerials", e.target.value)}
              style={{ fontFamily: "monospace", fontSize: "0.85rem" }} />
          </label>
          <div className="form-actions" style={{ marginTop: "1rem" }}>
            <button className="btn">{editing ? t("Update Quotation") : t("Save Quotation")}</button>
            <button type="button" className="btn ghost" onClick={() => { setForm(null); setEditing(null); }}>{t("Cancel")}</button>
          </div>
        </form>
      )}
      <div className="card">
        <div className="pills">{[t("Open quotes LKR {n}", { n: fmt(rows.filter((q) => !["Rejected","Accepted"].includes(q.status)).reduce((s,q)=>s+Number(q.amount||0),0)) }), `${rows.length} quotations`].map((p) => <b key={p}>{p}</b>)}</div>
        <div className="toolbar">
          <input className="search" placeholder={t("Search quotations")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filters">
          <button type="button" className={!filter ? "on" : ""} onClick={() => setFilter("")}>{t("All")}</button>
          {statusOpts.map((o) => <button type="button" key={o} className={filter === o ? "on" : ""} onClick={() => setFilter(o)}>{t(o)}</button>)}
        </div>
        <div className="scroll"><table>
          <thead><tr><th>{t("Quote #")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th>{t("Total (LKR)")}</th><th>{t("Actions")}</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.no || "—"}</td><td>{r.customer || "—"}</td>
                <td>{r.date || "—"}</td><td>{t(r.status || "—")}</td><td>{fmt(r.amount)}</td>
                <td className="acts">
                  <button type="button" className="btn sm ghost" onClick={() => openEdit(r)}>{t("Edit")}</button>
                  <button type="button" className="btn sm ghost" onClick={() => {
                    const cust = customers.find((c) => c.name === r.customer) || {};
                    printQuotation({ ...r, nicAddress: r.nicAddress || cust.nicAddress || "", nicNo: r.nicNo || cust.nicNo || "", phone: r.phone || cust.phone || "" });
                  }}>{t("Print")}</button>
                  {!["Accepted","Rejected"].includes(r.status) && <button type="button" className="btn sm" onClick={() => setStatus(r, "Accepted")}>{t("Accept")}</button>}
                  {!["Accepted","Rejected"].includes(r.status) && <button type="button" className="btn sm ghost" onClick={() => setStatus(r, "Rejected")}>{t("Reject")}</button>}
                  {!r.projectId && r.status !== "Rejected" && <button type="button" className="btn sm" onClick={() => toProject(r)}>{t("Create project")}</button>}
                  {!r.invoiceId && r.status !== "Rejected" && <button type="button" className="btn sm" onClick={() => toInvoice(r)}>{t("Create invoice")}</button>}
                  {role === "admin" && <button type="button" className="btn sm danger" onClick={() => window.confirm(t("Delete this record?")) && deleteDoc(doc(db, "quotations", r.id)).then(() => toast("Record deleted"))}>{t("Delete")}</button>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="muted">{t("No quotations yet.")}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

function billTotals(doc) {
  const items = doc.items?.length ? doc.items : [{ desc: "Amount", qty: 1, rate: Number(doc.amount || 0) }];
  const sub = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.rate || 0), 0);
  const discount = Math.min(Math.max(0, Number(doc.discount || 0)), Math.max(0, sub));
  const base = Math.max(0, sub - discount);
  const tax = base * Math.max(0, Number(doc.taxPct || 0)) / 100;
  return { items, sub, discount, tax, total: base + tax };
}

function payLabel(row) {
  if (!row.paymentMethod) return "—";
  const method = t(row.paymentMethod);
  if (row.paymentMethod === "Cheque" && row.chequeNo) return `${method} · ${row.chequeNo}`;
  if (row.paymentMethod === "Bank transfer" && row.transferRef) return `${method} · ${row.transferRef}`;
  return method;
}

function printBill(bill) {
  const totals = billTotals(bill);
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups to print"); return; }
  const lines = totals.items.map((it) => `
    <tr>
      <td style="text-align:left">${escHtml(it.desc || "—")}</td>
      <td style="text-align:center">${Number(it.qty||0) > 0 ? fmt(it.qty) : ""}</td>
      <td style="text-align:right">${fmt(Number(it.qty||0)*Number(it.rate||0))}</td>
    </tr>`).join("");
  const advance = bill.advanceDate || bill.advanceAmount ? `
    <tr>
      <td style="text-align:left">${escHtml(bill.advanceDate || "")} — ${escHtml(bill.advanceMethod || "Cash Deposit")}</td>
      <td style="text-align:center">Advance</td>
      <td style="text-align:right">${fmt(bill.advanceAmount)}</td>
    </tr>` : "";
  const finalpay = bill.finalDate || bill.finalAmount ? `
    <tr>
      <td style="text-align:left">${escHtml(bill.finalDate || "")} — ${escHtml(bill.finalMethod || "Cash Deposit")}</td>
      <td style="text-align:center">Final Pay</td>
      <td style="text-align:right">${fmt(bill.finalAmount)}</td>
    </tr>` : "";
  const fullPaidRow = bill.status === "Paid" ? `
    <tr><td colspan="3" style="text-align:center;font-weight:800;border-top:2px solid #166534;padding-top:8px">Full Paid</td></tr>` : "";

  w.document.write(`<!doctype html><html><head><title>Invoice</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"Times New Roman",serif;font-size:11.5px;color:#111;padding:24px 32px}
    .header{display:flex;align-items:center;gap:14px;border-bottom:2.5px solid #111;padding-bottom:8px;margin-bottom:10px}
    .co-name{font-size:22px;font-weight:900;letter-spacing:.03em;color:#111;line-height:1.15}
    .co-sub{font-size:10px;color:#333;margin-top:2px;line-height:1.6}
    .inv-title{text-align:center;font-size:16px;font-weight:700;margin:8px 0 10px;letter-spacing:.08em}
    .meta{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;font-size:11px;gap:10px}
    .bill-to{line-height:1.8}
    .bill-right{text-align:right;line-height:1.8}
    table{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:11px}
    th{background:#e8f5e9;border:1px solid #666;padding:5px 8px;font-weight:700;text-align:center}
    td{border:1px solid #999;padding:4px 8px;vertical-align:middle}
    .subtotal-row td{font-weight:700;background:#f0f0f0;border-top:1.5px solid #555}
    .fullpaid-row td{font-weight:800;text-align:center;background:#e8f5e9;border-top:2px solid #166534;font-size:12px}
    .terms{margin-top:10px;font-size:10.5px;line-height:1.65;border-top:1px solid #999;padding-top:8px;color:#222}
    .terms b{font-size:11.5px;display:block;margin-bottom:2px}
    .terms-payment{margin-top:6px}
    .thankyou{text-align:center;margin-top:10px;font-size:12px;font-style:italic;font-weight:700;border-top:1px solid #ccc;padding-top:8px}
    @media print{body{padding:8px 14px}@page{margin:5mm}html,body{height:auto}}
  </style></head><body>
  <div class="header">
    <img src="${logoImg}" alt="RAM Green Energy" width="90" height="90" style="border-radius:50%;flex:none;object-fit:contain"/>
    <div>
      <div class="co-name">RAM GREEN ENERGY (PVT) LTD.</div>
      <div class="co-sub">No.135B, 1st Floor, Inner harbor Road, Orr's hill, Trincomalee.<br>
      026-2221400 / 0775158810 / 0775512831</div>
    </div>
  </div>
  <div class="inv-title">Invoice</div>
  <div class="meta">
    <div class="bill-to">
      <b>Bill To:</b> ${escHtml(bill.customer || "—")}<br>
      ${bill.billAddress ? `<span style="margin-left:46px">${escHtml(bill.billAddress)}</span>` : ""}
    </div>
    <div class="bill-right">
      <b>Date:</b> ${escHtml(bill.date || today())}<br>
      <b>Invoice No:</b> ${escHtml(bill.no || "—")}<br>
      <b>Customer File No:</b> ${escHtml(bill.customerFileNo || "—")}
    </div>
  </div>
  <table>
    <thead><tr><th style="width:60%">Description</th><th style="width:20%">Quantity</th><th style="width:20%">Amount</th></tr></thead>
    <tbody>
      ${lines}
      <tr class="subtotal-row">
        <td colspan="2" style="text-align:right;padding-right:12px">SUBTOTAL</td>
        <td style="text-align:right">${fmt(totals.sub)}</td>
      </tr>
      ${advance}
      ${finalpay}
      ${fullPaidRow}
    </tbody>
  </table>
  <div class="terms">
    <b>Terms and Conditions:</b>
    * Invoice / Warranty card must be produced for warranty claims.<br>
    * For warranty claims, contact RAM GREEN ENERGY (PVT) LTD. on 077 551 2831 / 077 515 8810<br>
    * Wear and tear on wiring, scratches, stains, etc. that do not affect the function of goods, wiring &amp; other accessories on equipment cannot be claimed under warranty.<br>
    * Natural perils, misuse of equipment, burnt marks, repairs made by 3rd party other than RAM GREEN ENERGY (PVT) LTD. and any tampering or misuse of equipment renders the warranty void.<br>
    * Installers and End Consumers are advised to insure the Solar System under "General Insurance Policy", as under no circumstances will RAM GREEN ENERGY (PVT) LTD be liable for consequential, special, direct/indirect, incidental, punitive damages, losses or expenses occurred in any such situations.<br>
    * Anyone installing batteries that are not compatible with Growth will take the risk of warranty not being honored by the manufacturer company. Similarly we RAM GREEN ENERGY will also not issue replacements if Manufacturer does not advise us to offer this.<br>
    * In quarterly basic first three years visualization using the Solis smart energy management app.
    <div class="terms-payment">
    <b>Terms and Conditions: Payment</b>
    * Price validity - 5 Working days only<br>
    * Cheques should be made payable to — RAM GREEN ENERGY (PVT) LTD.<br>
    * Bank Deposit slip to : ramgreenenergy@gmail.com<br>
    <span style="font-size:10.5px;font-weight:600;color:#111">* For any quarries contact our accountant on email - ramgreenenergy@gmail.com</span><br>
    * Delayed / Overdue payments will be subject to 1% per month on outstanding balances.<br>
    * Price on items may change according to International Foreign Currency Exchange Rates Banking Information.<br>
    * Ram Green Energy (Pvt) Ltd. – People's Bank – Trincomalee main branch – 066100140068134.
    </div>
  </div>
  <div class="thankyou">Thank you For Your Business.</div>
  </body></html>`);
  w.document.close(); w.focus(); w.print();
}

function InvoiceDesk({ role, rows, customers }) {
  const blank = (docType) => ({
    docType, no: "", customerFileNo: "", customer: "", billAddress: "",
    date: today(), status: "Unpaid",
    paymentMethod: "", chequeNo: "", chequeDate: "", bankName: "", transferRef: "",
    advanceDate: "", advanceAmount: "", advanceMethod: "Cash Deposit",
    finalDate: "", finalAmount: "", finalMethod: "Cash Deposit",
    items: [blankLine()],
  });
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i, k, v) => setForm((f) => ({ ...f, items: f.items.map((it, n) => n === i ? { ...it, [k]: v } : it) }));
  const openNew = (docType) => { setEditing(null); setForm(blank(docType)); };
  const openEdit = (r) => {
    const items = r.items?.length ? r.items.map((it) => ({ ...it })) : [{ desc: r.customer ? `${r.customer} — solar work` : "Amount", qty: 1, rate: Number(r.amount || 0) }];
    setEditing(r.id);
    setForm({
      docType: r.docType === "Bill" ? "Bill" : "Invoice",
      no: r.no || "", customerFileNo: r.customerFileNo || "",
      customer: r.customer || "", billAddress: r.billAddress || "",
      date: r.date || today(), status: r.status || "Unpaid",
      paymentMethod: r.paymentMethod || "", chequeNo: r.chequeNo || "",
      chequeDate: r.chequeDate || "", bankName: r.bankName || "", transferRef: r.transferRef || "",
      advanceDate: r.advanceDate || "", advanceAmount: r.advanceAmount || "",
      advanceMethod: r.advanceMethod || "Cash Deposit",
      finalDate: r.finalDate || "", finalAmount: r.finalAmount || "",
      finalMethod: r.finalMethod || "Cash Deposit",
      items: r.items?.length ? r.items.map((it) => ({ ...it })) : [{ desc: r.customer ? `${r.customer} — solar work` : "Amount", qty: 1, rate: Number(r.amount || 0) }],
    });
    document.getElementById("bill-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const save = async (e) => {
    e.preventDefault();
    if (!form.customer.trim()) return toast("Choose a customer");
    if (form.items.some((it) => Number(it.qty) < 0 || Number(it.rate) < 0)) return toast("Numbers cannot be negative");
    const totals = billTotals(form);
    const data = {
      docType: form.docType,
      no: form.no.trim() || `RGE/OG/${new Date().getMonth()+1}/${String(new Date().getFullYear()).slice(-2)}/${new Date().toLocaleString("default",{month:"short"})}/${String(Date.now()).slice(-6)}`,
      customerFileNo: form.customerFileNo.trim(),
      customer: form.customer.trim(),
      billAddress: form.billAddress.trim(),
      date: form.date || today(),
      status: form.status || "Unpaid",
      paymentMethod: form.paymentMethod || "",
      chequeNo: form.paymentMethod === "Cheque" ? form.chequeNo.trim() : "",
      chequeDate: form.paymentMethod === "Cheque" ? (form.chequeDate || "") : "",
      bankName: form.paymentMethod === "Cash" ? "" : (form.bankName || "").trim(),
      transferRef: form.paymentMethod === "Bank transfer" ? form.transferRef.trim() : "",
      advanceDate: form.advanceDate || "",
      advanceAmount: Number(form.advanceAmount || 0),
      advanceMethod: form.advanceMethod || "Cash Deposit",
      finalDate: form.finalDate || "",
      finalAmount: Number(form.finalAmount || 0),
      finalMethod: form.finalMethod || "Cash Deposit",
      items: form.items.map((it) => ({ desc: it.desc || "", qty: Number(it.qty || 0), rate: Number(it.rate || 0) })),
      amount: totals.total,
    };
    if (editing) await updateDoc(doc(db, "invoices", editing), data);
    else await addDoc(collection(db, "invoices"), { ...data, createdAt: serverTimestamp() });
    toast(editing ? "{doc} updated" : "{doc} saved", { doc: form.docType });
    setForm(null); setEditing(null);
  };
  const recordPayment = async (r, status, method) => {
    if (method === "Cash") {
      await updateDoc(doc(db, "invoices", r.id), { status, paymentMethod: "Cash", chequeNo: "", chequeDate: "", bankName: "", transferRef: "" });
      toast("Marked {status}", { status });
      return;
    }
    openEdit({ ...r, status, paymentMethod: method });
    toast(method === "Cheque" ? "Add the cheque details, then save" : "Add the transfer details, then save");
  };
  const shown = rows.filter((r) => {
    const type = r.docType === "Bill" ? "Bill" : "Invoice";
    const hit = JSON.stringify(r).toLowerCase().includes(search.toLowerCase());
    return hit && (!kind || type === kind);
  });
  const totals = form ? billTotals(form) : null;
  return (
    <>
      <div className="quick">
        <button type="button" onClick={() => openNew("Invoice")}>{t("New invoice")}</button>
        <button type="button" onClick={() => openNew("Bill")}>{t("New bill")}</button>
      </div>
      {form && (
        <form id="bill-editor" className="card" onSubmit={save}>
          <h3>{editing ? t("Edit {doc}", { doc: form.docType }) : t("New {doc}", { doc: form.docType })}</h3>
          <div className="form">
            <label>{t("Invoice No")}
              <input value={form.no} placeholder="RGE/OG/5/26/May/000149" onChange={(e) => set("no", e.target.value)} />
            </label>
            <label>{t("Customer File No")}
              <input value={form.customerFileNo} placeholder="Ram/TR/2026/F/149" onChange={(e) => set("customerFileNo", e.target.value)} />
            </label>
            <label>{t("Customer")}
              <input list="bill-customers" value={form.customer} required onChange={(e) => set("customer", e.target.value)} />
              <datalist id="bill-customers">{customers.map((c) => <option key={c.id} value={c.name}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>)}</datalist>
            </label>
            <label>{t("Bill To Address")}
              <input value={form.billAddress} placeholder="No. 16/10 A Central Road, Trincomalee" onChange={(e) => set("billAddress", e.target.value)} />
            </label>
            <label>{t("Date")}<input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label>
            <label>{t("Status")}
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {["Unpaid", "Partial", "Paid"].map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            </label>
          </div>
          <h3>{t("Advance Payment")}</h3>
          <div className="form">
            <label>{t("Advance Date")}<input type="date" value={form.advanceDate} onChange={(e) => set("advanceDate", e.target.value)} /></label>
            <label>{t("Advance Amount (LKR)")}<input type="number" value={form.advanceAmount} placeholder="500000" onChange={(e) => set("advanceAmount", e.target.value)} /></label>
            <label>{t("Advance Method")}<input value={form.advanceMethod} placeholder="Cash Deposit" onChange={(e) => set("advanceMethod", e.target.value)} /></label>
          </div>
          <h3>{t("Final Payment")}</h3>
          <div className="form">
            <label>{t("Final Date")}<input type="date" value={form.finalDate} onChange={(e) => set("finalDate", e.target.value)} /></label>
            <label>{t("Final Amount (LKR)")}<input type="number" value={form.finalAmount} placeholder="390000" onChange={(e) => set("finalAmount", e.target.value)} /></label>
            <label>{t("Final Method")}<input value={form.finalMethod} placeholder="Cash Deposit" onChange={(e) => set("finalMethod", e.target.value)} /></label>
          </div>
          <h3>{t("Lines")}</h3>
          <div className="lines-header">
            <span>{t("Description")}</span>
            <span>{t("Quantity")}</span>
            <span>{t("Amount (LKR)")}</span>
            <span></span>
            <span></span>
          </div>
          <div className="lines">
            {form.items.map((it, i) => (
              <div className="line" key={i}>
                <input className="desc" placeholder={t("Description — panels, inverter, labour…")} value={it.desc} onChange={(e) => setLine(i, "desc", e.target.value)} />
                <input type="number" aria-label={t("Quantity")} value={it.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
                <input type="number" aria-label={t("Amount (LKR)")} value={it.rate} onChange={(e) => setLine(i, "rate", e.target.value)} />
                <b>LKR {fmt(Number(it.qty || 0) * Number(it.rate || 0))}</b>
                <button type="button" className="btn sm ghost line-actions" disabled={form.items.length === 1} onClick={() => set("items", form.items.filter((_, n) => n !== i))}>{t("Remove")}</button>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => set("items", [...form.items, blankLine()])}>{t("Add line")}</button>
          </div>
          <div className="bill-totals">
            <p className="grand"><span>{t("Total")}</span><b>LKR {fmt(totals.total)}</b></p>
          </div>
          <div className="form-actions">
            <button className="btn">{editing ? t("Update") : t("Save")} {t(form.docType)}</button>
            <button type="button" className="btn ghost" onClick={() => { setForm(null); setEditing(null); }}>{t("Cancel")}</button>
          </div>
        </form>
      )}
      <div className="card">
        <div className="toolbar">
          <input className="search" placeholder={t("Search bills and invoices")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filters">
          {["", "Invoice", "Bill"].map((k) => <button type="button" key={k || "all"} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k ? t(k) : t("All")}</button>)}
        </div>
        <div className="scroll"><table>
          <thead><tr><th>{t("No.")}</th><th>{t("Type")}</th><th>{t("Customer")}</th><th>{t("Date")}</th><th>{t("Status")}</th><th>{t("Payment")}</th><th>{t("Total (LKR)")}</th><th>{t("Actions")}</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.no || "—"}</td><td>{t(r.docType === "Bill" ? "Bill" : "Invoice")}</td><td>{r.customer || "—"}</td>
                <td>{r.date || "—"}</td><td>{t(r.status || "—")}</td><td>{payLabel(r)}</td><td>{fmt(billTotals(r).total)}</td>
                <td className="acts">
                  <button type="button" className="btn sm" onClick={() => openEdit(r)}>{t("Customize")}</button>
                  <button type="button" className="btn sm ghost" onClick={() => printBill(r)}>{t("Print")}</button>
                  {r.status !== "Paid" && (
                    <select className="pay-pick" value="" aria-label={t("Record payment")} onChange={(e) => {
                      const [status, method] = e.target.value.split("|");
                      if (status && method) recordPayment(r, status, method);
                    }}>
                      <option value="">{t("Record payment")}</option>
                      {(r.status === "Unpaid" ? ["Partial", "Paid"] : ["Paid"]).flatMap((status) => PAY_METHODS.map((method) => (
                        <option key={`${status}-${method}`} value={`${status}|${method}`}>{t(status)} · {t(method)}</option>
                      )))}
                    </select>
                  )}
                  {role === "admin" && <button type="button" className="btn sm danger" onClick={() => window.confirm(t("Delete this record?")) && deleteDoc(doc(db, "invoices", r.id)).then(() => toast("Record deleted"))}>{t("Delete")}</button>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="muted">{t("No bills or invoices yet.")}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

function readTheme() {
  const saved = localStorage.getItem("rg_theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeButton({ theme, onToggle }) {
  const next = theme === "dark" ? "light" : "dark";
  const mode = next === "dark" ? "Dark mode" : "Light mode";
  return (
    <button type="button" className="theme" onClick={onToggle} aria-pressed={theme === "dark"} title={t("Switch to {mode}", { mode })}>
      <span className="ico"><Ic n={theme === "dark" ? "projects" : "moon"} /></span>
      <span className="lbl">{t(mode)}</span>
    </button>
  );
}

function LangButton() {
  const { lang } = useLang();
  const next = lang === "ta" ? "en" : "ta";
  return (
    <button type="button" className="lang-switch" onClick={() => setLang(next)} title={next === "ta" ? "தமிழ்" : "English"}>
      {lang === "ta" ? "EN" : "தமிழ்"}
    </button>
  );
}

function LanguageScreen() {
  const { lang } = useLang();
  return (
    <div className="lang-grid">
      <button type="button" className={`lang-pick ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>
        <b>English</b>
        <span>{t("Buttons, forms, and messages stay in English.")}</span>
      </button>
      <button type="button" className={`lang-pick ${lang === "ta" ? "on" : ""}`} onClick={() => setLang("ta")}>
        <b>தமிழ்</b>
        <span>{t("Neural Tamil for every screen. Records you typed stay unchanged.")}</span>
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState("dashboard");
  const [clientId, setClientId] = useState(null);
  const [role, setRole] = useState("staff");
  const [min, setMin] = useState(false);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const { lang } = useLang();
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    localStorage.setItem("rg_theme", next);
    return next;
  });
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => { if (!user) return; return onSnapshot(doc(db, "users", user.uid), (d) => setRole(d.data()?.role || "staff")); }, [user]);
  const ok = !!user;
  const data = {
    customers: useCol("customers", ok), projects: useCol("projects", ok),
    inventory: useCol("inventory", ok), invoices: useCol("invoices", ok),
    quotations: useCol("quotations", ok), expenses: useCol("expenses", ok),
    adminExpenses: useCol("adminExpenses", ok),
  };
  if (user === undefined) return <div className="login"><Orbs /><Logo big /></div>;
  if (!user) return <Login theme={theme} onToggle={toggleTheme} />;
  const items = [["dashboard", "Dashboard"], ["roi", "ROI Calculator"], ...Object.entries(MODULES).map(([k, m]) => [k, m.label]), ["language", "Language"]];
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const hints = {
    roi: "Estimate monthly savings and payback for a customer.",
    quotations: "Save a quote, then accept it, create a project, or turn it into an invoice.",
    invoices: "Build a custom invoice or bill, then record the payment as cash, cheque, or bank transfer.",
    purchaseOrders: "Pick an inventory item, then receive the order to add stock.",
    projects: "Move a job forward with Next stage, from survey through commissioning.",
    siteVisits: "Schedule a visit, then mark it done when the crew finishes.",
    inventory: "Rows in amber are at or below the minimum quantity.",
    customers: "Each new client gets the next code, such as RG-C001. Open a row for budget, spending, and profit or loss.",
    expenses: "Choose a client and type the category yourself. You will be asked to confirm if the amount goes over that client's budget.",
    adminExpenses: "Office costs stay separate from client jobs. Type the category yourself. These amounts are not added to a client's budget.",
    language: "Choose English or Neural Tamil. The whole app switches at once, and the choice stays on this device.",
  };
  const openClient = data.customers.find((c) => c.id === clientId);
  const viewingClient = tab === "customers" && !!clientId;
  const hint = viewingClient
    ? t("Budget, spent, and profit are calculated from this client's expenses only.")
    : tab === "dashboard"
      ? t("{greet}. Here is the business at a glance.", { greet })
      : t(hints[tab] || "Fill in the form to add a record. Edit, export, or delete it from the list.");
  const title = viewingClient
    ? (openClient ? `${openClient.code || t("Client")} · ${openClient.name || ""}` : t("Client"))
    : t(tab === "dashboard" ? "Dashboard" : tab === "roi" ? "ROI Calculator" : tab === "language" ? "Language" : MODULES[tab].label);
  return (
    <div className="layout">
      <Orbs />
      {menu && <button className="shade" aria-label={t("Close menu")} onClick={() => setMenu(false)} />}
      <aside className={`${min ? "min" : ""} ${menu ? "open" : ""}`}>
        <div className="brand"><Logo /><span className="lbl"><b>Ram Green</b><small>{t("Solar Energy")} · {t(role === "admin" ? "Admin" : "Staff")}</small></span></div>
        <button className="tog" onClick={() => setMin(!min)} title={t("Collapse menu")}><Ic n="menu" /></button>
        <button className="burger" aria-expanded={menu} aria-label={t(menu ? "Close menu" : "Open menu")} onClick={() => setMenu(!menu)}><Ic n={menu ? "close" : "menu"} /></button>
        <div className="drawer">
          <nav>
            {items.map(([k, l], i) => (
              <button key={k} style={{ "--i": i }} title={t(l)} className={tab === k ? "on" : ""} onClick={() => { setMenu(false); setClientId(null); setTab(k); }}>
                <span className="ico"><Ic n={k} /></span><span className="lbl">{t(l)}</span>
                {data[k]?.length > 0 && <em className="badge">{data[k].length}</em>}
              </button>
            ))}
          </nav>
          <button className="out" onClick={() => { setMenu(false); signOut(auth); }} title={t("Sign out")}><span className="ico"><Ic n="logout" /></span><span className="lbl">{t("Sign out")}</span></button>
        </div>
      </aside>
      <main>
        <header className="top">
          <h1>{title}</h1>
          <p className="muted">{hint}</p>
        </header>
        <div key={viewingClient ? `client-${clientId}-${lang}` : `${tab}-${lang}`} className="page">
          {tab === "dashboard" ? <Dashboard data={data} go={(k) => { setClientId(null); setTab(k); }} openClient={(id) => { setTab("customers"); setClientId(id); }} />
            : tab === "roi" ? <Roi />
            : tab === "language" ? <LanguageScreen />
            : viewingClient ? <ClientDetail id={clientId} role={role} onBack={() => setClientId(null)} />
            : tab === "invoices" ? <InvoiceDesk role={role} rows={data.invoices} customers={data.customers} />
            : tab === "quotations" ? <QuotationDesk role={role} rows={data.quotations || []} customers={data.customers} />
            : <Crud name={tab} role={role} onOpenCustomer={setClientId} theme={theme} onToggle={toggleTheme} goToCustomer={(customerName) => {
                const found = data.customers.find((c) => c.name === customerName);
                if (found) { setClientId(found.id); setTab("customers"); }
              }} />}
        </div>
      </main>
      <Toasts />
    </div>
  );
}

const P = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  roi: "M5 3h14v18H5zM8 7h8M8 12h2M14 12h2M8 16h2M14 16h2",
  customers: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  projects: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  inventory: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  invoices: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8",
  quotations: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  siteVisits: "M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  suppliers: "M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  purchaseOrders: "M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6",
  employees: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  attendance: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  expenses: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  adminExpenses: "M3 21h18M6 21V5l6-3 6 3v16M10 21v-5h4v5",
  language: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 12h18M3 6h18M3 18h18",
  close: "M6 6l12 12M18 6L6 18",
  moon: "M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 0 0 21 14.5z",
};
const Ic = ({ n }) => <svg viewBox="0 0 24 24"><path d={P[n]} /></svg>;
const toast = (m, vars) => window.dispatchEvent(new CustomEvent("toast", { detail: { m, vars } }));
const Orbs = () => <div className="orbs" aria-hidden="true"><i /><i /><i /><span className="rays" /></div>;

function Logo({ big }) {
  const z = big ? 96 : 52;
  return (
    <img
      src={logoImg}
      alt="Ram Green Energy Logo"
      width={z}
      height={z}
      className={"logo-img" + (big ? " big" : "")}
      style={{ borderRadius: "50%", objectFit: "contain" }}
    />
  );
}

function CountUp({ v }) {
  const n = Number(String(v).replace(/,/g, "")) || 0;
  const [x, setX] = useState(0);
  useEffect(() => {
    let f, t0;
    const run = (t) => { t0 ??= t; const q = Math.min(1, (t - t0) / 800); setX(n * (1 - Math.pow(1 - q, 3))); if (q < 1) f = requestAnimationFrame(run); };
    f = requestAnimationFrame(run);
    return () => cancelAnimationFrame(f);
  }, [n]);
  return <>{fmt(Math.round(x))}</>;
}

function Toasts() {
  useLang();
  const [list, setList] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Math.random();
      const detail = e.detail?.m ? e.detail : { m: e.detail };
      setList((x) => [...x, { id, m: detail.m, vars: detail.vars }]);
      setTimeout(() => setList((x) => x.filter((y) => y.id !== id)), 2500);
    };
    window.addEventListener("toast", h);
    return () => window.removeEventListener("toast", h);
  }, []);
  return <div className="toasts">{list.map((x) => <div className="toast" key={x.id}>{t(x.m, x.vars)}</div>)}</div>;
}

function Roi() {
  const [v, setV] = useState({ kw: 5, bill: 25000, tariff: 40, perKw: 250000, sun: 4.5 });
  const set = (k) => (e) => setV({ ...v, [k]: Number(e.target.value) });
  const units = v.kw * v.sun * 30;
  const save = Math.min(v.bill, units * v.tariff);
  const cost = v.kw * v.perKw;
  const L = [["kw", "System size (kW)"], ["bill", "Monthly bill (LKR)"], ["tariff", "Tariff (LKR/unit)"], ["perKw", "Cost per kW (LKR)"], ["sun", "Sun hours/day"]];
  return (
    <div className="grid2">
      <div className="card form">{L.map(([k, l]) => <label key={k}>{t(l)}<input type="number" value={v[k]} onChange={set(k)} /></label>)}</div>
      <div className="card">
        <p className="roi-row"><span>{t("Generation")}</span><b>{t("{n} units/month", { n: fmt(units) })}</b></p>
        <p className="roi-row"><span>{t("Monthly saving")}</span><b>LKR {fmt(save)}</b></p>
        <p className="roi-row"><span>{t("System cost")}</span><b>LKR {fmt(cost)}</b></p>
        <p className="roi-row"><span>{t("Payback")}</span><b>{save ? t("{n} years", { n: (cost / (save * 12)).toFixed(1) }) : "—"}</b></p>
        <p className="muted">{t("Estimates only. Change the assumptions to match the tariff and the site.")}</p>
      </div>
    </div>
  );
}
