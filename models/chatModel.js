const mongoose = require('mongoose');
<<<<<<< HEAD
const Schema = mongoose.Schema;
// const SummaryTool = require('node-summary');
=======
const Schema = mongoose.Schema;                               
>>>>>>> 67b02e6b78e65d5a6418e4b1043276520229f858

const chatSchema = new Schema({
  title: { type: String, required: true },
  messages: [{ role: { type: String, required: true }, content: { type: String, required: true } }],
  summary: { type: String }, // Add a summary field
  createdAt: { type: Date, default: Date.now, required: true }
});

<<<<<<< HEAD
// Update summary before saving
chatSchema.pre('save', async function(next) {
  try {
    // Generate summary only if there are messages in the conversation
    if (this.messages.length > 0) {
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
});
=======
// // Update summary before saving
// chatSchema.pre('save', async function(next) {
//   try {
//     // Generate summary only if there are messages in the conversation
//     if (this.messages.length > 0) {
//       const summary = await generateSummary(this.messages);
//       this.summary = summary;
//     }
//     next();
//   } catch (error) {
//     next(error);
//   }
// });
>>>>>>> 67b02e6b78e65d5a6418e4b1043276520229f858

// // Define the generateSummary function
// const generateSummary = async (messages) => {
//   // Extract content from user and AI messages
//   const conversationText = messages.map(message => `${message.role}: ${message.content}`).join('\n');

//   return new Promise((resolve, reject) => {
//     SummaryTool.summarize("", conversationText, (err, summary) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(summary);
//       }
//     });
//   });
// };


module.exports = mongoose.model('Chat', chatSchema);
