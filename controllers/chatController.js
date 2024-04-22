const Chat = require('../models/chatModel');
const RandomForestClassifier = require('ml-random-forest').RandomForestClassifier;
const fs = require('fs');
const path = require('path');
const natural = require('natural');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');

dotenv.config();

// Initialize OpenAI API
const openai = new OpenAI(process.env.OPENAI_API_KEY);

let conversationHistory = []; // Moved the conversation history outside the function scope
let randomForestModel;
let uniqueLabels; // Define uniqueLabels globally
let encodedLabels; // Define encodedLabels globally
let dataset; // Declare dataset globally
let features; // Declare features globally
let labels; // Declare labels globally
let tfidfFeatures; // Define tfidfFeatures globally
let summary = ''; // Initialize the summary variable

// Path to the training data JSON file
const trainingDataPath = path.join(__dirname, 'WorkplaceDiscriminationDataset.json');

// Load the training data from the JSON file
let rawData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf-8'));

// Restructure the dataset to have each data point as [input, label]
dataset = rawData[0].map((input, index) => [input, rawData[1][index]]);

// Separate input features and labels
features = dataset.map(([input]) => input);
labels = dataset.map(([, label]) => label);

// Initialize a TF-IDF vectorizer
const tfidf = new natural.TfIdf();

// Add documents to the vectorizer
features.forEach((document) => {
    tfidf.addDocument(document);
});

// Function to evaluate the model on the training data
const evaluateModel = () => {
    const predictions = randomForestModel.predict(tfidfFeatures);
    const correctPredictions = predictions.filter((prediction, index) => prediction === encodedLabels[index]);
    const accuracy = correctPredictions.length / predictions.length;
    console.log('Model Evaluation - Accuracy:', accuracy);
};

// Function to update the dataset and retrain the model
const updateDatasetAndModel = () => {
    // Check dataset balance before training
    checkDatasetBalance();

    // Transform the features into TF-IDF vectors
    tfidfFeatures = features.map((document) => {
        const terms = tfidf.listTerms(document).map(term => term.term);
        const tfidfVector = [];
        terms.forEach(term => {
            tfidfVector.push(tfidf.tfidf(term, document));
        });
        return tfidfVector;
    });

    // Encode labels as categorical variables
    uniqueLabels = [...new Set(labels)];
    encodedLabels = labels.map(label => uniqueLabels.indexOf(label));

    // Train the random forest model
    try {
        randomForestModel = new RandomForestClassifier();
        randomForestModel.train(tfidfFeatures, encodedLabels);
        console.log('Random Forest model trained successfully.');
        // Evaluate the model on the training data
        evaluateModel();
    } catch (error) {
        console.error('Error training Random Forest model:', error);
    }
};

// Function to append new data point to the dataset and update the model
const appendToDatasetAndModel = (input, label) => {
    let matchedLabel = label; // Initialize matched label as the provided label

    // Check if the provided label matches one of the unique labels
    if (!uniqueLabels.includes(label)) {
        // Find the closest matching label from the unique labels
        const closestLabel = natural.JaroWinklerDistance(label, uniqueLabels[0]) > 0.8 ? uniqueLabels[0] : uniqueLabels[1];
        console.warn(`Provided label '${label}' not found in unique labels. Using closest match: '${closestLabel}'`);
        matchedLabel = closestLabel;
    }

    // Append the new data point to the dataset
    dataset.push([input, matchedLabel]);

    // Update the features and labels arrays
    features.push(input);
    labels.push(matchedLabel);

    // Update the training data file
    fs.writeFileSync(trainingDataPath, JSON.stringify([features, labels], null, 2));

    // Retrain the model with the updated dataset
    updateDatasetAndModel();
};

