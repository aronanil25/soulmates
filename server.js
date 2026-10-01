const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultDb = {
  users: [
    {
      id: "admin-1",
      email: "admin@soulmate.local",
      passwordHash: "",
      name: "SoulMate Admin",
      role: "admin",
      createdAt: new Date().toISOString(),
      status: "active",
      profile: null
    },
    {
      id: "maya-1",
      email: "maya@soulmate.local",
      passwordHash: "",
      name: "Maya Thomas",
      role: "user",
      createdAt: new Date().toISOString(),
      status: "active",
      profile: {
        gender: "Female",
        dob: "2000-03-14",
        height: "165 cm",
        religion: "Christian",
        community: "Any",
        motherTongue: "Malayalam",
        education: "B.Tech",
        occupation: "Software Engineer",
        city: "Kochi",
        state: "Kerala",
        country: "India",
        about: "Coffee, travel and long conversations. Looking for a kind, family-oriented person.",
        photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=85",
        interests: ["Travel", "Music", "Food"],
        preference: { gender: "Male", minAge: 24, maxAge: 32, location: "Kerala" },
        approved: true
      }
    },
    {
      id: "arjun-1",
      email: "arjun@soulmate.local",
      passwordHash: "",
      name: "Arjun Joseph",
      role: "user",
      createdAt: new Date().toISOString(),
      status: "active",
      profile: {
        gender: "Male",
        dob: "1998-08-22",
        height: "178 cm",
        religion: "Christian",
        community: "Any",
        motherTongue: "Malayalam",
        education: "MBA",
        occupation: "Product Manager",
        city: "Thiruvananthapuram",
        state: "Kerala",
        country: "India",
        about: "Weekend road trips, movies and trying new cafés. Values honesty and family.",
        photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85",
        interests: ["Travel", "Movies", "Coffee"],
        preference: { gender: "Female", minAge: 22, maxAge: 30, location: "Kerala" },
        approved: true
      }
    }
  ],
  interests: [],
  favorites: [],
  messages: [],
  reports: [],
  blocks: [],
  sessions: []
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt}:${derived.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  const [salt, key] = String(stored || "").split(":");
  if (!salt || !key) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      const a = Buffer.from(key, "hex");
      const b = Buffer.from(derived.toString("hex"), "hex");
      resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
    });
  });
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

let db = loadDb();
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }, 80);
}

async function seedPasswords() {
  let changed = false;
  const demoPasswords = {
    "admin@soulmate.local": "Admin@123",
    "maya@soulmate.local": "Password@123",
    "arjun@soulmate.local": "Password@123"
  };
  for (const u of db.users) {
    const email = String(u.email || "").toLowerCase();
    if (demoPasswords[email]) {
      const valid = await verifyPassword(demoPasswords[email], u.passwordHash || "");
      if (!valid) {
        u.passwordHash = await hashPassword(demoPasswords[email]);
        changed = true;
      }
    } else if (!u.passwordHash) {
      u.passwordHash = await hashPassword("Password@123");
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  db.sessions = [...sessions.entries()].map(([token, s]) => ({ token, ...s }));
  saveDb();
  return token;
}

function getSessionUser(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)soulmate_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  const user = db.users.find(u => u.id === session.userId && u.status !== "blocked");
  return user || null;
}

function loadSessions() {
  for (const item of db.sessions || []) sessions.set(item.token, { userId: item.userId, createdAt: item.createdAt });
}
loadSessions();

function clearSession(req, res) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)soulmate_session=([^;]+)/);
  if (match) sessions.delete(decodeURIComponent(match[1]));
  res.setHeader("Set-Cookie", "soulmate_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function text(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 8_000_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function requireUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    json(res, 401, { error: "Please log in." });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    json(res, 403, { error: "Admin access required." });
    return null;
  }
  return user;
}

