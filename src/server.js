import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import dotenv from "dotenv";
import cors from "cors";
import express, {} from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import mongoose from "mongoose";
import { imageUpload } from "./middleware/upload.js";
import { ConnectionModel, NotificationModel, PostModel, ProfileModel } from "./models.js";
import { uploadImage } from "./services/cloudinary.service.js";
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), override: true });
const app = express();
const port = Number(process.env.PORT ?? 5000);
const frontendOrigin = process.env.FRONTEND_URL ?? "http://localhost:3000";
const profiles = new Map();
const posts = [
    {
        id: "welcome-post",
        author: { uid: "asha-demo", name: "Asha Rao", email: null, headline: "Product designer building in public", bio: "Making small, useful things for people learning in public.", college: "", degree: "", skills: ["Product Design", "Figma", "Research"], interests: [], projects: [], avatarUrl: null },
        content: "What are you building this month? I am looking for one curious developer to turn a study-room idea into something real.",
        imageUrl: null,
        createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
        likedBy: [],
        comments: [],
    },
    {
        id: "climate-lab",
        author: { uid: "noah-demo", name: "Noah Kim", email: null, headline: "CS student · React + ML", bio: "Turning messy data into useful tools.", college: "", degree: "", skills: ["React", "Python", "Machine Learning"], interests: [], projects: [], avatarUrl: null },
        content: "I just opened two spots for a weekend climate-data lab. Looking for someone who likes maps, APIs, and asking better questions.",
        imageUrl: null,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        likedBy: [],
        comments: [],
    },
];
app.use(cors({ origin: frontendOrigin }));
app.use(express.json());
app.use(express.static(fileURLToPath(new URL("../../frontend", import.meta.url))));
app.get("/api/config", (_request, response) => {
    response.json({
        apiKey: process.env.FIREBASE_API_KEY ?? "",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? "",
        projectId: process.env.FIREBASE_PROJECT_ID ?? "",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? "",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? "",
        appId: process.env.FIREBASE_APP_ID ?? "",
    });
});
app.use(express.static(fileURLToPath(new URL("../../frontend", import.meta.url))));
app.get("/api/config", (_request, response) => {
    response.json({
        apiKey: process.env.FIREBASE_API_KEY ?? "",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? "",
        projectId: process.env.FIREBASE_PROJECT_ID ?? "",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? "",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? "",
        appId: process.env.FIREBASE_APP_ID ?? "",
    });
});
function getFirebaseAuth() {
    if (getApps().length === 0) {
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
        if (serviceAccountPath) {
            const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
            initializeApp({ credential: cert(serviceAccount) });
        }
        else if (projectId && clientEmail && privateKey) {
            initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
        }
        else {
            throw new Error("Firebase Admin environment variables are missing");
        }
    }
    return getAuth();
}
async function requireAuth(request, response, next) {
    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) {
        response.status(401).json({ error: "Missing bearer token" });
        return;
    }
    try {
        const user = await getFirebaseAuth().verifyIdToken(token);
        response.locals.user = user;
        next();
    }
    catch (error) {
        if (error instanceof Error && error.message === "Firebase Admin environment variables are missing") {
            response.status(503).json({ error: "Firebase Admin credentials are not configured" });
            return;
        }
        response.status(401).json({ error: "Invalid or expired token" });
    }
}
app.get("/api/health", (_request, response) => {
    response.json({ ok: true, database: databaseReady ? "connected" : databaseError ? "connection-failed" : "not-configured" });
});
app.get("/api/me", requireAuth, (_request, response) => {
    const user = response.locals.user;
    const profile = getProfile(user);
    response.json(profile);
});
function getProfile(user) {
    const existing = profiles.get(user.uid);
    if (existing)
        return existing;
    const profile = {
        uid: user.uid,
        name: user.name ?? user.email?.split("@")[0] ?? "SkillCircle member",
        email: user.email ?? null,
        headline: "New builder at SkillCircle",
        bio: "Tell the circle what you are learning and making.",
        college: "",
        degree: "",
        skills: [],
        interests: [],
        projects: [],
        avatarUrl: null,
    };
    profiles.set(user.uid, profile);
    return profile;
}
let databaseReady = false;
let databaseError = false;
const databaseConfigured = Boolean(process.env.MONGODB_URI?.trim());
const databaseStartup = process.env.MONGODB_URI
    ? mongoose.connect(process.env.MONGODB_URI).then(async () => {
        databaseReady = true;
        if (await PostModel.countDocuments() === 0)
            await PostModel.insertMany(posts);
        console.log("MongoDB connected");
    }).catch((error) => {
        databaseError = true;
        console.error("MongoDB connection failed; using memory fallback", error);
    })
    : Promise.resolve();