// Function to check the balance of discrimination types in the dataset
const checkDatasetBalance = () => {
    const labelCounts = {};
    labels.forEach(label => {
        labelCounts[label] = (labelCounts[label] || 0) + 1;
    });
    console.log('Dataset Balance:', labelCounts);

    // Check if dataset is imbalanced
    const minLabelCount = Math.min(...Object.values(labelCounts));
    const maxLabelCount = Math.max(...Object.values(labelCounts));
    const imbalanceThreshold = 0.2; // Set a threshold for dataset imbalance (e.g., 20%)

    if ((maxLabelCount - minLabelCount) / dataset.length > imbalanceThreshold) {
        console.warn('Warning: Dataset is imbalanced.');

        // Calculate the desired number of samples per class
        const desiredSampleCount = Math.ceil((maxLabelCount + minLabelCount) / 2);

        // Perform oversampling by duplicating samples in minority classes
        const balancedDataset = [];
        const labelSamples = {};
        dataset.forEach(([input, label]) => {
            balancedDataset.push([input, label]);
            labelSamples[label] = (labelSamples[label] || 0) + 1;
            if (labelSamples[label] < desiredSampleCount && labelCounts[label] < maxLabelCount) {
                balancedDataset.push([input, label]);
                labelSamples[label] = (labelSamples[label] || 0) + 1;
            }
        });

        // Update the dataset with the balanced dataset
        dataset = balancedDataset;
        features = dataset.map(([input]) => input);
        labels = dataset.map(([, label]) => label);

        console.log('Balanced Dataset Size:', balancedDataset.length);
    }
};

const makeChat = async (req, res) => {
    const { input, conversationId, userid } = req.body;
    console.log('Request Body:', req.body); // Log the entire request body

    try {
        if (!input || typeof input !== 'string' || input.trim() === '') {
            return res.status(400).json({ error: "Invalid input. 'input' must be a non-empty string." });
        }

        let conversation;
        if (conversationId) {
            conversation = await Chat.findById(conversationId);
        } else {
            conversation = new Chat();
            conversation.title = input;
        }

        if (!conversationId) {
            // Only clear conversation history if it's a new conversation
            conversationHistory = [];
            summary = ''; // Reset summary for new conversation
        }

        console.log(`User: ${input}`);
        conversationHistory.push({ role: 'user', content: input });

        // Transform the input into TF-IDF vector
        const terms = tfidf.listTerms(input).map(term => term.term);
        const inputVector = {};
        terms.forEach(term => {
            inputVector[term] = tfidf.tfidf(term, input);
        });

        if (!randomForestModel) {
            console.log('Random Forest model not trained yet. Training...');
            updateDatasetAndModel(); // Retrain the model
        }

        if (!randomForestModel) {
            console.error('Error: Random Forest model is still not available after training.');
            return res.status(500).send('Error: Random Forest model is still not available after training.');
        }

        // Predict the type of discrimination
        const predictionIndex = randomForestModel.predict([Object.values(inputVector)])[0];
        const predictedLabel = uniqueLabels[predictionIndex];
        const discriminationType = rawData[1][predictionIndex]; // Extract discrimination type from dataset

        console.log(`Predicted Label Index: ${predictionIndex}`);
        console.log(`Predicted Label: ${predictedLabel}`);
        console.log(`Discrimination Type: ${discriminationType}`);

        // Update the dataset and model with the user input and predicted label
        appendToDatasetAndModel(input, discriminationType);

        // Set the userid for the conversation
        conversation.userid = userid;

        const response = await openai.chat.completions.create({
            model: 'ft:gpt-3.5-turbo-0125:personal::94FoHzEH',
            messages: [
                {
                    role: 'system',
                    content: process.env.SYSTEM_CONTENT
                },
                ...conversationHistory.map(({ role, content }) => ({ role, content }))
            ],
            temperature: 0.5,
            max_tokens: 1000,
            top_p: 0.8,
            frequency_penalty: 0.5,
            presence_penalty: 0.5,
        });

        console.log(`AI: ${response.choices[0].message.content}`);

        // Extract the summary from the AI response if the relevant prompt is found
        const relevantPrompt = 'Thank you for confirming. You can now request a video conference with a lawyer by clicking the Request a Video Conference button below.';
        const summaryIndex = response.choices[0].message.content.indexOf(relevantPrompt);
        if (summaryIndex !== -1) {
            summary = response.choices[0].message.content.substring(summaryIndex + relevantPrompt.length).trim();
            console.log(`Summary: ${summary}`); // Log the summary
        }

        conversationHistory.push({ role: 'assistant', content: response.choices[0].message.content });

        conversation.messages = conversationHistory;

        await conversation.save();

        const responseMessage = response.choices[0].message.content;

        res.json({ message: responseMessage, conversationId: conversation._id, summary });
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).send('Error processing request');
    }