function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00Z");
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function publicProfile(u) {
  if (!u || !u.profile) return null;
  const p = u.profile;
  return {
    id: u.id,
    name: u.name,
    age: ageFromDob(p.dob),
    email: u.email,
    gender: p.gender,
    height: p.height,
    religion: p.religion,
    community: p.community,
    motherTongue: p.motherTongue,
    education: p.education,
    occupation: p.occupation,
    city: p.city,
    state: p.state,
    country: p.country,
    about: p.about,
    photo: p.photo,
    interests: p.interests || [],
    preference: p.preference || {},
    approved: !!p.approved,
    status: u.status,
    createdAt: u.createdAt
  };
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    hasProfile: !!u.profile,
    profileApproved: !!(u.profile && u.profile.approved),
    status: u.status,
    createdAt: u.createdAt
  };
}

function isBlocked(a, b) {
  return db.blocks.some(x => (x.userId === a && x.targetId === b) || (x.userId === b && x.targetId === a));
}

function canChat(a, b) {
  return db.interests.some(x =>
    ((x.fromId === a && x.toId === b) || (x.fromId === b && x.toId === a)) && x.status === "accepted"
  ) && !isBlocked(a, b);
}

function matchStatus(a, b) {
  const i = db.interests.find(x =>
    (x.fromId === a && x.toId === b) || (x.fromId === b && x.toId === a)
  );
  return i ? i.status : null;
}

function searchProfiles(current, q) {
  const ageMin = q.get("minAge") ? Number(q.get("minAge")) : null;
  const ageMax = q.get("maxAge") ? Number(q.get("maxAge")) : null;
  const gender = q.get("gender") || "";
  const location = q.get("location") || "";
  const religion = q.get("religion") || "";
  const textQ = (q.get("q") || "").toLowerCase().trim();

  return db.users
    .filter(u => u.role === "user" && u.id !== current.id && u.status === "active" && u.profile?.approved)
    .filter(u => !isBlocked(current.id, u.id))
    .map(publicProfile)
    .filter(p => gender === "" || gender === "Everyone" || p.gender === gender)
    .filter(p => !ageMin || (p.age != null && p.age >= ageMin))
    .filter(p => !ageMax || (p.age != null && p.age <= ageMax))
    .filter(p => !location || location === "Anywhere" || p.state === location || p.city === location)
    .filter(p => !religion || religion === "Any" || p.religion === religion)
    .filter(p => !textQ || `${p.name} ${p.city} ${p.occupation} ${p.education} ${(p.interests || []).join(" ")}`.toLowerCase().includes(textQ))
    .sort((a,b) => a.name.localeCompare(b.name));
}

