// model/bannerModel.js
const mongoose = require("mongoose");

const { Schema } = mongoose;

const bannerSchema = new Schema(
  {
    // Internal label only, shown in the admin list — never rendered on the site.
    title: { type: String, trim: true, required: true },

    // Each string is one message shown in the scrolling strip, separated by
    // the link + a red bullet, mirroring the site's current banner format.
    messages: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length > 0 && arr.every((m) => m.trim().length > 0),
        message: "At least one non-empty message is required",
      },
    },

    linkUrl: { type: String, trim: true, default: "/contact" },
    linkText: { type: String, trim: true, default: "www.shubukanindia.org/contact" },

    // Only one banner is ever shown on the live site at a time.
    isActive: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);
