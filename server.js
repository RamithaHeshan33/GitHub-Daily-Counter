require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const connectMongo = require('./connectMongo'); // <= new import

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve index.html at the root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Simple rate limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute

const rateLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, { count: 1, timestamp: now });
        return next();
    }

    const userData = rateLimit.get(ip);
    if (now - userData.timestamp > RATE_LIMIT_WINDOW) {
        rateLimit.set(ip, { count: 1, timestamp: now });
        return next();
    }

    if (userData.count >= MAX_REQUESTS) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    userData.count++;
    next();
};

// View Counter Schema
const viewCounterSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now },
    uniqueVisitors: { type: Number, default: 0 },
    views: [{
        timestamp: { type: Date, default: Date.now },
        ip: String
    }]
});

const ViewCounter = mongoose.models.ViewCounter || mongoose.model('ViewCounter', viewCounterSchema); 
// important fix for Vercel (model redefinition issue)

// Helper function to check if GitHub user exists
async function githubUserExists(username) {
    const response = await fetch(`https://api.github.com/users/${username}`);
    return response.status === 200;
}

// Routes
app.get('/api/counter/:username', async (req, res) => {
    try {
        await connectMongo(); // Connect to MongoDB

        const { username } = req.params;
        const exists = await githubUserExists(username);
        if (!exists) {
            return res.status(404).json({ error: 'Cannot find a GitHub account with your username' });
        }
        let counter = await ViewCounter.findOne({ username });

        if (!counter) {
            counter = new ViewCounter({ username });
            await counter.save();
        }

        // Reset if 24 hours passed
        const now = new Date();
        const lastReset = new Date(counter.lastReset);
        const hoursDiff = (now - lastReset) / (1000 * 60 * 60);

        if (hoursDiff >= 24) {
            counter.count = 0;
            counter.lastReset = now;
            counter.views = [];
            counter.uniqueVisitors = 0;
            await counter.save();
        }

        res.json({
            count: counter.count,
            uniqueVisitors: counter.uniqueVisitors
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/counter/:username/increment', rateLimiter, async (req, res) => {
    try {
        await connectMongo(); // Connect to MongoDB

        const { username } = req.params;
        let counter = await ViewCounter.findOne({ username });

        if (!counter) {
            counter = new ViewCounter({ username });
        }

        // Reset if 24 hours passed
        const now = new Date();
        const lastReset = new Date(counter.lastReset);
        const hoursDiff = (now - lastReset) / (1000 * 60 * 60);

        if (hoursDiff >= 24) {
            counter.count = 0;
            counter.lastReset = now;
            counter.views = [];
            counter.uniqueVisitors = 0;
        }

        // Unique visitor check
        const isUniqueVisitor = !counter.views.some(view => view.ip === req.ip);
        if (isUniqueVisitor) {
            counter.uniqueVisitors += 1;
        }

        counter.views.push({
            timestamp: now,
            ip: req.ip
        });

        counter.count += 1;
        await counter.save();

        res.json({
            count: counter.count,
            uniqueVisitors: counter.uniqueVisitors
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/counter/:username/image', async (req, res) => {
    try {
        await connectMongo(); // Connect to MongoDB

        const { username } = req.params;
        const exists = await githubUserExists(username);
        if (!exists) {
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="350" height="20" viewBox="0 0 350 20">
                    <rect width="350" height="20" fill="#b60e0e" rx="3"/>
                    <text x="175" y="14" font-family="Arial" font-size="12" fill="white" text-anchor="middle">
                        Cannot find a GitHub account with your username
                    </text>
                </svg>
            `;
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.send(svg);
        }

        let counter = await ViewCounter.findOne({ username });

        if (!counter) {
            counter = new ViewCounter({ username });
        }

        // Reset if 24 hours passed
        const now = new Date();
        const lastReset = new Date(counter.lastReset);
        const hoursDiff = (now - lastReset) / (1000 * 60 * 60);

        if (hoursDiff >= 24) {
            counter.count = 0;
            counter.lastReset = now;
            counter.views = [];
            counter.uniqueVisitors = 0;
        }

        const isUniqueVisitor = !counter.views.some(view => view.ip === req.ip);
        if (isUniqueVisitor) {
            counter.uniqueVisitors += 1;
        }

        counter.views.push({
            timestamp: now,
            ip: req.ip
        });

        counter.count += 1;
        await counter.save();

        // SVG Output
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="150" height="20" viewBox="0 0 150 20">
                <rect width="150" height="20" fill="#0e75b6" rx="3"/>
                <text x="75" y="14" font-family="Arial" font-size="12" fill="white" text-anchor="middle">
                    Profile views: ${counter.count}
                </text>
            </svg>
        `;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
