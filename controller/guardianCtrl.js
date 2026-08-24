// controller/guardianCtrl.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const GuardianModel = require("../model/guardianModel");
const { sendEmail } = require("../util/sendEmail");
const { guardianOtpEmailTemplate } = require("../util/emailTemplate");

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const issueOtp = async (guardian, subject) => {
  guardian.otp = genOtp();
  guardian.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await guardian.save();
  await sendEmail(guardian.email, subject, guardianOtpEmailTemplate(guardian.otp));
};

// Signup: email + password, sends OTP for verification
exports.signupGuardian = async (req, res) => {
  try {
    const { name, email, password, mobile } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await GuardianModel.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const guardian = await GuardianModel.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      mobile,
      isVerified: false,
    });

    await issueOtp(guardian, "Verify your email - Shubukan India Guardian Portal");

    return res.status(201).json({ message: "Guardian registered. OTP sent to email." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.verifyGuardianOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

    const guardian = await GuardianModel.findOne({ email: email.toLowerCase(), isDeleted: false });
    if (!guardian) return res.status(404).json({ message: "Guardian not found" });

    if (!guardian.otp || !guardian.otpExpiresAt) {
      return res.status(400).json({ message: "No OTP sent" });
    }
    if (Date.now() > new Date(guardian.otpExpiresAt).getTime()) {
      return res.status(400).json({ message: "OTP expired" });
    }
    if (guardian.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    guardian.otp = undefined;
    guardian.otpExpiresAt = undefined;
    guardian.isVerified = true;
    await guardian.save();

    const token = jwt.sign({ id: guardian._id, email: guardian.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({ message: "OTP verified", token });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.resendGuardianOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const guardian = await GuardianModel.findOne({ email: email.toLowerCase(), isDeleted: false });
    if (!guardian) return res.status(404).json({ message: "Guardian not found" });

    await issueOtp(guardian, "OTP - Shubukan India Guardian Portal");
    return res.json({ message: "OTP resent to email" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Login: verified guardians only, email + password
exports.loginGuardian = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const guardian = await GuardianModel.findOne({ email: email.toLowerCase(), isDeleted: false });
    if (!guardian) return res.status(404).json({ message: "Guardian not found" });

    if (!guardian.isVerified) {
      // Re-send OTP so the guardian can complete verification
      await issueOtp(guardian, "Verify your email - Shubukan India Guardian Portal");
      return res.status(403).json({ message: "Email not verified. OTP resent to email." });
    }

    const match = await bcrypt.compare(password, guardian.password);
    if (!match) return res.status(401).json({ message: "Incorrect password" });

    const token = jwt.sign({ id: guardian._id, email: guardian.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({ message: "Login successful", token });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getGuardianProfile = async (req, res) => {
  try {
    const guardian = await GuardianModel.findById(req.guardian._id).select(
      "-__v -password -otp -otpExpiresAt"
    );
    if (!guardian) return res.status(404).json({ message: "Guardian not found" });
    return res.json(guardian);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateGuardianProfile = async (req, res) => {
  try {
    const { name, mobile } = req.body;
    const updated = await GuardianModel.findByIdAndUpdate(
      req.guardian._id,
      { name, mobile },
      { new: true, runValidators: true }
    ).select("-__v -password -otp -otpExpiresAt");
    if (!updated) return res.status(404).json({ message: "Guardian not found" });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

