// import modules
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Import the cors module
const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/chat');
const OpenAI = require('openai');
require('dotenv').config();
const path = require('path');

const port = process.env.PORT || 4000;

// express app
const app = express();

// middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend/build')));

// routes
app.use('/gab', chatRoutes);
app.use('/user', userRoutes);


// Wildcard route to serve the index.html file for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// connect to db
mongoose
  .connect(process.env.MONG_URI)
  .then(() => {
    // listen for requests
    app.listen(port, () => {
      console.log(
        'Connected to Database (MongoDB Atlas) & listening on Port: ',
        port
      );
    });
  })
  .catch((error) => {
    console.log(error);
  });

module.exports = app;
