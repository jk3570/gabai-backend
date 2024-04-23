const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const userModel = require("../models/userModel");
const nodemailer = require("nodemailer");
const { baseURL } = require("./baseURL");

require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Define a middleware function to validate the email parameter
const validateEmail = (req, res, next) => {
  const { email } = req.body;

  // Check if the email parameter is present and is a valid email address
  if (!email || !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email)) {
    return res.status(400).send("Invalid email address");
  }

  // Call the next middleware function in the chain
  next();
};

// Add the middleware function to the /forgot-password route
router.post("/forgot-password", validateEmail, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await userModel.findOne({ email });

    console.log(email);

    if (!user) {
      return res.status(400).send("User not found");
    }

    // Generate a random token for the user
    const token = crypto.randomBytes(20).toString("hex");

    // Store the token in the database associated with the user's email
    // Set an expiration time for the token
    const userId = user._id; // Get the user ID here

    await userModel
      .findOneAndUpdate(
        { email },
        {
          $set: {
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 3600000, // Token expires in 1 hour
          },
        }
      )
      .then(() => console.log("Token saved to database"));

    // Send the email with the reset link
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset',
      html: `<p>Hi,</p><p>Please click <a href="${baseURL}/password-reset/${userId}">here</a> to reset your password.</p>`,
    };

    await transporter.sendMail(mailOptions);
    
    console.log("Email sent successfully");
    res.send("Reset password email sent");
  } catch (error) {
    console.log("Failed to send email:", error);
    res.status(500).send("Failed to send email");
  }
});

router.get("/find/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);

    if (!user) {
      return res.status(404).send("User not found");
    }

    res.send({ email: user.email });
  } catch (error) {
    console.error("Failed to fetch user email:", error);
    res.status(500).send("Failed to fetch user email");
  }
});

module.exports = router;