async function handleApi(req, res, pathname, url) {
  if (pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, { ok: true, app: "SoulMate", free: true });
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    const body = await parseBody(req);
    const { name, email, password, gender } = body;
    if (!name || !email || !password || !gender) return json(res, 400, { error: "Name, email, password and gender are required." });
    if (password.length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
    const normalized = String(email).trim().toLowerCase();
    if (db.users.some(u => u.email.toLowerCase() === normalized)) return json(res, 409, { error: "An account with that email already exists." });

    const user = {
      id: crypto.randomUUID(),
      email: normalized,
      passwordHash: await hashPassword(password),
      name: String(name).trim().slice(0, 80),
      role: "user",
      createdAt: new Date().toISOString(),
      status: "active",
      profile: {
        gender,
        dob: "",
        height: "",
        religion: "",
        community: "",
        motherTongue: "",
        education: "",
        occupation: "",
        city: "",
        state: "",
        country: "India",
        about: "",
        photo: "",
        interests: [],
        preference: { gender: gender === "Male" ? "Female" : "Male", minAge: 22, maxAge: 35, location: "Kerala" },
        approved: false
      }
    };
    db.users.push(user);
    saveDb();

    const token = createSession(user.id);
    return json(res, 201, { user: publicUser(user) }, {
      "Set-Cookie": `soulmate_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
    });
  }

  if (pathname === "/api/public-profiles" && req.method === "GET") {
    const limit = Math.max(1, Math.min(24, Number(url.searchParams.get("limit") || 8)));
    const profiles = db.users
      .filter(u => u.role === "user" && u.status === "active" && u.profile?.approved)
      .map(publicProfile)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
    return json(res, 200, { profiles });
  }

  if (pathname === "/api/config" && req.method === "GET") {
    return json(res, 200, { googleClientId: GOOGLE_CLIENT_ID });
  }

  if (pathname === "/api/auth/google" && req.method === "POST") {
    if (!GOOGLE_CLIENT_ID) {
      return json(res, 503, { error: "Google sign-in is not configured. Add GOOGLE_CLIENT_ID to the server environment first." });
    }
    const body = await parseBody(req);
    const credential = String(body.credential || "");
    if (!credential) return json(res, 400, { error: "Missing Google credential." });
    try {
      const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      const r = await fetch(verifyUrl);
      if (!r.ok) return json(res, 401, { error: "Google sign-in could not be verified." });
      const claims = await r.json();
      if (String(claims.aud || "") !== GOOGLE_CLIENT_ID) return json(res, 401, { error: "Google client ID does not match this site." });
      const issuer = String(claims.iss || "");
      if (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") return json(res, 401, { error: "Invalid Google token issuer." });
      if (String(claims.email_verified || "").toLowerCase() !== "true") return json(res, 401, { error: "Your Google email is not verified." });
      const email = String(claims.email || "").trim().toLowerCase();
      if (!email) return json(res, 401, { error: "Google did not return an email address." });

      let user = db.users.find(u => u.googleSub === claims.sub);
      if (!user) user = db.users.find(u => u.email.toLowerCase() === email);
      if (user) {
        user.googleSub = claims.sub;
        user.googleName = claims.name || user.name;
      } else {
        user = {
          id: crypto.randomUUID(),
          email,
          passwordHash: "",
          name: String(claims.name || email.split("@")[0]).trim().slice(0, 80),
          role: "user",
          provider: "google",
          googleSub: claims.sub,
          createdAt: new Date().toISOString(),
          status: "active",
          profile: {
            gender: "",
            dob: "",
            height: "",
            religion: "",
            community: "",
            motherTongue: "",
            education: "",
            occupation: "",
            city: "",
            state: "",
            country: "India",
            about: "",
            photo: claims.picture || "",
            interests: [],
            preference: { gender: "", minAge: 22, maxAge: 35, location: "Anywhere" },
            approved: false
          }
        };
        db.users.push(user);
      }
      saveDb();
      const token = createSession(user.id);
      return json(res, 200, { user: publicUser(user) }, {
        "Set-Cookie": `soulmate_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
      });
    } catch (err) {
      console.error("Google sign-in error:", err);
      return json(res, 502, { error: "Google sign-in is temporarily unavailable." });
    }
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await parseBody(req);
    const normalized = String(body.email || "").trim().toLowerCase();
    const user = db.users.find(u => u.email.toLowerCase() === normalized);
    if (!user || !(await verifyPassword(String(body.password || ""), user.passwordHash))) {
      return json(res, 401, { error: "Invalid email or password." });
    }
    if (user.status === "blocked") return json(res, 403, { error: "This account has been blocked." });
    const token = createSession(user.id);
    return json(res, 200, { user: publicUser(user) }, {
      "Set-Cookie": `soulmate_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
    });
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    clearSession(req, res);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/me" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, { user: publicUser(user), profile: publicProfile(user) });
  }

  if (pathname === "/api/profile" && req.method === "PUT") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const p = user.profile || {};
    const next = {
      gender: body.gender ?? p.gender ?? "",
      dob: body.dob ?? p.dob ?? "",
      height: body.height ?? p.height ?? "",
      religion: body.religion ?? p.religion ?? "",
      community: body.community ?? p.community ?? "",
      motherTongue: body.motherTongue ?? p.motherTongue ?? "",
      education: body.education ?? p.education ?? "",
      occupation: body.occupation ?? p.occupation ?? "",
      city: body.city ?? p.city ?? "",
      state: body.state ?? p.state ?? "",
      country: body.country ?? p.country ?? "India",
      about: body.about ?? p.about ?? "",
      photo: body.photo ?? p.photo ?? "",
      interests: Array.isArray(body.interests) ? body.interests.slice(0, 10) : (p.interests || []),
      preference: {
        gender: body.preference?.gender ?? p.preference?.gender ?? "",
        minAge: Number(body.preference?.minAge ?? p.preference?.minAge ?? 18),
        maxAge: Number(body.preference?.maxAge ?? p.preference?.maxAge ?? 60),
        location: body.preference?.location ?? p.preference?.location ?? "Anywhere"
      },
      approved: false
    };
    user.profile = next;
    user.name = (body.name || user.name).trim().slice(0, 80);
    saveDb();
    return json(res, 200, { profile: publicProfile(user), user: publicUser(user), message: "Profile saved. It may need admin approval." });
  }

  if (pathname === "/api/profiles" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, { profiles: searchProfiles(user, url.searchParams) });
  }

  const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
  if (profileMatch && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    const target = db.users.find(u => u.id === profileMatch[1] && u.role === "user");
    if (!target || !target.profile || target.status !== "active") return json(res, 404, { error: "Profile not found." });
    if (!target.profile.approved && user.role !== "admin") return json(res, 404, { error: "Profile not available." });
    return json(res, 200, { profile: publicProfile(target), interest: matchStatus(user.id, target.id), canChat: canChat(user.id, target.id) });
  }

  if (pathname === "/api/favorites" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    const ids = db.favorites.filter(x => x.userId === user.id).map(x => x.targetId);
    const profiles = ids.map(id => db.users.find(u => u.id === id)).filter(Boolean).map(publicProfile).filter(Boolean);
    return json(res, 200, { profiles });
  }

  if (pathname === "/api/favorites" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const targetId = String(body.targetId || "");
    if (!db.users.some(u => u.id === targetId && u.role === "user")) return json(res, 404, { error: "Profile not found." });
    const exists = db.favorites.some(x => x.userId === user.id && x.targetId === targetId);
    if (exists) {
      db.favorites = db.favorites.filter(x => !(x.userId === user.id && x.targetId === targetId));
      saveDb();
      return json(res, 200, { favorited: false });
    }
    db.favorites.push({ userId: user.id, targetId, createdAt: new Date().toISOString() });
    saveDb();
    return json(res, 200, { favorited: true });
  }

  if (pathname === "/api/interests" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    const incoming = db.interests.filter(x => x.toId === user.id).map(x => ({ ...x, from: db.users.find(u => u.id === x.fromId) })).filter(x => x.from).map(x => ({ id: x.id, status: x.status, createdAt: x.createdAt, direction: "incoming", profile: publicProfile(x.from) }));
    const outgoing = db.interests.filter(x => x.fromId === user.id).map(x => ({ ...x, to: db.users.find(u => u.id === x.toId) })).filter(x => x.to).map(x => ({ id: x.id, status: x.status, createdAt: x.createdAt, direction: "outgoing", profile: publicProfile(x.to) }));
    const matches = db.interests.filter(x => x.status === "accepted" && (x.fromId === user.id || x.toId === user.id)).map(x => {
      const other = db.users.find(u => u.id === (x.fromId === user.id ? x.toId : x.fromId));
      return other ? publicProfile(other) : null;
    }).filter(Boolean);
    return json(res, 200, { incoming, outgoing, matches });
  }

  if (pathname === "/api/interests" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const targetId = String(body.targetId || "");
    if (targetId === user.id) return json(res, 400, { error: "You cannot send an interest to yourself." });
    const target = db.users.find(u => u.id === targetId && u.role === "user");
    if (!target || !target.profile || !target.profile.approved || target.status !== "active") return json(res, 404, { error: "Profile not found." });
    if (isBlocked(user.id, targetId)) return json(res, 403, { error: "This profile is unavailable." });

    const existing = db.interests.find(x =>
      (x.fromId === user.id && x.toId === targetId) || (x.fromId === targetId && x.toId === user.id)
    );
    if (existing) return json(res, 200, { interest: existing, message: existing.status === "accepted" ? "Already matched ❤️" : "Interest already exists." });

    const item = { id: crypto.randomUUID(), fromId: user.id, toId: targetId, status: "pending", createdAt: new Date().toISOString() };
    db.interests.push(item);
    saveDb();
    return json(res, 201, { interest: item, message: "Interest sent 💌" });
  }

  const interestAction = pathname.match(/^\/api\/interests\/([^/]+)\/(accept|reject)$/);
  if (interestAction && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    const item = db.interests.find(x => x.id === interestAction[1] && x.toId === user.id);
    if (!item) return json(res, 404, { error: "Interest not found." });
    item.status = interestAction[2] === "accept" ? "accepted" : "rejected";
    saveDb();
    return json(res, 200, { interest: item, matched: item.status === "accepted", message: item.status === "accepted" ? "It's a match! ❤️" : "Interest declined." });
  }

  if (pathname === "/api/messages" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;
    const otherId = url.searchParams.get("with");
    if (!otherId) return json(res, 400, { error: "Missing with parameter." });
    if (!canChat(user.id, otherId)) return json(res, 403, { error: "Chat becomes available after a mutual match." });
    const messages = db.messages
      .filter(m => (m.fromId === user.id && m.toId === otherId) || (m.fromId === otherId && m.toId === user.id))
      .sort((a,b) => a.createdAt.localeCompare(b.createdAt))
      .map(m => ({ ...m, mine: m.fromId === user.id }));
    return json(res, 200, { messages });
  }

  if (pathname === "/api/messages" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const toId = String(body.toId || "");
    const message = String(body.message || "").trim().slice(0, 1000);
    if (!toId || !message) return json(res, 400, { error: "Recipient and message are required." });
    if (!canChat(user.id, toId)) return json(res, 403, { error: "Chat becomes available after a mutual match." });
    const item = { id: crypto.randomUUID(), fromId: user.id, toId, message, createdAt: new Date().toISOString() };
    db.messages.push(item);
    saveDb();
    return json(res, 201, { message: { ...item, mine: true } });
  }

  if (pathname === "/api/blocks" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const targetId = String(body.targetId || "");
    if (!db.blocks.some(x => x.userId === user.id && x.targetId === targetId)) {
      db.blocks.push({ id: crypto.randomUUID(), userId: user.id, targetId, createdAt: new Date().toISOString() });
      saveDb();
    }
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/reports" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const targetId = String(body.targetId || "");
    const reason = String(body.reason || "Other").slice(0, 200);
    db.reports.push({ id: crypto.randomUUID(), reporterId: user.id, targetId, reason, status: "open", createdAt: new Date().toISOString() });
    saveDb();
    return json(res, 201, { ok: true, message: "Report submitted." });
  }

  if (pathname === "/api/admin/overview" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return;
    return json(res, 200, {
      stats: {
        totalUsers: db.users.filter(u => u.role === "user").length,
        pendingProfiles: db.users.filter(u => u.role === "user" && u.profile && !u.profile.approved).length,
        activeUsers: db.users.filter(u => u.role === "user" && u.status === "active").length,
        reports: db.reports.filter(r => r.status === "open").length
      },
      users: db.users.filter(u => u.role === "user").map(publicUser),
      profiles: db.users.filter(u => u.role === "user" && u.profile).map(publicProfile),
      reports: db.reports.map(r => ({ ...r, reporter: db.users.find(u => u.id === r.reporterId)?.name || "Unknown", target: db.users.find(u => u.id === r.targetId)?.name || "Unknown" }))
    });
  }

  const adminProfile = pathname.match(/^\/api\/admin\/users\/([^/]+)\/(approve|block|unblock)$/);
  if (adminProfile && req.method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const target = db.users.find(u => u.id === adminProfile[1] && u.role === "user");
    if (!target) return json(res, 404, { error: "User not found." });
    const action = adminProfile[2];
    if (action === "approve" && target.profile) target.profile.approved = true;
    if (action === "block") target.status = "blocked";
    if (action === "unblock") target.status = "active";
    saveDb();
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "API route not found." });
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const candidate = path.normalize(path.join(PUBLIC, decoded));
  return candidate.startsWith(PUBLIC) ? candidate : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname, url);
    }

    if (pathname === "/") pathname = "/index.html";
    const filePath = safeStaticPath(pathname);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return text(res, 404, "Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "Unexpected server error." });
  }
});

seedPasswords()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`SoulMate running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Could not initialize accounts:", err);
    process.exit(1);
  });
