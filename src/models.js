import mongoose, {} from "mongoose";
const { Schema, model, models } = mongoose;
const profileSchema = new Schema({
    uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, default: null },
    headline: { type: String, default: "New builder at SkillCircle" },
    bio: { type: String, default: "Tell the circle what you are learning and making." },
    college: { type: String, default: "" },
    degree: { type: String, default: "" },
    skills: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    projects: { type: [String], default: [] },
    avatarUrl: { type: String, default: null },
});
const commentSchema = new Schema({
    id: { type: String, required: true },
    author: { type: Object, required: true },
    text: { type: String, required: true },
    createdAt: { type: String, required: true },
}, { _id: false });
const postSchema = new Schema({
    id: { type: String, required: true, unique: true },
    author: { type: Object, required: true },
    content: { type: String, required: true },
    imageUrl: { type: String, default: null },
    createdAt: { type: String, required: true },
    likedBy: { type: [String], default: [] },
    comments: { type: [Schema.Types.Mixed], default: [] },
});
const connectionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    requesterUid: { type: String, required: true },
    recipientUid: { type: String, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], required: true },
    createdAt: { type: String, required: true },
}, { _id: false });
const notificationSchema = new Schema({
    id: { type: String, required: true, unique: true },
    recipientUid: { type: String, required: true, index: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: String, required: true },
}, { _id: false });
export const ProfileModel = models.Profile ?? model("Profile", profileSchema);
export const PostModel = models.Post ?? model("Post", postSchema);
export const ConnectionModel = models.Connection ?? model("Connection", connectionSchema);
export const NotificationModel = models.Notification ?? model("Notification", notificationSchema);
//# sourceMappingURL=models.js.map