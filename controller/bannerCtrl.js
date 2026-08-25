// controller/bannerCtrl.js
const BannerModel = require("../model/bannerModel");

// PUBLIC — the site-wide bottom banner fetches this on every page load.
exports.getActiveBanner = async (req, res) => {
  try {
    const banner = await BannerModel.findOne({ isActive: true, isDeleted: false }).lean();

    return res.status(200).json({
      success: true,
      data: banner || null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active banner",
      error: error.message,
    });
  }
};

// ADMIN — list every saved banner preset (active and inactive).
exports.fetchAllBanners = async (req, res) => {
  try {
    const banners = await BannerModel.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch banners",
      error: error.message,
    });
  }
};

// ADMIN — create a new banner preset.
exports.createBanner = async (req, res) => {
  try {
    const banner = await BannerModel.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Banner created successfully",
      data: banner,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to create banner",
      error: error.message,
    });
  }
};

// ADMIN — edit a banner preset's content.
exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    // isActive is only ever changed via setActiveBanner below, so a plain
    // content edit can never accidentally activate/deactivate a banner.
    const { isActive, ...content } = req.body;

    const updatedBanner = await BannerModel.findByIdAndUpdate(id, content, {
      new: true,
      runValidators: true,
    });

    if (!updatedBanner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Banner updated successfully",
      data: updatedBanner,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to update banner",
      error: error.message,
    });
  }
};

// ADMIN — make this banner the one shown on the live site, deactivating any other.
exports.setActiveBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await BannerModel.findOne({ _id: id, isDeleted: false });
    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    await BannerModel.updateMany({ _id: { $ne: id } }, { isActive: false });
    banner.isActive = true;
    await banner.save();

    return res.status(200).json({
      success: true,
      message: "Banner activated successfully",
      data: banner,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to activate banner",
      error: error.message,
    });
  }
};

// ADMIN — take the currently-active banner off the live site without deleting it.
exports.deactivateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await BannerModel.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Banner deactivated successfully",
      data: banner,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to deactivate banner",
      error: error.message,
    });
  }
};

// ADMIN — soft delete.
exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedBanner = await BannerModel.findByIdAndUpdate(
      id,
      { isDeleted: true, isActive: false },
      { new: true }
    );

    if (!deletedBanner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    return res.status(200).json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to delete banner",
      error: error.message,
    });
  }
};
