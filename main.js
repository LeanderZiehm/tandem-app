const express = require('express');
const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const path = require('path');



const app = express();
app.use(express.json()); // to parse JSON bodies

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB setup
const client = new MongoClient(process.env.MONGO_URI);
let usersCollection;
let codesCollection;

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        const db = client.db("tandemDB");
        usersCollection = db.collection('users');
        codesCollection = db.collection('verificationCodes');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}
connectDB();

// Endpoint for Sign Up (Step 1)
app.post('/signup', async (req, res) => {
    const { firstName, lastName, email, deviceHash } = req.body;

    if (!email || !deviceHash || !firstName || !lastName) {
        return res.status(400).json({ message: 'First name, last name, email, and device hash are required' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        await usersCollection.updateOne(
            { email },
            { $set: { firstName, lastName, deviceHash } },
            { upsert: true }
        );

        await codesCollection.updateOne(
            { email },
            { $set: { code: verificationCode } },
            { upsert: true }
        );

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verification Code',
            text: `Your verification code is: ${verificationCode}`
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'Verification code sent' });

    } catch (error) {
        console.error('Error in /signup:', error);
        res.status(500).json({ message: 'Error sending verification code' });
    }
});


// Endpoint for Verify (Step 2)
app.post('/verify', async (req, res) => {
    const { verificationCode, deviceHash } = req.body;

    if (!verificationCode || !deviceHash) {
        return res.status(400).json({ message: 'Verification code and device hash are required' });
    }

    try {
        const codeEntry = await codesCollection.findOne({ code: verificationCode });

        if (!codeEntry) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        const user = await usersCollection.findOne({ email: codeEntry.email });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        if (user.deviceHash === deviceHash) {
            // Successful login
            const userInfo = {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email
            };
            return res.status(200).json({ message: 'Verification successful, signed in', user: userInfo });
        } else {
            return res.status(400).json({ message: 'Device hash does not match' });
        }

    } catch (error) {
        console.error('Error in /verify:', error);
        res.status(500).json({ message: 'Error during verification' });
    }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