function requireDatabase(_request, response, next) {
    if (!databaseConfigured) {
        response.status(503).json({ error: "MongoDB is not configured. Add MONGODB_URI to backend/.env" });
        return;
    }
    if (!databaseReady) {
        response.status(503).json({ error: "MongoDB is not connected. Check the URI, password, and Atlas network access." });
        return;
    }
    next();
}
async function getStoredProfile(user) {
    await databaseStartup;
    if (!databaseReady)
        return getProfile(user);
    const profile = await ProfileModel.findOneAndUpdate({ uid: user.uid }, { $setOnInsert: getProfile(user) }, { new: true, upsert: true, lean: true });
    return profile;
}
app.get("/api/feed", requireAuth, requireDatabase, async (_request, response) => {
    const user = response.locals.user;
    await databaseStartup;
    const profile = await getStoredProfile(user);
    const feedPosts = databaseReady ? await PostModel.find().sort({ createdAt: -1 }).lean() : posts;
    response.json({ posts: feedPosts, profile });
});
app.post("/api/posts", requireAuth, requireDatabase, imageUpload.single("image"), async (request, response) => {
    const user = response.locals.user;
    const content = typeof request.body?.content === "string" ? request.body.content.trim() : "";
    if (!content || content.length > 1000) {
        response.status(400).json({ error: "Post must be between 1 and 1000 characters" });
        return;
    }
    let imageUrl = null;
    if (request.file) {
        try {
            imageUrl = (await uploadImage(request.file.buffer, "posts")).secure_url;
        }
        catch {
            response.status(503).json({ error: "Image upload is not configured" });
            return;
        }
    }
    const post = { id: randomUUID(), author: await getStoredProfile(user), content, imageUrl, createdAt: new Date().toISOString(), likedBy: [], comments: [] };
    await databaseStartup;
    if (databaseReady) {
        const saved = new PostModel(post);
        await saved.save();
        response.status(201).json(saved.toObject());
        return;
    }
    posts.unshift(post);
    response.status(201).json(post);
});
app.post("/api/posts/:postId/like", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    await databaseStartup;
    if (databaseReady) {
        const storedPost = await PostModel.findOne({ id: request.params.postId });
        if (!storedPost) {
            response.status(404).json({ error: "Post not found" });
            return;
        }
        const storedIndex = storedPost.likedBy.indexOf(user.uid);
        if (storedIndex === -1)
            storedPost.likedBy.push(user.uid);
        else
            storedPost.likedBy.splice(storedIndex, 1);
        await storedPost.save();
        response.json({ liked: storedIndex === -1, likes: storedPost.likedBy.length });
        return;
    }
    const post = posts.find((item) => item.id === request.params.postId);
    if (!post) {
        response.status(404).json({ error: "Post not found" });
        return;
    }
    const index = post.likedBy.indexOf(user.uid);
    if (index === -1)
        post.likedBy.push(user.uid);
    else
        post.likedBy.splice(index, 1);
    response.json({ liked: index === -1, likes: post.likedBy.length });
});
app.post("/api/posts/:postId/comments", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    await databaseStartup;
    const post = posts.find((item) => item.id === request.params.postId);
    const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
    if (!databaseReady && !post) {
        response.status(404).json({ error: "Post not found" });
        return;
    }
    if (!text || text.length > 500) {
        response.status(400).json({ error: "Comment must be between 1 and 500 characters" });
        return;
    }
    const comment = { id: randomUUID(), author: await getStoredProfile(user), text, createdAt: new Date().toISOString() };
    if (databaseReady) {
        const storedPost = await PostModel.findOne({ id: request.params.postId });
        if (!storedPost) {
            response.status(404).json({ error: "Post not found" });
            return;
        }
        storedPost.comments.push(comment);
        await storedPost.save();
        response.status(201).json(comment);
        return;
    }
    if (!post) {
        response.status(404).json({ error: "Post not found" });
        return;
    }
    post.comments.push(comment);
    response.status(201).json(comment);
});
app.put("/api/profile", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    const profile = await getStoredProfile(user);
    const body = request.body ?? {};
    if (typeof body.name === "string" && body.name.trim())
        profile.name = body.name.trim().slice(0, 80);
    if (typeof body.headline === "string")
        profile.headline = body.headline.trim().slice(0, 120);
    if (typeof body.bio === "string")
        profile.bio = body.bio.trim().slice(0, 500);
    if (typeof body.college === "string")
        profile.college = body.college.trim().slice(0, 120);
    if (typeof body.degree === "string")
        profile.degree = body.degree.trim().slice(0, 120);
    if (Array.isArray(body.skills))
        profile.skills = body.skills.filter((skill) => typeof skill === "string").map((skill) => skill.trim()).filter(Boolean).slice(0, 12);
    if (Array.isArray(body.interests))
        profile.interests = body.interests.filter((interest) => typeof interest === "string").map((interest) => interest.trim()).filter(Boolean).slice(0, 12);
    if (Array.isArray(body.projects))
        profile.projects = body.projects.filter((project) => typeof project === "string").map((project) => project.trim()).filter(Boolean).slice(0, 12);
    if (databaseReady)
        await ProfileModel.updateOne({ uid: profile.uid }, { $set: profile });
    response.json(profile);
});
app.post("/api/profile/avatar", requireAuth, requireDatabase, imageUpload.single("image"), async (request, response) => {
    const user = response.locals.user;
    if (!request.file) {
        response.status(400).json({ error: "An image is required" });
        return;
    }
    try {
        const image = await uploadImage(request.file.buffer, "avatars");
        const profile = await getStoredProfile(user);
        profile.avatarUrl = image.secure_url;
        if (databaseReady)
            await ProfileModel.updateOne({ uid: profile.uid }, { $set: { avatarUrl: profile.avatarUrl } });
        response.json({ avatarUrl: profile.avatarUrl });
    }
    catch {
        response.status(503).json({ error: "Image upload is not configured" });
    }
});
app.listen(port, () => {
    console.log(`SkillCircle API listening on http://localhost:${port}`);
});
app.get("/api/discover", requireAuth, requireDatabase, async (request, response) => {
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    const profiles = await ProfileModel.find(query ? { $or: [
            { name: { $regex: query, $options: "i" } }, { college: { $regex: query, $options: "i" } },
            { skills: { $regex: query, $options: "i" } }, { interests: { $regex: query, $options: "i" } },
        ] } : {}).limit(30).lean();
    response.json(profiles);
});
app.post("/api/connections/:uid", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    if (user.uid === request.params.uid) {
        response.status(400).json({ error: "You cannot connect with yourself" });
        return;
    }
    const existing = await ConnectionModel.findOne({ $or: [{ requesterUid: user.uid, recipientUid: request.params.uid }, { requesterUid: request.params.uid, recipientUid: user.uid }] });
    if (existing) {
        response.status(409).json({ error: "A connection already exists" });
        return;
    }
    const connection = await ConnectionModel.create({ id: randomUUID(), requesterUid: user.uid, recipientUid: request.params.uid, status: "pending", createdAt: new Date().toISOString() });
    await NotificationModel.create({ id: randomUUID(), recipientUid: request.params.uid, type: "connection-request", message: `${(await getStoredProfile(user)).name} sent you a connection request.`, createdAt: new Date().toISOString() });
    response.status(201).json(connection.toObject());
});
app.patch("/api/connections/:id", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    const connection = await ConnectionModel.findOne({ id: request.params.id });
    if (!connection || connection.recipientUid !== user.uid) {
        response.status(404).json({ error: "Connection request not found" });
        return;
    }
    if (!["accepted", "rejected"].includes(request.body?.status)) {
        response.status(400).json({ error: "Status must be accepted or rejected" });
        return;
    }
    connection.status = request.body.status;
    await connection.save();
    await NotificationModel.create({ id: randomUUID(), recipientUid: connection.requesterUid, type: `connection-${connection.status}`, message: `${(await getStoredProfile(user)).name} ${connection.status} your connection request.`, createdAt: new Date().toISOString() });
    response.json(connection.toObject());
});
app.delete("/api/connections/:id", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    const deleted = await ConnectionModel.findOneAndDelete({ id: request.params.id, $or: [{ requesterUid: user.uid }, { recipientUid: user.uid }] });
    if (!deleted) {
        response.status(404).json({ error: "Connection not found" });
        return;
    }
    response.status(204).end();
});
app.post("/api/profile/suggest-bio", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    const profile = await getStoredProfile(user);
    if (!process.env.GROQ_API_KEY) {
        response.status(503).json({ error: "GROQ_API_KEY is not configured" });
        return;
    }
    const prompt = `Write a concise, professional student networking bio for ${profile.name}. College: ${profile.college}. Degree: ${profile.degree}. Skills: ${profile.skills.join(", ")}. Interests: ${profile.interests.join(", ")}. Projects: ${profile.projects.join(", ")}. Return only the bio, under 500 characters.`;
    try {
        const result = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 160 }) });
        if (!result.ok)
            throw new Error("Groq request failed");
        const body = await result.json();
        const bio = body.choices?.[0]?.message?.content?.trim();
        if (!bio)
            throw new Error("Groq returned no bio");
        response.json({ bio: bio.slice(0, 500) });
    }
    catch {
        response.status(503).json({ error: "Could not generate a bio right now" });
    }
});
app.get("/api/notifications", requireAuth, requireDatabase, async (request, response) => {
    const user = response.locals.user;
    response.json(await NotificationModel.find({ recipientUid: user.uid }).sort({ createdAt: -1 }).limit(50).lean());
});
//# sourceMappingURL=server.js.map