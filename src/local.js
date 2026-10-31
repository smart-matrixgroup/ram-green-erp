// Firebase-compatible mini backend using localStorage (demo mode)
const K = (c) => "rg_" + c;
const read = (c) => JSON.parse(localStorage.getItem(K(c)) || "[]");
const write = (c, rows) => { localStorage.setItem(K(c), JSON.stringify(rows)); emit(); };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const collection = (_db, name) => ({ name });
export const doc = (_db, col, id) => ({ col, id });
export const query = (c) => c;
export const orderBy = () => null;
export const serverTimestamp = () => Date.now();

export const addDoc = async (c, data) => {
  const id = uid();
  write(c.name, [...read(c.name), { ...data, id }]);
  return { id };
};
export const updateDoc = async (r, data) =>
  write(r.col, read(r.col).map((x) => (x.id === r.id ? { ...x, ...data } : x)));
export const deleteDoc = async (r) => write(r.col, read(r.col).filter((x) => x.id !== r.id));

export const onSnapshot = (ref, cb) => {
  const run = () => {
    if (ref.col === "users") return cb({ data: () => ({ role: "admin" }) });
    const rows = read(ref.name).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    cb({ docs: rows.map(({ id, ...rest }) => ({ id, data: () => rest })) });
  };
  subs.add(run); run();
  return () => subs.delete(run);
};

// demo auth
const DEMO = { email: "admin@ramgreen.com", pw: "admin123" };
const authSubs = new Set();
const current = () => (localStorage.getItem("rg_user") ? { uid: "local-admin", email: DEMO.email } : null);
export const onAuthStateChanged = (_a, cb) => {
  authSubs.add(cb); setTimeout(() => cb(current()), 0);
  return () => authSubs.delete(cb);
};
export const signInWithEmailAndPassword = async (_a, email, pw) => {
  if (email !== DEMO.email || pw !== DEMO.pw) throw new Error("bad login");
  localStorage.setItem("rg_user", "1"); authSubs.forEach((f) => f(current()));
};
export const signOut = async () => { localStorage.removeItem("rg_user"); authSubs.forEach((f) => f(null)); };