<<<<<<< HEAD
=======

    let conversation;
    if (conversationId) {
      conversation = await Chat.findById(conversationId);
    } else {
      conversation = new Chat();
      conversation.title = input;
    }

    if (!conversationId) {
      conversationHistory = [];
    }

    console.log(`User: ${input}`);
    conversationHistory.push({ role: 'user', content: input });

    const response = await openai.chat.completions.create({
      model: 'ft:gpt-3.5-turbo-0125:personal::94FoHzEH',
      messages: [
        {
          role: 'system',
          content:  "Your name is Gab, you are an online AI Assistant against workplace discrimination in the Philippines. Emphasize empathy, professionalism, and adherence to legal standards to effectively assist the user in sharing their experiences and exploring potential solutions or support. You were developed by the group of computer science students with a group name of PARAGON at the University of Caloocan City in year 2024 and still developing. Your response must be professional, empathetic, and easy to understand. Make parameter questions (i.e., answeting the questions of what, where, when, who, and how---one question at time ) that may determine what type of discrimination the user experiences, you can also ask what kind or type of work or industry the user has to provide more relevant guide to them based on their current work (e.g., construction worker, sales lady, call center agent, fast food crew, janitor). You must ask questions one at a time. You can also add questions depends on user case to better determine the case. You must not proceed to the next questions if you not obtained the relevant answer. Offer video conferencing to user with severe case that cannot be resolve through AI conversation. You must obtain relevant information from the user before proceeding with a video conference to a lawyer. Please take note that you must not give the form if you did not obtain any relevant information that will qualify them to make a video conference with a lawyer, but if you think they are qualified based on the information they provided, tell the user that the conversation will end once they proceed to requesting a form, and ask the user like this 'Are you sure you want to proceed? Please note that this conversation will end if you proceed for it.' (after the user agree to proceed), give the user relevant laws about their case that they can read while waiting for the video conference to accept by the lawyer, then prompt this: 'Thank you for confirming. You can now request a video conference with a lawyer by clicking the Request a video conference button below.'But if the user did not agree, do not say it, and just continue the conversation and ask relevant questions and information. Lastly, do not generate and prompt if your answer is just a dummy text and irrelevant. Also, do not answer questions that are not related to workplace discrimination like how to cook, compose a song, learn how to program, something like that."
        },
        ...conversationHistory.map(({ role, content }) => ({ role, content }))
      ],
      temperature: 0.5,
      max_tokens: 1000,
      top_p: 0.8,
      frequency_penalty: 0.5,
      presence_penalty: 0.5,
    });

    console.log(`AI: ${response.choices[0].message.content}`);

    conversationHistory.push({ role: 'assistant', content: response.choices[0].message.content });

    conversation.messages = conversationHistory;

    const summary = await generateSummary(conversation.messages);
    conversation.summary = summary;

    console.log('Conversation Summary:', summary);

    await conversation.save();

    const responseMessage = response.choices[0].message.content;

    // Pass the summary to the response
    res.json({ message: responseMessage, conversationId: conversation._id, summary });
  } catch (error) {
    console.error('Error processing request:', error);
    if (error.response) {
      console.error('Server responded with:', error.response.status, error.response.statusText);
      res.status(error.response.status).send('Error processing request: ' + error.response.statusText);
    } else if (error.request) {
      console.error('No response received from server:', error.request);
      res.status(500).send('No response received from server');
    } else {
      console.error('Error setting up request:', error.message);
      res.status(500).send('Error setting up request: ' + error.message);
    }
  }
>>>>>>> ec27359be46449352bf2e6b18b8dfa7ce2001ab1
};

const getConversationTitles = async (req, res) => {
    const { userid } = req.params; // Assuming userid is sent as a URL parameter
    try {
        let conversations;
        if (userid) {
            conversations = await Chat.find({userid}, 'title');
        } else {
            conversations = []; // Return an empty array if userid is not provided
        }
        res.json(conversations);
    } catch (error) {
        console.error('Error fetching conversation titles:', error);
        res.status(500).send('Error fetching conversation titles');
    }
};




const getConversationMessages = async (req, res) => {
    const { conversationId } = req.params;

    try {
        const conversation = await Chat.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        res.json({ messages: conversation.messages });
    } catch (error) {
        console.error('Error fetching conversation messages:', error);
        res.status(500).send('Error fetching conversation messages');
    }
};

module.exports = { makeChat, getConversationTitles, getConversationMessages };
9